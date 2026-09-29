import axios from 'axios';
import { TranslationProvider, mapWithConcurrency } from './TranslationProvider';

/**
 * MyMemory free API, used only as a fallback for texts the main provider missed.
 * Anonymous quota is ~5k chars/day; setting MYMEMORY_EMAIL raises it to ~50k.
 */
export class MyMemoryProvider implements TranslationProvider {
  readonly name = 'mymemory';

  constructor(private email = process.env.MYMEMORY_EMAIL, private timeoutMs = 10000) {}

  async translateBatch(texts: string[], from: string, to: string): Promise<Array<string | null>> {
    let quotaExhausted = false;
    return mapWithConcurrency(texts, 2, async text => {
      if (quotaExhausted) return null;
      try {
        const res = await axios.get('https://api.mymemory.translated.net/get', {
          params: { q: text, langpair: `${from}|${to}`, ...(this.email ? { de: this.email } : {}) },
          timeout: this.timeoutMs,
        });
        const data = res.data;
        const out: unknown = data?.responseData?.translatedText;
        if (Number(data?.responseStatus) !== 200 || typeof out !== 'string') {
          if (Number(data?.responseStatus) === 429) quotaExhausted = true;
          return null;
        }
        if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) {
          quotaExhausted = true;
          return null;
        }
        return out.trim() || null;
      } catch (e: any) {
        if (e?.response?.status === 429) quotaExhausted = true;
        return null;
      }
    });
  }
}
