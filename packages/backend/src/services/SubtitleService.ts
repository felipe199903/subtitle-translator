export interface SubtitleItem {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface TranslatedSubtitleItem extends SubtitleItem {
  translatedText: string;
}

export class SubtitleService {
  parseSRT(content: string): SubtitleItem[] {
    const subtitles: SubtitleItem[] = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

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

  generateSRT(subtitles: TranslatedSubtitleItem[]): string {
    return subtitles.map(subtitle => {
      return [
        subtitle.index,
        `${subtitle.startTime} --> ${subtitle.endTime}`,
        subtitle.translatedText,
        ''
      ].join('\n');
    }).join('\n');
  }

  validateSRTFormat(content: string): boolean {
    try {
      const subtitles = this.parseSRT(content);
      return subtitles.length > 0;
    } catch {
      return false;
    }
  }

  extractTextContent(subtitles: SubtitleItem[]): string {
    return subtitles.map(sub => sub.text).join(' ');
  }
}
