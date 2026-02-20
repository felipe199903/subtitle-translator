import { SubtitleService, SubtitleItem, TranslatedSubtitleItem } from './SubtitleService';

describe('SubtitleService', () => {
  let service: SubtitleService;

  beforeEach(() => {
    service = new SubtitleService();
  });

  describe('parseSRT', () => {
    it('should parse a simple SRT file correctly', () => {
      const srtContent = `1
00:00:01,000 --> 00:00:03,000
Hello World

2
00:00:04,000 --> 00:00:06,000
How are you?
`;
      const result = service.parseSRT(srtContent);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        index: 1,
        startTime: '00:00:01,000',
        endTime: '00:00:03,000',
        text: 'Hello World',
      });
      expect(result[1]).toEqual({
        index: 2,
        startTime: '00:00:04,000',
        endTime: '00:00:06,000',
        text: 'How are you?',
      });
    });

    it('should parse multi-line subtitle text', () => {
      const srtContent = `1
00:00:01,000 --> 00:00:03,000
Line one
Line two
`;
      const result = service.parseSRT(srtContent);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Line one\nLine two');
    });

    it('should skip blocks without time range', () => {
      const srtContent = `1
Invalid block without time

2
00:00:04,000 --> 00:00:06,000
Valid subtitle
`;
      const result = service.parseSRT(srtContent);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Valid subtitle');
    });

    it('should return empty array for empty content', () => {
      expect(service.parseSRT('')).toEqual([]);
      expect(service.parseSRT('   ')).toEqual([]);
    });

    it('should handle Windows-style line endings (CRLF)', () => {
      const srtContent = '1\r\n00:00:01,000 --> 00:00:03,000\r\nHello World\r\n\r\n';
      const result = service.parseSRT(srtContent);
      expect(result).toHaveLength(1);
    });

    it('should preserve subtitle index correctly', () => {
      const srtContent = `5
00:01:00,000 --> 00:01:02,000
Test subtitle
`;
      const result = service.parseSRT(srtContent);
      expect(result[0].index).toBe(5);
    });

    it('should trim whitespace from text', () => {
      const srtContent = `1
00:00:01,000 --> 00:00:03,000
  Hello World  
`;
      const result = service.parseSRT(srtContent);
      expect(result[0].text).toBe('Hello World');
    });

    it('should handle SRT with HTML formatting tags', () => {
      const srtContent = `1
00:00:01,000 --> 00:00:03,000
<i>Italic text</i>

2
00:00:04,000 --> 00:00:06,000
<b>Bold text</b>
`;
      const result = service.parseSRT(srtContent);
      expect(result[0].text).toBe('<i>Italic text</i>');
      expect(result[1].text).toBe('<b>Bold text</b>');
    });
  });

  describe('generateSRT', () => {
    it('should generate valid SRT content from translated subtitles', () => {
      const subtitles: TranslatedSubtitleItem[] = [
        {
          index: 1,
          startTime: '00:00:01,000',
          endTime: '00:00:03,000',
          text: 'Hello World',
          translatedText: 'Olá Mundo',
        },
        {
          index: 2,
          startTime: '00:00:04,000',
          endTime: '00:00:06,000',
          text: 'How are you?',
          translatedText: 'Como você está?',
        },
      ];

      const result = service.generateSRT(subtitles);
      expect(result).toContain('1');
      expect(result).toContain('00:00:01,000 --> 00:00:03,000');
      expect(result).toContain('Olá Mundo');
      expect(result).toContain('2');
      expect(result).toContain('00:00:04,000 --> 00:00:06,000');
      expect(result).toContain('Como você está?');
    });

    it('should produce content that can be re-parsed', () => {
      const original: TranslatedSubtitleItem[] = [
        {
          index: 1,
          startTime: '00:00:01,000',
          endTime: '00:00:03,000',
          text: 'Hello World',
          translatedText: 'Olá Mundo',
        },
      ];

      const srtContent = service.generateSRT(original);
      const parsed = service.parseSRT(srtContent);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].index).toBe(1);
      expect(parsed[0].text).toBe('Olá Mundo');
    });
  });

  describe('validateSRTFormat', () => {
    it('should return true for valid SRT content', () => {
      const validSRT = `1
00:00:01,000 --> 00:00:03,000
Valid subtitle
`;
      expect(service.validateSRTFormat(validSRT)).toBe(true);
    });

    it('should return false for empty content', () => {
      expect(service.validateSRTFormat('')).toBe(false);
      expect(service.validateSRTFormat('  ')).toBe(false);
    });

    it('should return false for plain text without time codes', () => {
      expect(service.validateSRTFormat('Just some text without SRT format')).toBe(false);
    });

    it('should return true for multi-subtitle SRT', () => {
      const srt = `1
00:00:01,000 --> 00:00:03,000
First subtitle

2
00:00:04,000 --> 00:00:06,000
Second subtitle
`;
      expect(service.validateSRTFormat(srt)).toBe(true);
    });
  });

  describe('stripHtmlTags', () => {
    it('should strip italic tags and return plain text', () => {
      const { plainText, tags } = service.stripHtmlTags('<i>Hello World</i>');
      expect(plainText).toBe('Hello World');
      expect(tags).toHaveLength(2);
      expect(tags[0]).toEqual({ index: 0, tag: '<i>' });
      expect(tags[1]).toEqual({ index: 11, tag: '</i>' });
    });

    it('should handle text without tags', () => {
      const { plainText, tags } = service.stripHtmlTags('Plain text');
      expect(plainText).toBe('Plain text');
      expect(tags).toHaveLength(0);
    });

    it('should handle multiple tags', () => {
      const { plainText, tags } = service.stripHtmlTags('<b>Bold</b> and <i>italic</i>');
      expect(plainText).toBe('Bold and italic');
      expect(tags).toHaveLength(4);
    });

    it('should handle empty string', () => {
      const { plainText, tags } = service.stripHtmlTags('');
      expect(plainText).toBe('');
      expect(tags).toHaveLength(0);
    });
  });

  describe('restoreHtmlTags', () => {
    it('should restore tags to translated text', () => {
      const { plainText, tags } = service.stripHtmlTags('<i>Hello World</i>');
      const translated = 'Olá Mundo';
      const result = service.restoreHtmlTags(translated, tags, plainText.length);
      expect(result).toContain('<i>');
      expect(result).toContain('</i>');
      expect(result).toContain('Olá Mundo');
    });

    it('should return text unchanged when no tags', () => {
      const result = service.restoreHtmlTags('Olá Mundo', [], 10);
      expect(result).toBe('Olá Mundo');
    });
  });

  describe('extractTextContent', () => {
    it('should extract and join all subtitle texts', () => {
      const subtitles: SubtitleItem[] = [
        { index: 1, startTime: '00:00:01,000', endTime: '00:00:03,000', text: 'Hello' },
        { index: 2, startTime: '00:00:04,000', endTime: '00:00:06,000', text: 'World' },
      ];
      const result = service.extractTextContent(subtitles);
      expect(result).toBe('Hello World');
    });

    it('should return empty string for empty subtitles array', () => {
      expect(service.extractTextContent([])).toBe('');
    });
  });
});
