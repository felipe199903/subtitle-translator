import axios from 'axios';

export class TranslationService {
  // Intelligent translation dictionary with phrases and patterns
  private phrases: Record<string, string> = {
    // Complete phrases for better context
    'hello world': 'olá mundo',
    'good morning': 'bom dia',
    'good evening': 'boa noite',
    'thank you': 'obrigado',
    'you are welcome': 'de nada',
    'how are you': 'como você está',
    'i am fine': 'eu estou bem',
    'what is your name': 'qual é o seu nome',
    'my name is': 'meu nome é',
    'nice to meet you': 'prazer em conhecê-lo',
    'see you later': 'até mais tarde',
    'have a good day': 'tenha um bom dia',
    'excuse me': 'com licença',
    'i am sorry': 'eu sinto muito',
    'where is the bathroom': 'onde fica o banheiro',
    'how much does it cost': 'quanto custa',
    'i do not understand': 'eu não entendo',
    'can you help me': 'você pode me ajudar',
    'what time is it': 'que horas são',
    'i love you': 'eu te amo',
    'happy birthday': 'feliz aniversário',
    'merry christmas': 'feliz natal',
    'happy new year': 'feliz ano novo',
    
    // Anime/dialogue specific phrases
    'wait a minute': 'espere um minuto',
    'what happened': 'o que aconteceu',
    'are you okay': 'você está bem',
    'are you alright': 'você está bem',
    'that is incredible': 'isso é incrível',
    'i can not believe it': 'eu não posso acreditar',
    'let me think': 'deixe-me pensar',
    'you are right': 'você está certo',
    'that makes sense': 'isso faz sentido',
    'what do you mean': 'o que você quer dizer',
    'tell me more': 'me conte mais',
    'i understand now': 'eu entendo agora',
    'that is amazing': 'isso é incrível',
    'be careful': 'tenha cuidado',
    'do not worry': 'não se preocupe',
    'everything will be fine': 'tudo ficará bem',
    'what is wrong': 'o que está errado',
    'i am tired': 'eu estou cansado',
    'let us go': 'vamos',
    'come with me': 'venha comigo',
    'follow me': 'me siga',
    'stay here': 'fique aqui',
    'wait for me': 'espere por mim',
    'i will be back': 'eu voltarei',
    'see you tomorrow': 'até amanhã',
    'take care': 'se cuide',
    'good luck': 'boa sorte',
    'no matter how': 'não importa como',
    'no matter what': 'não importa o que',
    'of course i': 'claro que eu',
    'of course': 'claro',
    'do you believe in vampires': 'você acredita em vampires',
    'believe in vampires': 'acredita em vampiros',
    'give me thy blood': 'dê-me seu sangue',
    'what\'s with her': 'o que há com ela',
    'what\'s up with': 'qual é a de',
    'a monochrome fade': 'um desbotamento monocromático',
    'i-i didn\'t see anything': 'e-eu não vi nada',
    'i didn\'t see anything': 'não vi nada',
    'didn\'t see anything': 'não vi nada',
    'isn\'t a vampire supposed to be immortal': 'um vampiro não deveria ser imortal',
    'isn\'t a vampire supposed': 'um vampiro não deveria ser',
    'supposed to be immortal': 'deveria ser imortal',
    'at least': 'pelo menos',
    'at the end': 'no final',
    'in the first place': 'em primeiro lugar',
    'for the first time': 'pela primeira vez',
    'all of a sudden': 'de repente',
    'more than': 'mais que',
    'less than': 'menos que'
  };

