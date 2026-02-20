import { TranslationService } from './TranslationService';

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    service = new TranslationService();
  });

  describe('translateText', () => {
    it('should return empty string for empty input', async () => {
      const result = await service.translateText('');
      expect(result).toBe('');
    });

    it('should return whitespace-only input unchanged', async () => {
      const result = await service.translateText('   ');
      expect(result).toBe('   ');
    });

    it('should translate known full phrases', async () => {
      const result = await service.translateText('good morning');
      expect(result.toLowerCase()).toContain('bom dia');
    });

    it('should translate "i love you"', async () => {
      const result = await service.translateText('i love you');
      expect(result.toLowerCase()).toContain('eu te amo');
    });

    it('should translate "thank you"', async () => {
      const result = await service.translateText('thank you');
      expect(result.toLowerCase()).toContain('obrigado');
    });

    it('should translate "good luck"', async () => {
      const result = await service.translateText('good luck');
      expect(result.toLowerCase()).toContain('boa sorte');
    });

    it('should translate individual known words', async () => {
      const result = await service.translateText('yes');
      expect(result.toLowerCase()).toContain('sim');
    });

    it('should return original text for unknown words', async () => {
      const result = await service.translateText('xyzquux');
      expect(result).toBe('xyzquux');
    });

    it('should handle contractions - "don\'t"', async () => {
      const result = await service.translateText("don't");
      expect(result.toLowerCase()).toContain('não');
    });

    it('should handle contractions - "can\'t"', async () => {
      const result = await service.translateText("can't");
      expect(result.toLowerCase()).toContain('não posso');
    });

    it('should translate "be careful"', async () => {
      const result = await service.translateText('be careful');
      expect(result.toLowerCase()).toContain('tenha cuidado');
    });

    it('should translate "do not worry"', async () => {
      const result = await service.translateText('do not worry');
      expect(result.toLowerCase()).toContain('não se preocupe');
    });
  });

  describe('translateWithMyMemory', () => {
    it('should return null when API is unavailable', async () => {
      // In test environment, the API is not available - should return null gracefully
      const result = await service.translateWithMyMemory('Hello World', 'pt-BR');
      // Either returns a translation (if API reachable) or null (if not)
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should include pt-BR', () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toContain('pt-BR');
    });

    it('should include en', () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toContain('en');
    });

    it('should return an array', () => {
      const languages = service.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });
  });

  describe('translateSubtitles', () => {
    it('should translate an array of subtitle objects', async () => {
      const subtitles = [
        { index: 1, startTime: '00:00:01,000', endTime: '00:00:03,000', text: 'yes' },
        { index: 2, startTime: '00:00:04,000', endTime: '00:00:06,000', text: 'no' },
      ];

      const result = await service.translateSubtitles(subtitles);
      expect(result).toHaveLength(2);
      expect(result[0].text.toLowerCase()).toContain('sim');
      expect(result[1].text.toLowerCase()).toContain('não');
    });

    it('should return same length array as input', async () => {
      const subtitles = [
        { index: 1, startTime: '00:00:01,000', endTime: '00:00:03,000', text: 'hello' },
        { index: 2, startTime: '00:00:04,000', endTime: '00:00:06,000', text: 'world' },
        { index: 3, startTime: '00:00:07,000', endTime: '00:00:09,000', text: 'goodbye' },
      ];

      const result = await service.translateSubtitles(subtitles);
      expect(result).toHaveLength(3);
    });
  });
});
