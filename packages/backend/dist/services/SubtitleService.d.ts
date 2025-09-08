export interface SubtitleItem {
    index: number;
    startTime: string;
    endTime: string;
    text: string;
}
export interface TranslatedSubtitleItem extends SubtitleItem {
    translatedText: string;
}
export declare class SubtitleService {
    parseSRT(content: string): SubtitleItem[];
    generateSRT(subtitles: TranslatedSubtitleItem[]): string;
    validateSRTFormat(content: string): boolean;
    extractTextContent(subtitles: SubtitleItem[]): string;
}
//# sourceMappingURL=SubtitleService.d.ts.map