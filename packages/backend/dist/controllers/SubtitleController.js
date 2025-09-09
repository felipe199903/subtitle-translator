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
        // Training session storage (in production, use Redis or database)
        this.trainingSessions = new Map();
        this.uploadAndProcess = async (req, res) => {
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
                const detectedLanguage = await this.languageDetectionService.detectLanguage(subtitles.map(sub => sub.text).join(' '));
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
                    const srtContent = translatedSubtitles.map(sub => `${sub.index}\n${sub.startTime} --> ${sub.endTime}\n${sub.translatedText}\n`).join('\n');
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
                }
                else {
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
        // Training mode methods
        this.batchUploadForTraining = async (req, res) => {
            try {
                const files = req.files;
                if (!files || files.length === 0) {
                    res.status(400).json({
                        error: 'No files uploaded',
                        suggestion: 'Please select at least one .srt file'
                    });
                    return;
                }
                console.log(`🎓 Starting batch training with ${files.length} files`);
                // Generate session ID
                const sessionId = `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                // Initialize training session
                const session = {
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
                        message: 'Training started. Use the session ID to check progress.',
                        batchInfo: {
                            maxFilesPerBatch: 150,
                            currentBatch: files.length,
                            recommendedBatchSize: files.length > 100 ? 50 : files.length
                        }
                    }
                });
            }
            catch (error) {
                console.error('❌ Error starting training batch:', error);
                // Handle specific multer errors
                if (error instanceof Error) {
                    if (error.message.includes('Too many files') || error.message.includes('LIMIT_FILE_COUNT')) {
                        res.status(400).json({
                            error: 'Too many files in single batch',
                            details: error.message,
                            suggestion: 'Please upload files in smaller batches (max 150 files per batch). The frontend will automatically handle this.',
                            maxFilesAllowed: 150,
                            errorCode: 'LIMIT_FILE_COUNT'
                        });
                        return;
                    }
                    if (error.message.includes('File too large') || error.message.includes('LIMIT_FILE_SIZE')) {
                        res.status(400).json({
                            error: 'One or more files are too large',
                            details: error.message,
                            suggestion: 'Please ensure each file is smaller than 50MB',
                            maxFileSize: '50MB',
                            errorCode: 'LIMIT_FILE_SIZE'
                        });
                        return;
                    }
                }
                res.status(500).json({
                    error: 'Failed to start training batch',
                    details: error instanceof Error ? error.message : 'Unknown error',
                    suggestion: 'Please try again with fewer files or check the file formats'
                });
            }
        };
        this.getTrainingStatus = async (req, res) => {
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
                    autoApplicationResults: session.autoApplicationResults || null,
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
            }
            catch (error) {
                console.error('❌ Error getting training status:', error);
                res.status(500).json({
                    error: 'Failed to get training status',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.analyzeTrainingResults = async (req, res) => {
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
                const phraseFrequency = {};
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
                    mostCommon: data.translations.reduce((a, b) => data.translations.filter(t => t === a).length >= data.translations.filter(t => t === b).length ? a : b)
                }));
                // Language detection analysis
                const languageStats = session.results.reduce((acc, r) => {
                    acc[r.detectedLanguage] = (acc[r.detectedLanguage] || 0) + 1;
                    return acc;
                }, {});
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
            }
            catch (error) {
                console.error('❌ Error analyzing training results:', error);
                res.status(500).json({
                    error: 'Failed to analyze training results',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.improveDictionaryFromResults = async (req, res) => {
            try {
                const { sessionId, selectedPhrases, autoApprove = false } = req.body;
                const session = this.trainingSessions.get(sessionId);
                if (!session || session.status !== 'completed') {
                    res.status(400).json({ error: 'Training session not found or not completed' });
                    return;
                }
                console.log(`📚 Improving dictionary from session ${sessionId}`);
                let phrasesToAdd = [];
                if (selectedPhrases && Array.isArray(selectedPhrases)) {
                    // User selected specific phrases
                    phrasesToAdd = selectedPhrases;
                }
                else if (autoApprove) {
                    // Auto-approve high-frequency phrases
                    const allUniquePhrases = session.results.flatMap(r => r.uniquePhrases);
                    const phraseFrequency = {};
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
                        await (0, db_1.upsertTM)(phrase.original, phrase.translation);
                        addedToTM++;
                    }
                    catch (error) {
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
            }
            catch (error) {
                console.error('❌ Error improving dictionary:', error);
                res.status(500).json({
                    error: 'Failed to improve dictionary',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        // System metrics and training impact analysis
        this.getSystemMetrics = async (req, res) => {
            try {
                console.log('📊 Generating system metrics...');
                // Get Translation Memory statistics
                const allTM = await (0, db_1.getAllTM)();
                const tmStats = {
                    totalEntries: allTM.length,
                    recentEntries: allTM.filter((entry) => {
                        // Entries added in the last 24 hours (approximate)
                        return entry.count === 1; // New entries typically have count = 1
                    }).length,
                    highConfidenceEntries: allTM.filter((entry) => entry.count > 2).length
                };
                // Dictionary statistics
                const dictStats = {
                    totalPhrases: Object.keys(this.dict).length,
                    phrasesByLength: {
                        single: Object.keys(this.dict).filter(k => k.split(' ').length === 1).length,
                        multi: Object.keys(this.dict).filter(k => k.split(' ').length > 1).length
                    }
                };
                // Training sessions summary
                const completedSessions = Array.from(this.trainingSessions.values())
                    .filter(session => session.status === 'completed');
                const trainingStats = {
                    totalSessions: completedSessions.length,
                    totalFilesProcessed: completedSessions.reduce((sum, s) => sum + s.totalFiles, 0),
                    totalPhrasesLearned: completedSessions.reduce((sum, s) => sum + s.results.reduce((rSum, r) => rSum + r.uniquePhrases.length, 0), 0),
                    lastTrainingDate: completedSessions.length > 0
                        ? completedSessions[completedSessions.length - 1].endTime
                        : null
                };
                // Performance indicators
                const performanceStats = {
                    tmIndexSize: this.tmIndex.length,
                    averageTranslationMethods: this.calculateAverageTranslationMethods(completedSessions)
                };
                // System health indicators
                const systemHealth = {
                    tmDatabase: allTM.length > 0 ? 'healthy' : 'needs_data',
                    dictionary: Object.keys(this.dict).length > 100 ? 'healthy' : 'needs_expansion',
                    trainingData: completedSessions.length > 0 ? 'trained' : 'not_trained'
                };
                res.json({
                    success: true,
                    data: {
                        timestamp: new Date().toISOString(),
                        translationMemory: tmStats,
                        dictionary: dictStats,
                        training: trainingStats,
                        performance: performanceStats,
                        systemHealth,
                        recommendations: this.generateSystemRecommendations(tmStats, dictStats, trainingStats)
                    }
                });
            }
            catch (error) {
                console.error('❌ Error getting system metrics:', error);
                res.status(500).json({
                    error: 'Failed to get system metrics',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        // Massive training monitoring
        this.getMassiveTrainingStats = async (req, res) => {
            try {
                console.log('📊 Getting massive training stats...');
                // Get all active sessions
                const activeSessions = Array.from(this.trainingSessions.values())
                    .filter(session => session.status === 'processing');
                // Get completed sessions from last batch
                const recentCompleted = Array.from(this.trainingSessions.values())
                    .filter(session => session.status === 'completed')
                    .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
                    .slice(0, 10); // Last 10 completed sessions
                // Calculate progress across all active sessions
                const totalFiles = activeSessions.reduce((sum, session) => sum + session.totalFiles, 0);
                const processedFiles = activeSessions.reduce((sum, session) => sum + session.processedFiles, 0);
                const overallProgress = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
                // Calculate learning statistics from recent sessions
                let totalNewPhrases = 0;
                let totalProcessedSubtitles = 0;
                let totalApiTranslations = 0;
                recentCompleted.forEach(session => {
                    session.results.forEach(result => {
                        totalNewPhrases += result.uniquePhrases.length;
                        totalProcessedSubtitles += result.totalSubtitles;
                        totalApiTranslations += result.translationStats.apiTranslations;
                    });
                });
                // Estimate completion time (rough calculation based on current progress)
                let estimatedCompletion = null;
                if (activeSessions.length > 0 && totalFiles > processedFiles) {
                    const avgSessionStartTime = activeSessions.reduce((sum, s) => sum + s.startTime.getTime(), 0) / activeSessions.length;
                    const elapsedMinutes = (Date.now() - avgSessionStartTime) / (1000 * 60);
                    const progressRate = processedFiles / elapsedMinutes;
                    const remainingFiles = totalFiles - processedFiles;
                    const estimatedRemainingMinutes = remainingFiles / progressRate;
                    estimatedCompletion = new Date(Date.now() + estimatedRemainingMinutes * 60 * 1000);
                }
                const stats = {
                    activeSessions: {
                        count: activeSessions.length,
                        totalFiles,
                        processedFiles,
                        overallProgress,
                        estimatedCompletion
                    },
                    recentLearning: {
                        phrasesLearned: totalNewPhrases,
                        subtitlesProcessed: totalProcessedSubtitles,
                        apiCallsMade: totalApiTranslations,
                        completedSessions: recentCompleted.length
                    },
                    systemStatus: {
                        tmEntriesCount: this.tmIndex.length,
                        dictionarySize: Object.keys(this.dict).length,
                        isLearning: activeSessions.length > 0,
                        lastUpdate: new Date()
                    }
                };
                res.json({
                    success: true,
                    data: stats,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                console.error('❌ Error getting massive training stats:', error);
                res.status(500).json({
                    error: 'Failed to get massive training stats',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        // Training impact comparison
        this.compareTrainingImpact = async (req, res) => {
            try {
                const { beforeSessionId, afterSessionId } = req.body;
                if (!beforeSessionId || !afterSessionId) {
                    res.status(400).json({
                        error: 'Both beforeSessionId and afterSessionId are required'
                    });
                    return;
                }
                const beforeSession = this.trainingSessions.get(beforeSessionId);
                const afterSession = this.trainingSessions.get(afterSessionId);
                if (!beforeSession || !afterSession) {
                    res.status(404).json({
                        error: 'One or both training sessions not found'
                    });
                    return;
                }
                // Calculate improvement metrics
                const beforeStats = this.calculateSessionStats(beforeSession);
                const afterStats = this.calculateSessionStats(afterSession);
                const improvement = {
                    tmHitRateImprovement: afterStats.tmHitRate - beforeStats.tmHitRate,
                    dictHitRateImprovement: afterStats.dictHitRate - beforeStats.dictHitRate,
                    apiUsageReduction: beforeStats.apiUsageRate - afterStats.apiUsageRate,
                    overallImprovement: (afterStats.tmHitRate + afterStats.dictHitRate) -
                        (beforeStats.tmHitRate + beforeStats.dictHitRate)
                };
                res.json({
                    success: true,
                    data: {
                        before: beforeStats,
                        after: afterStats,
                        improvement,
                        summary: this.generateImprovementSummary(improvement)
                    }
                });
            }
            catch (error) {
                console.error('❌ Error comparing training impact:', error);
                res.status(500).json({
                    error: 'Failed to compare training impact',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        // Resource management endpoints
        this.reloadResources = async (req, res) => {
            try {
                console.log('🔄 Manual resource reload requested...');
                await this.reloadAllResources();
                res.json({
                    success: true,
                    data: {
                        message: 'All resources reloaded successfully',
                        dictionarySize: Object.keys(this.dict).length,
                        tmSize: this.tmIndex.length,
                        glossarySize: this.glossary.length,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            catch (error) {
                console.error('❌ Error reloading resources:', error);
                res.status(500).json({
                    error: 'Failed to reload resources',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        this.testTranslation = async (req, res) => {
            try {
                const { text = "Hello world", targetLanguage = "pt-BR" } = req.query;
                console.log(`🧪 Testing translation for: "${text}"`);
                // Test all translation methods
                const tmResult = await this.queryTM(text);
                const dictResult = this.queryDict(text);
                const glossaryApplied = this.applyGlossary(text);
                // Test the full translation pipeline
                const fullTranslation = await this.translateWithTM([text]);
                res.json({
                    success: true,
                    data: {
                        originalText: text,
                        targetLanguage,
                        testResults: {
                            tmQuery: tmResult,
                            dictQuery: dictResult,
                            glossaryApplied,
                            fullPipeline: fullTranslation[0],
                            systemStatus: {
                                dictionarySize: Object.keys(this.dict).length,
                                tmSize: this.tmIndex.length,
                                glossarySize: this.glossary.length
                            }
                        },
                        timestamp: new Date().toISOString()
                    }
                });
            }
            catch (error) {
                console.error('❌ Error testing translation:', error);
                res.status(500).json({
                    error: 'Failed to test translation',
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
        try {
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
        catch (error) {
            console.warn('TM query failed, continuing without TM:', error);
            return null;
        }
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
    async processTrainingBatch(sessionId, files) {
        const session = this.trainingSessions.get(sessionId);
        if (!session)
            return;
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
                const detectedLanguage = await this.languageDetectionService.detectLanguage(subtitles.map(sub => sub.text).join(' '));
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
                const result = {
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
            }
            catch (error) {
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
        // Auto-apply learned phrases to improve system
        try {
            console.log(`🤖 Auto-applying learned phrases from training session ${sessionId}...`);
            console.log(`📋 Session has ${session.results.length} files processed`);
            const totalPhrases = session.results.reduce((sum, r) => sum + r.uniquePhrases.length, 0);
            console.log(`📋 Total unique phrases collected: ${totalPhrases}`);
            await this.autoApplyLearnedPhrases(session);
            console.log(`✅ Auto-application process completed for session ${sessionId}`);
        }
        catch (error) {
            console.error(`⚠️ Error auto-applying learned phrases for session ${sessionId}:`, error);
            console.error(`Stack trace:`, error instanceof Error ? error.stack : 'No stack trace');
        }
    }
    generateRecommendations(candidates, langStats, avgRate) {
        const recommendations = [];
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
    async saveDictionary() {
        try {
            const dictPath = path_1.default.resolve(__dirname, '../dict.json');
            fs_1.default.writeFileSync(dictPath, JSON.stringify(this.dict, null, 2), 'utf8');
            console.log(`💾 Dictionary saved with ${Object.keys(this.dict).length} entries`);
            // Force reload resources after saving to ensure they're available immediately
            this.loadResources();
            console.log(`🔄 Resources reloaded after dictionary update`);
        }
        catch (error) {
            console.error('❌ Failed to save dictionary:', error);
        }
    }
    /**
     * Force reload all translation resources (dict, glossary, TM)
     * Call this after making changes to ensure they're applied immediately
     */
    async reloadAllResources() {
        console.log('🔄 Reloading all translation resources...');
        // Reload dictionary and glossary
        this.loadResources();
        // Rebuild TM index
        await this.buildTmIndex();
        console.log(`✅ All resources reloaded: Dictionary=${Object.keys(this.dict).length}, TM=${this.tmIndex.length}`);
    }
    /**
     * Automatically apply high-confidence learned phrases from a training session
     */
    async autoApplyLearnedPhrases(session) {
        console.log(`🧠 Analyzing ${session.results.length} files for auto-application...`);
        // Collect all unique phrases from the session
        const allUniquePhrases = session.results.flatMap(r => r.uniquePhrases);
        console.log(`📊 Total unique phrases found: ${allUniquePhrases.length}`);
        if (allUniquePhrases.length === 0) {
            console.log('ℹ️ No new phrases to apply');
            return;
        }
        // Analyze phrase frequency across files
        const phraseFrequency = {};
        allUniquePhrases.forEach(phrase => {
            const key = phrase.original.toLowerCase().trim();
            if (!phraseFrequency[key]) {
                phraseFrequency[key] = { count: 0, translations: [], files: [], consistency: 0 };
            }
            phraseFrequency[key].count++;
            if (!phraseFrequency[key].translations.includes(phrase.translated)) {
                phraseFrequency[key].translations.push(phrase.translated);
            }
        });
        // Calculate consistency score for each phrase
        Object.keys(phraseFrequency).forEach(key => {
            const data = phraseFrequency[key];
            data.consistency = data.count / data.translations.length; // Higher = more consistent
        });
        // Auto-apply high-confidence phrases (relaxed criteria for better learning)
        const AUTO_APPLY_THRESHOLD = {
            minFrequency: 1, // Appeared at least 1 time (relaxed)
            minConsistency: 1.0, // Perfect consistency (relaxed)
            minLength: 3, // At least 3 characters
            maxLength: 100 // Not too long
        };
        let addedToDict = 0;
        let addedToTM = 0;
        let skippedCount = 0;
        console.log(`🎯 Applying relaxed auto-selection criteria: freq≥${AUTO_APPLY_THRESHOLD.minFrequency}, consistency≥${AUTO_APPLY_THRESHOLD.minConsistency}, length 3-100 chars`);
        console.log(`📊 Total candidates to analyze: ${Object.keys(phraseFrequency).length}`);
        for (const [original, data] of Object.entries(phraseFrequency)) {
            // Check if phrase meets auto-apply criteria
            if (data.count >= AUTO_APPLY_THRESHOLD.minFrequency &&
                data.consistency >= AUTO_APPLY_THRESHOLD.minConsistency &&
                original.length >= AUTO_APPLY_THRESHOLD.minLength &&
                original.length <= AUTO_APPLY_THRESHOLD.maxLength) {
                // Use the most common translation
                const mostCommonTranslation = data.translations[0]; // First one is most common in simple cases
                try {
                    // Add to dictionary
                    this.dict[original.toLowerCase()] = mostCommonTranslation;
                    addedToDict++;
                    // Add to Translation Memory
                    await (0, db_1.upsertTM)(original, mostCommonTranslation);
                    addedToTM++;
                    console.log(`✅ Auto-applied: "${original}" → "${mostCommonTranslation}" (freq: ${data.count}, consistency: ${data.consistency.toFixed(1)})`);
                }
                catch (error) {
                    console.warn(`⚠️ Failed to auto-apply "${original}":`, error);
                }
            }
            else {
                // Log why it wasn't auto-applied for debugging
                const reasons = [];
                if (data.count < AUTO_APPLY_THRESHOLD.minFrequency)
                    reasons.push(`low frequency (${data.count})`);
                if (data.consistency < AUTO_APPLY_THRESHOLD.minConsistency)
                    reasons.push(`low consistency (${data.consistency.toFixed(1)})`);
                if (original.length < AUTO_APPLY_THRESHOLD.minLength)
                    reasons.push('too short');
                if (original.length > AUTO_APPLY_THRESHOLD.maxLength)
                    reasons.push('too long');
                skippedCount++;
                // Only log first 10 skipped phrases to avoid spam
                if (skippedCount <= 10 && reasons.length > 0) {
                    console.log(`⏭️ Skipped "${original}": ${reasons.join(', ')}`);
                }
            }
        }
        // Save updated dictionary and rebuild TM index
        if (addedToDict > 0 || addedToTM > 0) {
            await this.saveDictionary();
            await this.buildTmIndex();
            // Force a complete resource reload to ensure all changes are active
            console.log('🔧 Forcing complete resource reload...');
            await this.reloadAllResources();
            console.log(`🎉 Auto-application completed! Added ${addedToDict} phrases to dictionary, ${addedToTM} to TM`);
            console.log(`📈 New system size: Dictionary=${Object.keys(this.dict).length}, TM=${this.tmIndex.length}`);
            console.log(`✅ Resources reloaded and ready for immediate use`);
        }
        else {
            console.log(`ℹ️ No phrases met the auto-application criteria out of ${Object.keys(phraseFrequency).length} candidates`);
            console.log(`📊 Summary: ${skippedCount} skipped, ${addedToDict} applied to dictionary, ${addedToTM} applied to TM`);
        }
        // Update session with application results
        session.autoApplicationResults = {
            candidatePhrases: Object.keys(phraseFrequency).length,
            appliedPhrases: addedToDict,
            dictionarySize: Object.keys(this.dict).length,
            tmSize: this.tmIndex.length,
            timestamp: new Date()
        };
    }
    calculateAverageTranslationMethods(sessions) {
        if (sessions.length === 0)
            return null;
        const totals = sessions.reduce((acc, session) => {
            session.results.forEach(result => {
                acc.tmHits += result.translationStats.tmHits;
                acc.dictHits += result.translationStats.dictHits;
                acc.apiTranslations += result.translationStats.apiTranslations;
                acc.skipped += result.translationStats.skipped;
                acc.total += result.totalSubtitles;
            });
            return acc;
        }, { tmHits: 0, dictHits: 0, apiTranslations: 0, skipped: 0, total: 0 });
        const performanceData = {
            tmHitRate: totals.total > 0 ? (totals.tmHits / totals.total * 100).toFixed(1) + '%' : '0%',
            dictHitRate: totals.total > 0 ? (totals.dictHits / totals.total * 100).toFixed(1) + '%' : '0%',
            apiUsageRate: totals.total > 0 ? (totals.apiTranslations / totals.total * 100).toFixed(1) + '%' : '0%',
            skipRate: totals.total > 0 ? (totals.skipped / totals.total * 100).toFixed(1) + '%' : '0%',
            totalProcessed: totals.total,
            lastUpdated: new Date().toISOString()
        };
        return performanceData;
    }
    generateSystemRecommendations(tmStats, dictStats, trainingStats) {
        const recommendations = [];
        // Check if recent training sessions applied phrases automatically
        const recentSessions = Array.from(this.trainingSessions.values())
            .filter(s => s.status === 'completed' && s.endTime)
            .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0));
        const lastSession = recentSessions[0];
        const autoApplicationResults = lastSession ? lastSession.autoApplicationResults : null;
        if (autoApplicationResults) {
            if (autoApplicationResults.appliedPhrases > 0) {
                recommendations.push(`🎉 Latest training automatically applied ${autoApplicationResults.appliedPhrases} new phrases to improve translation quality!`);
            }
            else {
                recommendations.push(`⚠️ Latest training found ${autoApplicationResults.candidatePhrases} candidate phrases but none met auto-application criteria. Consider manual review.`);
            }
        }
        if (tmStats.totalEntries < 500) {
            recommendations.push('💡 Consider running more training sessions to reach 500+ TM entries for better coverage');
        }
        if (dictStats.totalPhrases < 200) {
            recommendations.push('📚 Dictionary needs expansion - upload more diverse content to reach 200+ phrases');
        }
        if (trainingStats.totalSessions === 0) {
            recommendations.push('🚀 No training completed yet. Start with batch training to unlock automatic improvements');
        }
        if (trainingStats.totalSessions > 0 && trainingStats.totalPhrasesLearned > 100) {
            recommendations.push(`📈 System learned ${trainingStats.totalPhrasesLearned} phrases from ${trainingStats.totalSessions} training sessions. Performance should be improving!`);
        }
        if (tmStats.totalEntries > 1000 && dictStats.totalPhrases > 500) {
            recommendations.push('✅ System is well-trained! Expect high-quality translations for similar content types');
        }
        return recommendations;
    }
    calculateSessionStats(session) {
        const totals = session.results.reduce((acc, result) => {
            acc.tmHits += result.translationStats.tmHits;
            acc.dictHits += result.translationStats.dictHits;
            acc.apiTranslations += result.translationStats.apiTranslations;
            acc.skipped += result.translationStats.skipped;
            acc.total += result.totalSubtitles;
            return acc;
        }, { tmHits: 0, dictHits: 0, apiTranslations: 0, skipped: 0, total: 0 });
        return {
            totalSubtitles: totals.total,
            tmHitRate: totals.total > 0 ? (totals.tmHits / totals.total * 100) : 0,
            dictHitRate: totals.total > 0 ? (totals.dictHits / totals.total * 100) : 0,
            apiUsageRate: totals.total > 0 ? (totals.apiTranslations / totals.total * 100) : 0,
            skipRate: totals.total > 0 ? (totals.skipped / totals.total * 100) : 0
        };
    }
    generateImprovementSummary(improvement) {
        if (improvement.overallImprovement > 10) {
            return 'Excellent improvement! Training significantly enhanced translation quality.';
        }
        else if (improvement.overallImprovement > 5) {
            return 'Good improvement! System learned new patterns effectively.';
        }
        else if (improvement.overallImprovement > 0) {
            return 'Modest improvement detected. Consider more diverse training data.';
        }
        else {
            return 'No significant improvement. Try training with different types of content.';
        }
    }
}
exports.SubtitleController = SubtitleController;
//# sourceMappingURL=SubtitleController.js.map