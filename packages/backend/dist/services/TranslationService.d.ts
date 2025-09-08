export declare class TranslationService {
    private phrases;
    private words;
    translateText(text: string, targetLanguage?: string): Promise<string>;
    private replacePreservingCase;
    private translateWordByWord;
    private preserveCase;
    private makePlural;
    private capitalizeFirst;
    translateSubtitles(subtitles: any[]): Promise<any[]>;
    getSupportedLanguages(): string[];
}
//# sourceMappingURL=TranslationService.d.ts.map