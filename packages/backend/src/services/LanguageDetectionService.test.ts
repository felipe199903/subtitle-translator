import { LanguageDetectionService } from './LanguageDetectionService';

describe('LanguageDetectionService', () => {
  let service: LanguageDetectionService;

  beforeEach(() => {
    service = new LanguageDetectionService();
  });

  describe('detectLanguage', () => {
    it('should detect English text', async () => {
      const englishText = 'The quick brown fox jumps over the lazy dog and they are happy with his friend';
      const result = await service.detectLanguage(englishText);
      expect(result).toBe('en');
    });

    it('should detect Portuguese text', async () => {
      const portugueseText = 'Você não sabe o que eu sei para com uma vida que é minha eu ser feliz';
      const result = await service.detectLanguage(portugueseText);
      expect(result).toBe('pt');
    });

    it('should default to English for unrecognized text', async () => {
      const result = await service.detectLanguage('xyz abc 123 def ghi');
      expect(result).toBe('en');
    });

    it('should return English for empty string', async () => {
      const result = await service.detectLanguage('');
      expect(result).toBe('en');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return supported language codes and names', () => {
      const langs = service.getSupportedLanguages();
      expect(langs).toHaveProperty('en');
      expect(langs).toHaveProperty('pt');
      expect(langs['en']).toBe('English');
      expect(langs['pt']).toBe('Portuguese');
    });
  });

  describe('getLanguageName', () => {
    it('should return language name for known code', () => {
      expect(service.getLanguageName('en')).toBe('English');
      expect(service.getLanguageName('pt')).toBe('Portuguese');
    });

    it('should return Unknown for unknown language code', () => {
      expect(service.getLanguageName('xx')).toBe('Unknown');
    });
  });
});
