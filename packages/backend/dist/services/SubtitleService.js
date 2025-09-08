"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubtitleService = void 0;
class SubtitleService {
    parseSRT(content) {
        const subtitles = [];
        const blocks = content.trim().split(/\n\s*\n/);
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 3)
                continue;
            const index = parseInt(lines[0]);
            const timeRange = lines[1];
            const text = lines.slice(2).join('\n');
            if (!isNaN(index) && timeRange.includes('-->')) {
                const [startTime, endTime] = timeRange.split(' --> ');
                subtitles.push({
                    index,
                    startTime: startTime.trim(),
                    endTime: endTime.trim(),
                    text: text.trim()
                });
            }
        }
        return subtitles;
    }
    generateSRT(subtitles) {
        return subtitles.map(subtitle => {
            return [
                subtitle.index,
                `${subtitle.startTime} --> ${subtitle.endTime}`,
                subtitle.translatedText,
                ''
            ].join('\n');
        }).join('\n');
    }
    validateSRTFormat(content) {
        try {
            const subtitles = this.parseSRT(content);
            return subtitles.length > 0;
        }
        catch {
            return false;
        }
    }
    extractTextContent(subtitles) {
        return subtitles.map(sub => sub.text).join(' ');
    }
}
exports.SubtitleService = SubtitleService;
//# sourceMappingURL=SubtitleService.js.map