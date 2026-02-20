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

  /**
   * Strips HTML tags from subtitle text, returning the plain text and the tag positions
   * so they can be restored after translation.
   */
  stripHtmlTags(text: string): { plainText: string; tags: Array<{ index: number; tag: string }> } {
    const tags: Array<{ index: number; tag: string }> = [];
    let plainText = '';
    const tagRegex = /<[^>]+>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(text)) !== null) {
      plainText += text.slice(lastIndex, match.index);
      tags.push({ index: plainText.length, tag: match[0] });
      lastIndex = match.index + match[0].length;
    }
    plainText += text.slice(lastIndex);

    return { plainText, tags };
  }

  /**
   * Restores HTML tags into translated text based on their relative positions.
   */
  restoreHtmlTags(translatedText: string, tags: Array<{ index: number; tag: string }>, originalLength: number): string {
    if (tags.length === 0) return translatedText;
    if (originalLength === 0) return translatedText;

    const scale = translatedText.length / originalLength;
    let result = translatedText;
    let offset = 0;

    for (const { index, tag } of tags) {
      const scaledIndex = Math.round(index * scale) + offset;
      const insertAt = Math.min(scaledIndex, result.length);
      result = result.slice(0, insertAt) + tag + result.slice(insertAt);
      offset += tag.length;
    }

    return result;
  }
}
