"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubtitleController = void 0;
const SubtitleService_1 = require("../services/SubtitleService");
const LanguageDetectionService_1 = require("../services/LanguageDetectionService");
const TranslationService_1 = require("../services/TranslationService");
const db_1 = require("../db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
class SubtitleController {
    constructor() {
        this.glossary = [];
        this.dict = {};
        this.tmIndex = [];
        this.uploadAndProcess = async (req, res) => {
            try {
                if (!req.file) {
                    res.status(400).json({ error: 'No file uploaded' });
                    return;
                }
                const fileContent = req.file.buffer.toString('utf-8');
                // Parse SRT content
                const subtitles = this.subtitleService.parseSRT(fileContent);
                // Detect language
                const detectedLanguage = await this.languageDetectionService.detectLanguage(subtitles.map(sub => sub.text).join(' '));
                // Extract text content
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
            catch (error) {
                console.error('Error processing subtitle file:', error);
                res.status(500).json({
                    error: 'Failed to process subtitle file',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.translateSubtitle = async (req, res) => {
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
                const translatedSubtitles = [];
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
            }
            catch (error) {
                console.error('❌ Error translating subtitles:', error);
                res.status(500).json({
                    error: 'Failed to translate subtitles',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.getSupportedLanguages = async (req, res) => {
            try {
                const languages = this.translationService.getSupportedLanguages();
                res.json({
                    success: true,
                    data: { languages }
                });
            }
            catch (error) {
                console.error('Error getting supported languages:', error);
                res.status(500).json({
                    error: 'Failed to get supported languages',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.debugTM = async (req, res) => {
            try {
                const action = req.query.action;
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
                        await (0, db_1.upsertTM)(en, pt);
                    }
                    console.log(`✅ Imported ${entries.length} TM entries`);
                    // Rebuild index
                    await this.buildTmIndex();
                }
                const allTM = await (0, db_1.getAllTM)();
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
            }
            catch (error) {
                console.error('❌ Debug TM error:', error);
                res.status(500).json({
                    error: 'Failed to debug TM',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.subtitleService = new SubtitleService_1.SubtitleService();
        this.languageDetectionService = new LanguageDetectionService_1.LanguageDetectionService();
        this.translationService = new TranslationService_1.TranslationService();
        // Load glossary and dictionary
        this.loadResources();
        // Build TM index
        this.buildTmIndex().catch(e => {
            console.error('❌ Failed to build TM index:', e);
        });
    }
    loadResources() {
        try {
            const glossaryPath = path_1.default.resolve(__dirname, '../glossary.json');
            const dictPath = path_1.default.resolve(__dirname, '../dict.json');
            if (fs_1.default.existsSync(glossaryPath)) {
                this.glossary = JSON.parse(fs_1.default.readFileSync(glossaryPath, 'utf8'));
            }
            if (fs_1.default.existsSync(dictPath)) {
                this.dict = JSON.parse(fs_1.default.readFileSync(dictPath, 'utf8'));
            }
        }
        catch (e) {
            console.warn('Could not load translation resources:', e);
        }
    }
    async buildTmIndex() {
        try {
            const rows = await (0, db_1.getAllTM)();
            this.tmIndex = rows.map((r) => ({
                src: r.src,
                srcNorm: r.src_norm || this.normalizeText(r.src),
                tgt: r.tgt,
                count: r.count
            }));
            console.log(`✅ TM index loaded with ${this.tmIndex.length} entries`);
        }
        catch (e) {
            console.error('❌ Could not build TM index:', e);
        }
    }
    normalizeText(s) {
        return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
    }
    applyGlossary(text) {
        const keys = this.glossary.map(g => g.source).sort((a, b) => b.length - a.length);
        let out = text;
        for (const k of keys) {
            const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b', 'gi');
            const g = this.glossary.find(x => x.source.toLowerCase() === k.toLowerCase());
            if (g)
                out = out.replace(re, g.target);
        }
        return out;
    }
    async queryTM(src) {
        const exact = await (0, db_1.queryTMExact)(src);
        if (exact)
            return { src: exact.src, tgt: exact.tgt, via: 'TM', score: 1 };
        // fuzzy search using in-memory index
        let best = null;
        const s1 = this.normalizeText(src);
        for (const r of this.tmIndex) {
            const s2 = r.srcNorm;
            const distance = fast_levenshtein_1.default.get(s1, s2);
            const maxLen = Math.max(s1.length, s2.length);
            const score = maxLen === 0 ? 1 : 1 - distance / maxLen;
            if (!best || score > best.score)
                best = { src: r.src, tgt: r.tgt, score };
        }
        if (best && best.score >= 0.9)
            return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score };
        if (best && best.score >= 0.75)
            return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score, review: true };
        return null;
    }
    queryDict(text) {
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
                if (t)
                    return { src: slice, tgt: t, via: 'DICT' };
            }
        }
        // Only fall back to single words if the text is very short
        if (words.length <= 2) {
            for (const word of words) {
                const t = this.dict[word.toLowerCase()];
                if (t)
                    return { src: word, tgt: t, via: 'DICT' };
            }
        }
        return null;
    }
    async translateWithTM(segments) {
        const results = [];
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
            }
            catch (e) {
                console.warn('Basic translation failed for:', seg, e);
            }
            // If all else fails, return original text (better than empty or fragments)
            results.push({ src: seg, tgt: seg, via: 'ORIGINAL' });
        }
        return results;
    }
}
exports.SubtitleController = SubtitleController;
//# sourceMappingURL=SubtitleController.js.map