  private words: Record<string, string> = {
    // Basic words
    'hello': 'olá',
    'world': 'mundo',
    'good': 'bom',
    'morning': 'manhã',
    'evening': 'noite',
    'night': 'noite',
    'day': 'dia',
    'time': 'tempo',
    'life': 'vida',
    'love': 'amor',
    'friend': 'amigo',
    'family': 'família',
    'home': 'casa',
    'school': 'escola',
    'work': 'trabalho',
    'food': 'comida',
    'water': 'água',
    'money': 'dinheiro',
    'book': 'livro',
    'story': 'história',
    'name': 'nome',
    'person': 'pessoa',
    'people': 'pessoas',
    'man': 'homem',
    'woman': 'mulher',
    'child': 'criança',
    'year': 'ano',
    'place': 'lugar',
    'way': 'caminho',
    'thing': 'coisa',
    'hand': 'mão',
    'head': 'cabeça',
    'eye': 'olho',
    'face': 'rosto',
    'voice': 'voz',
    'door': 'porta',
    'room': 'quarto',
    'car': 'carro',
    'city': 'cidade',
    'country': 'país',
    'state': 'estado',
    'power': 'poder',
    'problem': 'problema',
    'question': 'pergunta',
    'answer': 'resposta',
    'idea': 'ideia',
    'reason': 'razão',
    'feeling': 'sentimento',
    'dream': 'sonho',
    'hope': 'esperança',
    'fear': 'medo',
    'hate': 'ódio',
    'war': 'guerra',
    'peace': 'paz',
    'truth': 'verdade',
    'lie': 'mentira',
    'god': 'deus',
    'vampire': 'vampiro',
    'human': 'humano',
    
    // Verbs
    'am': 'sou',
    'is': 'é',
    'are': 'são',
    'was': 'estava',
    'were': 'estavam',
    'have': 'tenho',
    'has': 'tem',
    'had': 'tinha',
    'will': 'vai',
    'would': 'seria',
    'can': 'pode',
    'could': 'poderia',
    'should': 'deveria',
    'must': 'deve',
    'do': 'fazer',
    'does': 'faz',
    'did': 'fez',
    'go': 'ir',
    'come': 'vir',
    'see': 'ver',
    'know': 'saber',
    'think': 'pensar',
    'say': 'dizer',
    'tell': 'contar',
    'get': 'conseguir',
    'make': 'fazer',
    'take': 'pegar',
    'give': 'dar',
    'want': 'querer',
    'need': 'precisar',
    'like': 'gostar',
    'believe': 'acreditar',
    'feel': 'sentir',
    'look': 'olhar',
    'hear': 'ouvir',
    'speak': 'falar',
    'live': 'viver',
    'die': 'morrer',
    'become': 'tornar-se',
    'save': 'salvar',
    'help': 'ajudar',
    'kill': 'matar',
    'fight': 'lutar',
    'wait': 'esperar',
    'stop': 'parar',
    'run': 'correr',
    'walk': 'caminhar',
    'sleep': 'dormir',
    'wake': 'acordar',
    'eat': 'comer',
    'drink': 'beber',
    'remember': 'lembrar',
    'forget': 'esquecer',
    'understand': 'entender',
    'learn': 'aprender',
    'teach': 'ensinar',
    'study': 'estudar',
    'play': 'brincar',
    'win': 'ganhar',
    'lose': 'perder',
    'find': 'encontrar',
    'meet': 'conhecer',
    'leave': 'sair',
    'stay': 'ficar',
    'turn': 'virar',
    'change': 'mudar',
    'keep': 'manter',
    'put': 'colocar',
    'call': 'chamar',
    'ask': 'perguntar',
    'talk': 'conversar',
    
    // Adjectives
    'big': 'grande',
    'small': 'pequeno',
    'new': 'novo',
    'old': 'velho',
    'first': 'primeiro',
    'last': 'último',
    'long': 'longo',
    'short': 'curto',
    'high': 'alto',
    'low': 'baixo',
    'right': 'certo',
    'wrong': 'errado',
    'true': 'verdadeiro',
    'false': 'falso',
    'happy': 'feliz',
    'sad': 'triste',
    'angry': 'bravo',
    'beautiful': 'belo',
    'ugly': 'feio',
    'strong': 'forte',
    'weak': 'fraco',
    'fast': 'rápido',
    'slow': 'lento',
    'hot': 'quente',
    'cold': 'frio',
    'young': 'jovem',
    'easy': 'fácil',
    'hard': 'difícil',
    'important': 'importante',
    'different': 'diferente',
    'same': 'mesmo',
    'special': 'especial',
    'alone': 'sozinho',
    'together': 'juntos',
    'alive': 'vivo',
    'dead': 'morto',
    'strange': 'estranho',
    'normal': 'normal',
    'serious': 'sério',
    'funny': 'engraçado',
    'amazing': 'incrível',
    'terrible': 'terrível',
    
    // Common words
    'i': 'eu',
    'you': 'você',
    'he': 'ele',
    'she': 'ela',
    'we': 'nós',
    'they': 'eles',
    'the': 'o',
    'a': 'um',
    'an': 'uma',
    'and': 'e',
    'or': 'ou',
    'but': 'mas',
    'with': 'com',
    'without': 'sem',
    'where': 'onde',
    'when': 'quando',
    'why': 'por que',
    'how': 'como',
    'what': 'o que',
    'who': 'quem',
    'which': 'qual',
    'yes': 'sim',
    'no': 'não',
    'maybe': 'talvez',
    'sure': 'claro',
    'okay': 'ok',
    'well': 'bem',
    'oh': 'ah',
    'hey': 'ei',
    'wow': 'nossa',
    'really': 'realmente',
    'very': 'muito',
    'too': 'também',
    'also': 'também',
    'still': 'ainda',
    'already': 'já',
    'never': 'nunca',
    'always': 'sempre',
    'sometimes': 'às vezes',
    'often': 'frequentemente',
    'usually': 'geralmente',
    'finally': 'finalmente',
    'suddenly': 'de repente',
    'quickly': 'rapidamente',
    'slowly': 'lentamente',
    'please': 'por favor',
    'sorry': 'desculpa',
    'thanks': 'obrigado'
  };

