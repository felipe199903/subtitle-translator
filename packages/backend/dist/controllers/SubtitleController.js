"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubtitleController = void 0;
const SubtitleService_1 = require("../services/SubtitleService");
const LanguageDetectionService_1 = require("../services/LanguageDetectionService");
const TranslationService_1 = require("../services/TranslationService");
class SubtitleController {
    constructor() {
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
                // Translate each subtitle
                const translatedSubtitles = [];
                for (const subtitle of subtitles) {
                    console.log(`🔤 Translating: "${subtitle.text}"`);
                    const translatedText = await this.translationService.translateText(subtitle.text, targetLanguage);
                    console.log(`✅ Translated to: "${translatedText}"`);
                    translatedSubtitles.push({
                        ...subtitle,
                        translatedText
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
        this.subtitleService = new SubtitleService_1.SubtitleService();
        this.languageDetectionService = new LanguageDetectionService_1.LanguageDetectionService();
        this.translationService = new TranslationService_1.TranslationService();
    }
}
exports.SubtitleController = SubtitleController;
//# sourceMappingURL=SubtitleController.js.map