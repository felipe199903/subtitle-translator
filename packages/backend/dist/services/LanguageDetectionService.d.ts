export declare class LanguageDetectionService {
    private supportedLanguages;
    detectLanguage(text: string): Promise<string>;
    private containsWords;
    getSupportedLanguages(): Record<string, string>;
    getLanguageName(code: string): string;
}
//# sourceMappingURL=LanguageDetectionService.d.ts.map