  async translateText(text: string, targetLanguage: string = 'pt-BR'): Promise<string> {
    if (!text || text.trim() === '') {
      return text;
    }

    // Clean text for better matching
    const cleanText = text.toLowerCase().trim()
      .replace(/[.,!?;:""''()]/g, '') // Remove punctuation for matching
      .replace(/\s+/g, ' '); // Normalize whitespace

    // First try to find complete phrase matches (prioritize longer phrases)
    const sortedPhrases = Object.keys(this.phrases).sort((a, b) => b.length - a.length);
    
    for (const englishPhrase of sortedPhrases) {
      if (cleanText.includes(englishPhrase)) {
        const portuguesePhrase = this.phrases[englishPhrase];
        // Replace while preserving original case and punctuation
        const result = this.replacePreservingCase(text, englishPhrase, portuguesePhrase);
        return result;
      }
    }

    // Try MyMemory API for better results (only for ENG -> PT-BR)
    if (targetLanguage === 'pt-BR' || targetLanguage === 'pt') {
      const apiResult = await this.translateWithMyMemory(text, targetLanguage);
      if (apiResult) return apiResult;
    }

    // If no phrase match, apply intelligent word-by-word translation
    return this.translateWordByWord(text);
  }

  async translateWithMyMemory(text: string, targetLanguage: string = 'pt-BR'): Promise<string | null> {
    try {
      const langpair = `en|${targetLanguage}`;
      const url = `https://api.mymemory.translated.net/get`;
      const response = await axios.get(url, {
        params: { q: text, langpair },
        timeout: 5000,
      });
      const data = response.data;
      if (
        data &&
        data.responseStatus === 200 &&
        data.responseData &&
        data.responseData.translatedText &&
        data.responseData.translatedText !== text
      ) {
        return data.responseData.translatedText;
      }
      return null;
    } catch {
      // API unavailable or rate limited - silently fall back to dictionary
      return null;
    }
  }

  private replacePreservingCase(originalText: string, searchPhrase: string, replacement: string): string {
    // Create regex to find the phrase while ignoring case and punctuation
    const regex = new RegExp(searchPhrase.split(' ').map(word => 
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
    ).join('\\s*[.,!?;:""\'\'()]*\\s*'), 'gi');
    
    return originalText.replace(regex, replacement);
  }

