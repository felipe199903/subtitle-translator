import { Request, Response } from 'express';
import { SubtitleService } from '../services/SubtitleService';
import { LanguageDetectionService } from '../services/LanguageDetectionService';
import { TranslationService } from '../services/TranslationService';
import { queryTMExact, getAllTM, upsertTM } from '../db';
import fs from 'fs';
import path from 'path';
import levenshtein from 'fast-levenshtein';

// Training interfaces
interface TrainingFile {
  filename: string;
  content: string;
  buffer: Buffer;
}

interface TrainingSession {
  sessionId: string;
  totalFiles: number;
  processedFiles: number;
  status: 'processing' | 'completed' | 'error';
  results: TrainingResult[];
  startTime: Date;
  endTime?: Date;
  error?: string;
}

interface TrainingResult {
  filename: string;
  totalSubtitles: number;
  translatedSubtitles: number;
  detectedLanguage: string;
  translationStats: {
    tmHits: number;
    dictHits: number;
    apiTranslations: number;
    skipped: number;
  };
  uniquePhrases: Array<{
    original: string;
    translated: string;
    method: string;
  }>;
}

export class SubtitleController {
  private subtitleService: SubtitleService;
  private languageDetectionService: LanguageDetectionService;
  private translationService: TranslationService;
  private glossary: Array<{ source: string; target: string }> = [];
  private dict: Record<string, string> = {};
  private tmIndex: Array<{ src: string; srcNorm: string; tgt: string; count: number }> = [];
  
  // Training session storage (in production, use Redis or database)
  private trainingSessions: Map<string, TrainingSession> = new Map();

  constructor() {
    this.subtitleService = new SubtitleService();
    this.languageDetectionService = new LanguageDetectionService();
    this.translationService = new TranslationService();
    
    // Load glossary and dictionary
    this.loadResources();
    // Build TM index
    this.buildTmIndex().catch(e => {
      console.error('❌ Failed to build TM index:', e);
    });
  }

  private loadResources() {
    try {
      const glossaryPath = path.resolve(__dirname, '../glossary.json');
      const dictPath = path.resolve(__dirname, '../dict.json');
      
      if (fs.existsSync(glossaryPath)) {
        this.glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
      }
      
      if (fs.existsSync(dictPath)) {
        this.dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      }
    } catch (e) {
      console.warn('Could not load translation resources:', e);
    }
  }

  private async buildTmIndex() {
    try {
      const rows = await getAllTM();
      this.tmIndex = rows.map((r: any) => ({ 
        src: r.src, 
        srcNorm: r.src_norm || this.normalizeText(r.src), 
        tgt: r.tgt, 
        count: r.count 
      }));
      console.log(`✅ TM index loaded with ${this.tmIndex.length} entries`);
    } catch (e) {
      console.error('❌ Could not build TM index:', e);
    }
  }

  private normalizeText(s: string) {
    return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
  }

  private applyGlossary(text: string) {
    const keys = this.glossary.map(g => g.source).sort((a, b) => b.length - a.length);
    let out = text;
    for (const k of keys) {
      const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b', 'gi');
      const g = this.glossary.find(x => x.source.toLowerCase() === k.toLowerCase());
      if (g) out = out.replace(re, g.target);
    }
    return out;
  }

