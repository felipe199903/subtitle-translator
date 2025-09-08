export class LanguageDetectionService {
  private supportedLanguages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic'
  };

  async detectLanguage(text: string): Promise<string> {
    try {
      // Simple language detection based on common words and patterns
      // In a production environment, you would use a proper language detection library
      const lowercaseText = text.toLowerCase();
      
      // English patterns
      if (this.containsWords(lowercaseText, ['the', 'and', 'you', 'that', 'was', 'for', 'are', 'with', 'his', 'they'])) {
        return 'en';
      }
      
      // Spanish patterns
      if (this.containsWords(lowercaseText, ['que', 'de', 'no', 'la', 'el', 'en', 'y', 'es', 'se', 'te'])) {
        return 'es';
      }
      
      // Portuguese patterns
      if (this.containsWords(lowercaseText, ['que', 'de', 'não', 'você', 'para', 'com', 'uma', 'é', 'eu', 'ser'])) {
        return 'pt';
      }
      
      // French patterns
      if (this.containsWords(lowercaseText, ['que', 'de', 'je', 'est', 'pas', 'le', 'vous', 'la', 'tu', 'il'])) {
        return 'fr';
      }
      
      // German patterns
      if (this.containsWords(lowercaseText, ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'])) {
        return 'de';
      }
      
      // Italian patterns
      if (this.containsWords(lowercaseText, ['che', 'di', 'la', 'il', 'e', 'per', 'una', 'in', 'con', 'non'])) {
        return 'it';
      }

      // Default to English if no pattern matches
      return 'en';
    } catch (error) {
      console.error('Error detecting language:', error);
      return 'en'; // Default fallback
    }
  }

  private containsWords(text: string, words: string[]): boolean {
    const wordCount = words.filter(word => text.includes(` ${word} `) || text.startsWith(`${word} `) || text.endsWith(` ${word}`)).length;
    return wordCount >= 3; // Require at least 3 matching words
  }

  getSupportedLanguages(): Record<string, string> {
    return this.supportedLanguages;
  }

  getLanguageName(code: string): string {
    return this.supportedLanguages[code as keyof typeof this.supportedLanguages] || 'Unknown';
  }
}