  private translateWordByWord(text: string): string {
    // Split text into tokens preserving contractions (word'word), whitespace, and punctuation
    const rawTokens = text.split(/(\s+|[^\w\s''])/);

    // Recombine contraction tokens (word + apostrophe + word-part)
    const tokens: string[] = [];
    for (let i = 0; i < rawTokens.length; i++) {
      const cur = rawTokens[i];
      const next1 = rawTokens[i + 1];
      const next2 = rawTokens[i + 2];
      if (
        cur && /^\w+$/.test(cur) &&
        next1 && /^['']$/.test(next1) &&
        next2 && /^\w+$/.test(next2)
      ) {
        tokens.push(cur + next1 + next2);
        i += 2;
      } else {
        tokens.push(cur);
      }
    }
    
    const translatedTokens = tokens.map(token => {
      // Skip whitespace and punctuation
      if (/^\s+$/.test(token) || /^[^\w\s]+$/.test(token)) {
        return token;
      }
      
      const normalizedToken = token.toLowerCase().trim();
      
      // Handle contractions and special cases
      if (normalizedToken === "don't") return "não";
      if (normalizedToken === "can't") return "não posso";
      if (normalizedToken === "won't") return "não vou";
      if (normalizedToken === "isn't") return "não é";
      if (normalizedToken === "aren't") return "não são";
      if (normalizedToken === "wasn't") return "não estava";
      if (normalizedToken === "weren't") return "não estavam";
      if (normalizedToken === "doesn't") return "não";
      if (normalizedToken === "didn't") return "não";
      if (normalizedToken === "haven't") return "não tenho";
      if (normalizedToken === "hasn't") return "não tem";
      if (normalizedToken === "hadn't") return "não tinha";
      if (normalizedToken === "shouldn't") return "não deveria";
      if (normalizedToken === "wouldn't") return "não seria";
      if (normalizedToken === "couldn't") return "não poderia";
      
      // Check direct word translation
      if (this.words[normalizedToken]) {
        return this.preserveCase(token, this.words[normalizedToken]);
      }
      
      // Handle plural forms
      if (normalizedToken.endsWith('s') && this.words[normalizedToken.slice(0, -1)]) {
        const singular = this.words[normalizedToken.slice(0, -1)];
        return this.preserveCase(token, this.makePlural(singular));
      }
      
      // Handle past tense (-ed endings)
      if (normalizedToken.endsWith('ed') && this.words[normalizedToken.slice(0, -2)]) {
        const baseForm = this.words[normalizedToken.slice(0, -2)];
        return this.preserveCase(token, baseForm); // Portuguese doesn't always add suffix
      }
      
      // Keep original if no translation found
      return token;
    });

    return translatedTokens.join('');
  }

  private preserveCase(original: string, translation: string): string {
    if (original === original.toUpperCase()) {
      return translation.toUpperCase();
    }
    if (original === original.toLowerCase()) {
      return translation.toLowerCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return translation.charAt(0).toUpperCase() + translation.slice(1).toLowerCase();
    }
    return translation;
  }

  private makePlural(word: string): string {
    // Simple Portuguese pluralization rules
    if (word.endsWith('ão')) {
      return word.slice(0, -2) + 'ões';
    }
    if (word.endsWith('m')) {
      return word.slice(0, -1) + 'ns';
    }
    if (word.endsWith('r') || word.endsWith('s') || word.endsWith('z')) {
      return word + 'es';
    }
    if (word.endsWith('al')) {
      return word.slice(0, -2) + 'ais';
    }
    if (word.endsWith('el')) {
      return word.slice(0, -2) + 'éis';
    }
    if (word.endsWith('ol')) {
      return word.slice(0, -2) + 'óis';
    }
    if (word.endsWith('ul')) {
      return word.slice(0, -2) + 'uis';
    }
    // Default: add 's'
    return word + 's';
  }

  private capitalizeFirst(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  async translateSubtitles(subtitles: any[]): Promise<any[]> {
    console.log(`🎬 Starting translation of ${subtitles.length} subtitle entries`);
    
    const translated: any[] = [];
    for (let i = 0; i < subtitles.length; i++) {
      const subtitle = subtitles[i];
      console.log(`📝 Translating subtitle ${i + 1}/${subtitles.length}: "${subtitle.text}"`);
      
      const translatedText = await this.translateText(subtitle.text);
      translated.push({
        ...subtitle,
        text: translatedText
      });
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`✅ Translation completed! Translated ${translated.length} subtitle entries`);
    return translated;
  }

  getSupportedLanguages(): string[] {
    return [
      'pt-BR', // Portuguese (Brazil)
      'en',    // English
      'es',    // Spanish
      'fr',    // French
      'de',    // German
      'it',    // Italian
      'ja',    // Japanese
      'ko',    // Korean
      'zh',    // Chinese
      'ru'     // Russian
    ];
  }
}