  private async queryTM(src: string) {
    try {
      const exact = await queryTMExact(src);
      if (exact) return { src: exact.src, tgt: exact.tgt, via: 'TM', score: 1 };

      // fuzzy search using in-memory index
      let best: any = null;
      const s1 = this.normalizeText(src);
      for (const r of this.tmIndex) {
        const s2 = r.srcNorm;
        const distance = levenshtein.get(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);
        const score = maxLen === 0 ? 1 : 1 - distance / maxLen;
        if (!best || score > best.score) best = { src: r.src, tgt: r.tgt, score };
      }
      if (best && best.score >= 0.9) return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score };
      if (best && best.score >= 0.75) return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score, review: true };
      return null;
    } catch (error) {
      console.warn('TM query failed, continuing without TM:', error);
      return null;
    }
  }

  private queryDict(text: string) {
    // First try exact match for the complete text
    const exactMatch = this.dict[text.toLowerCase()];
    if (exactMatch) {
      return { src: text, tgt: exactMatch, via: 'DICT' };
    }
    
    // Then try progressively smaller phrases (prioritize longer matches)
    const words = text.split(/\s+/);
    for (let size = Math.min(words.length, 8); size >= 3; size--) { // Only try phrases of 3+ words
      for (let i = 0; i + size <= words.length; i++) {
        const slice = words.slice(i, i + size).join(' ');
        const t = this.dict[slice.toLowerCase()];
        if (t) return { src: slice, tgt: t, via: 'DICT' };
      }
    }
    
    // Only fall back to single words if the text is very short
    if (words.length <= 2) {
      for (const word of words) {
        const t = this.dict[word.toLowerCase()];
        if (t) return { src: word, tgt: t, via: 'DICT' };
      }
    }
    
    return null;
  }

  private async translateWithTM(segments: string[]): Promise<any[]> {
    const results: any[] = [];
    
    for (const seg of segments) {
      // Skip empty or very short segments
      if (!seg || seg.trim().length < 2) {
        results.push({ src: seg, tgt: seg, via: 'SKIP' });
        continue;
      }

      // First check TM with original text (before glossary changes it)
      const tm = await this.queryTM(seg);
      if (tm) {
        // Apply glossary to the TM translation result
        const glossaryResult = this.applyGlossary(tm.tgt);
        results.push({ src: seg, tgt: glossaryResult, via: tm.via, score: tm.score || 1 });
        continue;
      }

      // If no TM match, apply glossary to source and try dictionary
      let workingText = this.applyGlossary(seg);
      
      const d = this.queryDict(workingText);
      if (d) {
        results.push({ src: seg, tgt: d.tgt, via: d.via });
        continue;
      }

      // Try basic translation service as fallback for meaningful content
      try {
        const basicTranslation = await this.translationService.translateText(seg, 'pt-BR');
        if (basicTranslation && basicTranslation !== seg && basicTranslation.length > 0) {
          results.push({ src: seg, tgt: basicTranslation, via: 'API' });
          continue;
        }
      } catch (e) {
        console.warn('Basic translation failed for:', seg, e);
      }

      // If all else fails, return original text (better than empty or fragments)
      results.push({ src: seg, tgt: seg, via: 'ORIGINAL' });
    }
    return results;
  }

  uploadAndProcess = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const targetLanguage = req.body.targetLanguage;
      
      // Parse SRT content
      const subtitles = this.subtitleService.parseSRT(fileContent);
      
      // Detect language
      const detectedLanguage = await this.languageDetectionService.detectLanguage(
        subtitles.map(sub => sub.text).join(' ')
      );

      // If targetLanguage is provided, translate the subtitles
      if (targetLanguage) {
        console.log(`🔄 Starting translation of ${subtitles.length} subtitles to ${targetLanguage}`);
        
        const segments = subtitles.map(sub => sub.text);
        const enhancedResults = await this.translateWithTM(segments);
        
        const translatedSubtitles = subtitles.map((sub, index) => ({
          index: sub.index,
          text: sub.text,
          startTime: sub.startTime,
          endTime: sub.endTime,
          translatedText: enhancedResults[index]?.tgt || sub.text
        }));

        const srtContent = translatedSubtitles.map(sub => 
          `${sub.index}\n${sub.startTime} --> ${sub.endTime}\n${sub.translatedText}\n`
        ).join('\n');

        res.json({
          success: true,
          data: {
            originalLanguage: detectedLanguage,
            targetLanguage: targetLanguage,
            translatedSubtitles: translatedSubtitles,
            srtContent: srtContent,
            totalSubtitles: subtitles.length
          }
        });
      } else {
        // Just process without translation
        const textContent = subtitles.map(sub => ({
          index: sub.index,
          text: sub.text,
          startTime: sub.startTime,
          endTime: sub.endTime
        }));

        res.json({
          success: true,
          data: {
            originalLanguage: detectedLanguage,
            subtitles: textContent,
            totalSubtitles: subtitles.length
          }
        });
      }
    } catch (error) {
      console.error('Error processing subtitle file:', error);
      res.status(500).json({ 
        error: 'Failed to process subtitle file',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  translateSubtitle = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔄 Translation request received');
      const { subtitles, targetLanguage = 'pt-BR' } = req.body;

      if (!subtitles || !Array.isArray(subtitles)) {
        console.log('❌ Invalid subtitles data');
        res.status(400).json({ error: 'Invalid subtitles data' });
        return;
      }

      console.log(`🔄 Starting translation of ${subtitles.length} subtitles to ${targetLanguage}`);

      // Use the enhanced translation service with TM/dictionary/fuzzy matching
      const segments = subtitles.map(sub => sub.text);
      
      // Call our enhanced translation logic (from server.js)
      const enhancedResults = await this.translateWithTM(segments);

      // Map results back to subtitle format
      const translatedSubtitles: any[] = [];
      for (let i = 0; i < subtitles.length; i++) {
        const subtitle = subtitles[i];
        const result = enhancedResults[i];
        
        console.log(`🔤 "${subtitle.text}" -> "${result.tgt}" (via ${result.via})`);
        
        translatedSubtitles.push({
          ...subtitle,
          translatedText: result.tgt || subtitle.text // fallback to original if no translation
        });
      }

      console.log('📝 Generating SRT content...');
      // Generate new SRT content
      const translatedSRTContent = this.subtitleService.generateSRT(translatedSubtitles);

      console.log('✅ Translation completed successfully');
      res.json({
        success: true,
        data: {
          translatedSubtitles,
          srtContent: translatedSRTContent,
          targetLanguage
        }
      });
    } catch (error) {
      console.error('❌ Error translating subtitles:', error);
      res.status(500).json({ 
        error: 'Failed to translate subtitles',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getSupportedLanguages = async (req: Request, res: Response): Promise<void> => {
    try {
      const languages = this.translationService.getSupportedLanguages();
      res.json({
        success: true,
        data: { languages }
      });
    } catch (error) {
      console.error('Error getting supported languages:', error);
      res.status(500).json({ 
        error: 'Failed to get supported languages',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  debugTM = async (req: Request, res: Response): Promise<void> => {
    try {
      const action = req.query.action as string;
      
      if (action === 'import') {
        // Import the expected TM entries manually
        console.log('🔧 Manual TM import...');
        const entries = [
          ['Hello world', 'Olá mundo'],
          ['This is a test subtitle', 'Isto é uma legenda de teste'], 
          ['How are you?', 'Como você está?'],
          ['Computer', 'Computador'],
          ['Subtitle', 'Legenda']
        ];
        
        for (const [en, pt] of entries) {
          await upsertTM(en, pt);
        }
        console.log(`✅ Imported ${entries.length} TM entries`);
        
        // Rebuild index
        await this.buildTmIndex();
      }
      
      const allTM = await getAllTM();
      console.log('🔍 Current TM entries:', allTM.length);
      
      res.json({
        success: true,
        data: {
          tmCount: allTM.length,
          tmIndex: this.tmIndex.length,
          sampleEntries: allTM.slice(0, 10),
          environment: {
            TM_DB_PATH: process.env.TM_DB_PATH,
            NODE_ENV: process.env.NODE_ENV
          }
        }
      });
    } catch (error) {
      console.error('❌ Debug TM error:', error);
      res.status(500).json({ 
        error: 'Failed to debug TM',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // Training mode methods
  batchUploadForTraining = async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      console.log(`🎓 Starting batch training with ${files.length} files`);

      // Generate session ID
      const sessionId = `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Initialize training session
      const session: TrainingSession = {
        sessionId,
        totalFiles: files.length,
        processedFiles: 0,
        status: 'processing',
        results: [],
        startTime: new Date()
      };

      this.trainingSessions.set(sessionId, session);

      // Process files asynchronously
      this.processTrainingBatch(sessionId, files).catch(error => {
        console.error(`❌ Training session ${sessionId} failed:`, error);
        const session = this.trainingSessions.get(sessionId);
        if (session) {
          session.status = 'error';
          session.error = error.message;
          session.endTime = new Date();
        }
      });

      res.json({
        success: true,
        data: {
          sessionId,
          totalFiles: files.length,
          message: 'Training started. Use the session ID to check progress.'
        }
      });

    } catch (error) {
      console.error('❌ Error starting training batch:', error);
      res.status(500).json({ 
        error: 'Failed to start training batch',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  private async processTrainingBatch(sessionId: string, files: Express.Multer.File[]): Promise<void> {
    const session = this.trainingSessions.get(sessionId);
    if (!session) return;

    console.log(`🎓 Processing ${files.length} files for training session ${sessionId}`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        console.log(`📁 Processing file ${i + 1}/${files.length}: ${file.originalname}`);
        
        const fileContent = file.buffer.toString('utf-8');
        const subtitles = this.subtitleService.parseSRT(fileContent);
        
        if (subtitles.length === 0) {
          console.warn(`⚠️ Skipping empty file: ${file.originalname}`);
          session.processedFiles++;
          continue;
        }

        // Detect language
        const detectedLanguage = await this.languageDetectionService.detectLanguage(
          subtitles.map(sub => sub.text).join(' ')
        );

        // Translate using existing logic
        const segments = subtitles.map(sub => sub.text);
        const translationResults = await this.translateWithTM(segments);

        // Analyze results
        const stats = {
          tmHits: translationResults.filter(r => r.via === 'TM' || r.via === 'FUZZY').length,
          dictHits: translationResults.filter(r => r.via === 'DICT').length,
          apiTranslations: translationResults.filter(r => r.via === 'API').length,
          skipped: translationResults.filter(r => r.via === 'SKIP' || r.via === 'ORIGINAL').length
        };

        // Extract unique phrases for dictionary improvement
        const uniquePhrases = translationResults
          .filter(r => r.via === 'API' && r.src !== r.tgt && r.src.trim().length > 2)
          .map(r => ({
            original: r.src,
            translated: r.tgt,
            method: r.via
          }));

        const result: TrainingResult = {
          filename: file.originalname,
          totalSubtitles: subtitles.length,
          translatedSubtitles: translationResults.filter(r => r.via !== 'SKIP').length,
          detectedLanguage,
          translationStats: stats,
          uniquePhrases
        };

        session.results.push(result);
        session.processedFiles++;

        console.log(`✅ Processed ${file.originalname}: ${result.totalSubtitles} subtitles, ${uniquePhrases.length} new phrases`);

      } catch (error) {
        console.error(`❌ Error processing file ${file.originalname}:`, error);
        session.results.push({
          filename: file.originalname,
          totalSubtitles: 0,
          translatedSubtitles: 0,
          detectedLanguage: 'unknown',
          translationStats: { tmHits: 0, dictHits: 0, apiTranslations: 0, skipped: 1 },
          uniquePhrases: []
        });
        session.processedFiles++;
      }
    }

    session.status = 'completed';
    session.endTime = new Date();
    
    console.log(`🎉 Training session ${sessionId} completed! Processed ${session.processedFiles}/${session.totalFiles} files`);
  }

  getTrainingStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const session = this.trainingSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Training session not found' });
        return;
      }

      // Calculate summary stats
      const summary = {
        totalFiles: session.totalFiles,
        processedFiles: session.processedFiles,
        status: session.status,
        progress: session.totalFiles > 0 ? (session.processedFiles / session.totalFiles) * 100 : 0,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.endTime 
          ? session.endTime.getTime() - session.startTime.getTime() 
          : Date.now() - session.startTime.getTime(),
        totalSubtitles: session.results.reduce((sum, r) => sum + r.totalSubtitles, 0),
        totalTranslated: session.results.reduce((sum, r) => sum + r.translatedSubtitles, 0),
        totalUniquePhrases: session.results.reduce((sum, r) => sum + r.uniquePhrases.length, 0),
        translationStats: session.results.reduce((acc, r) => ({
          tmHits: acc.tmHits + r.translationStats.tmHits,
          dictHits: acc.dictHits + r.translationStats.dictHits,
          apiTranslations: acc.apiTranslations + r.translationStats.apiTranslations,
          skipped: acc.skipped + r.translationStats.skipped
        }), { tmHits: 0, dictHits: 0, apiTranslations: 0, skipped: 0 }),
        error: session.error
      };

      res.json({
        success: true,
        data: {
          sessionId,
          summary,
          recentResults: session.results.slice(-5) // Last 5 processed files
        }
      });

    } catch (error) {
      console.error('❌ Error getting training status:', error);
      res.status(500).json({ 
        error: 'Failed to get training status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  analyzeTrainingResults = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body;
      const session = this.trainingSessions.get(sessionId);

      if (!session || session.status !== 'completed') {
        res.status(400).json({ error: 'Training session not found or not completed' });
        return;
      }

      console.log(`📊 Analyzing training results for session ${sessionId}`);

      // Analyze all unique phrases
      const allUniquePhrases = session.results.flatMap(r => r.uniquePhrases);
      
      // Group by frequency
      const phraseFrequency: Record<string, { count: number; translations: string[]; files: string[] }> = {};
      
      allUniquePhrases.forEach(phrase => {
        const key = phrase.original.toLowerCase().trim();
        if (!phraseFrequency[key]) {
          phraseFrequency[key] = { count: 0, translations: [], files: [] };
        }
        phraseFrequency[key].count++;
        if (!phraseFrequency[key].translations.includes(phrase.translated)) {
          phraseFrequency[key].translations.push(phrase.translated);
        }
      });

      // Find the most common phrases that could improve the dictionary
      const candidatesForDictionary = Object.entries(phraseFrequency)
        .filter(([original, data]) => data.count >= 2 && original.length >= 3) // Appeared at least twice
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 100) // Top 100 candidates
        .map(([original, data]) => ({
          original,
          frequency: data.count,
          translations: data.translations,
          mostCommon: data.translations.reduce((a, b) => 
            data.translations.filter(t => t === a).length >= data.translations.filter(t => t === b).length ? a : b
          )
        }));

      // Language detection analysis
      const languageStats = session.results.reduce((acc, r) => {
        acc[r.detectedLanguage] = (acc[r.detectedLanguage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Performance analysis
      const avgTranslationRate = session.results.reduce((sum, r) => {
        const rate = r.totalSubtitles > 0 ? r.translatedSubtitles / r.totalSubtitles : 0;
        return sum + rate;
      }, 0) / session.results.length;

      const analysis = {
        totalFiles: session.results.length,
        totalUniquePhrases: allUniquePhrases.length,
        dictionaryCandidates: candidatesForDictionary,
        languageDistribution: languageStats,
        averageTranslationRate: avgTranslationRate,
        recommendations: this.generateRecommendations(candidatesForDictionary, languageStats, avgTranslationRate)
      };

      res.json({
        success: true,
        data: analysis
      });

    } catch (error) {
      console.error('❌ Error analyzing training results:', error);
      res.status(500).json({ 
        error: 'Failed to analyze training results',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  private generateRecommendations(candidates: any[], langStats: Record<string, number>, avgRate: number): string[] {
    const recommendations: string[] = [];

    if (candidates.length > 50) {
      recommendations.push(`Consider adding ${candidates.length} new phrases to dictionary for better coverage`);
    }

    if (avgRate < 0.8) {
      recommendations.push('Translation rate is below 80%. Consider expanding glossary and TM database');
    }

    const dominantLang = Object.keys(langStats).reduce((a, b) => langStats[a] > langStats[b] ? a : b);
    if (langStats[dominantLang] / Object.values(langStats).reduce((a, b) => a + b, 0) > 0.8) {
      recommendations.push(`Most files are in ${dominantLang}. Consider specialized training for this language`);
    }

    return recommendations;
  }

  improveDictionaryFromResults = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, selectedPhrases, autoApprove = false } = req.body;
      const session = this.trainingSessions.get(sessionId);

      if (!session || session.status !== 'completed') {
        res.status(400).json({ error: 'Training session not found or not completed' });
        return;
      }

      console.log(`📚 Improving dictionary from session ${sessionId}`);

      let phrasesToAdd: Array<{ original: string; translation: string }> = [];

      if (selectedPhrases && Array.isArray(selectedPhrases)) {
        // User selected specific phrases
        phrasesToAdd = selectedPhrases;
      } else if (autoApprove) {
        // Auto-approve high-frequency phrases
        const allUniquePhrases = session.results.flatMap(r => r.uniquePhrases);
        const phraseFrequency: Record<string, { count: number; translation: string }> = {};
        
        allUniquePhrases.forEach(phrase => {
          const key = phrase.original.toLowerCase().trim();
          if (!phraseFrequency[key] || phraseFrequency[key].count < 1) {
            phraseFrequency[key] = { count: 0, translation: phrase.translated };
          }
          phraseFrequency[key].count++;
        });

        phrasesToAdd = Object.entries(phraseFrequency)
          .filter(([original, data]) => data.count >= 3 && original.length >= 3) // High confidence
          .map(([original, data]) => ({ original, translation: data.translation }));
      }

      // Add to dictionary and TM
      let addedToDict = 0;
      let addedToTM = 0;

      for (const phrase of phrasesToAdd) {
        try {
          // Add to dictionary
          this.dict[phrase.original.toLowerCase()] = phrase.translation;
          addedToDict++;

          // Add to Translation Memory
          await upsertTM(phrase.original, phrase.translation);
          addedToTM++;

        } catch (error) {
          console.warn(`⚠️ Failed to add phrase "${phrase.original}":`, error);
        }
      }

      // Save updated dictionary
      await this.saveDictionary();
      
      // Rebuild TM index
      await this.buildTmIndex();

      console.log(`✅ Dictionary improved: ${addedToDict} phrases added to dict, ${addedToTM} to TM`);

      res.json({
        success: true,
        data: {
          addedToDict,
          addedToTM,
          totalDictSize: Object.keys(this.dict).length,
          totalTMSize: this.tmIndex.length
        }
      });

    } catch (error) {
      console.error('❌ Error improving dictionary:', error);
      res.status(500).json({ 
        error: 'Failed to improve dictionary',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  private async saveDictionary(): Promise<void> {
    try {
      const dictPath = path.resolve(__dirname, '../dict.json');
      fs.writeFileSync(dictPath, JSON.stringify(this.dict, null, 2), 'utf8');
      console.log(`💾 Dictionary saved with ${Object.keys(this.dict).length} entries`);
    } catch (error) {
      console.error('❌ Failed to save dictionary:', error);
    }
  }
}
