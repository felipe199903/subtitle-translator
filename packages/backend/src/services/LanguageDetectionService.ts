const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'you', 'that', 'is', 'to', 'of', 'it', 'what', 'this', 'we', 'are', 'have', 'don\'t', 'i\'m', 'with', 'your', 'just'],
  pt: ['que', 'não', 'você', 'para', 'com', 'uma', 'um', 'é', 'eu', 'isso', 'está', 'mas', 'por', 'se', 'meu', 'ele', 'vou', 'aqui'],
  es: ['que', 'no', 'el', 'la', 'es', 'y', 'en', 'lo', 'un', 'por', 'qué', 'me', 'una', 'te', 'los', 'se', 'está', 'pero'],
  fr: ['je', 'de', 'est', 'pas', 'le', 'vous', 'la', 'tu', 'que', 'un', 'il', 'et', 'ce', 'ne', 'les', 'on', 'une', 'c\'est'],
  de: ['der', 'die', 'und', 'ich', 'das', 'ist', 'nicht', 'du', 'es', 'sie', 'wir', 'zu', 'ein', 'mit', 'was', 'den', 'auf', 'mir'],
  it: ['che', 'non', 'di', 'il', 'è', 'la', 'un', 'per', 'mi', 'sono', 'ma', 'ti', 'cosa', 'lo', 'questo', 'una', 'bene', 'come'],
};

const NAMES: Record<string, string> = {
  en: 'Inglês', pt: 'Português', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano',
};

export class LanguageDetectionService {
  /**
   * Scores each language by the share of words that are among its most common
   * words and returns the best one, or 'unknown' when nothing stands out.
   */
  detectLanguage(text: string): string {
    const words = text
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .split(/[^\p{L}']+/u)
      .filter(Boolean)
      .slice(0, 5000);
    if (words.length === 0) return 'unknown';

    let best = 'unknown';
    let bestScore = 0;
    for (const [lang, list] of Object.entries(STOPWORDS)) {
      const set = new Set(list);
      const score = words.filter(w => set.has(w)).length / words.length;
      if (score > bestScore) {
        best = lang;
        bestScore = score;
      }
    }
    return bestScore >= 0.05 ? best : 'unknown';
  }

  getLanguageName(code: string): string {
    return NAMES[code] ?? 'Desconhecido';
  }
}
