import axios, { AxiosError } from 'axios';
import { ProviderError, TranslationProvider, withRetry } from './TranslationProvider';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

export interface GoogleFreeOptions {
  /** Max characters per request (the endpoint rejects very large bodies). */
  maxChars?: number;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Google Translate's public "gtx" endpoint: free and keyless, but unofficial.
 * Texts are sent newline-joined so one request covers many cues (and the
 * translator sees neighbouring lines as context). If the response does not
 * split back into the same number of lines, that batch is retried text by text.
 */
export class GoogleFreeProvider implements TranslationProvider {
  readonly name = 'google';
  private maxChars: number;
  private timeoutMs: number;
  private retries: number;
  private retryDelayMs: number;

  constructor(opts: GoogleFreeOptions = {}) {
    this.maxChars = opts.maxChars ?? 4500;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.retries = opts.retries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 800;
  }

  async translateBatch(texts: string[], from: string, to: string): Promise<Array<string | null>> {
    const clean = texts.map(t => t.replace(/\s*\n\s*/g, ' ').trim());
    const results: Array<string | null> = new Array(texts.length).fill(null);

    for (const batch of this.chunk(clean)) {
      const joined = batch.map(i => clean[i]).join('\n');
      let lines: string[] | null = null;
      try {
        lines = (await this.request(joined, from, to)).split('\n');
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        // Service unavailable for this batch; leave nulls for the fallback provider.
        continue;
      }

      if (lines.length === batch.length) {
        batch.forEach((idx, k) => (results[idx] = lines![k].trim() || null));
        continue;
      }

      // Alignment lost: translate each text on its own.
      for (const idx of batch) {
        try {
          results[idx] = (await this.request(clean[idx], from, to)).replace(/\s*\n\s*/g, ' ').trim() || null;
        } catch (e) {
          if (!(e instanceof ProviderError)) throw e;
        }
      }
    }
    return results;
  }

  /** Groups text indices so each newline-joined request stays under maxChars. */
  private chunk(texts: string[]): number[][] {
    const batches: number[][] = [];
    let cur: number[] = [];
    let size = 0;
    texts.forEach((t, i) => {
      if (cur.length && size + t.length + 1 > this.maxChars) {
        batches.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(i);
      size += t.length + 1;
    });
    if (cur.length) batches.push(cur);
    return batches;
  }

  private request(q: string, from: string, to: string): Promise<string> {
    return withRetry(
      async () => {
        try {
          const res = await axios.post(ENDPOINT, new URLSearchParams({ q }).toString(), {
            params: { client: 'gtx', sl: toGoogleLang(from), tl: toGoogleLang(to), dt: 't' },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            timeout: this.timeoutMs,
          });
          const sentences = res.data?.[0];
          if (!Array.isArray(sentences)) throw new ProviderError('Resposta inesperada do Google', false);
          return sentences.map((s: any) => (typeof s?.[0] === 'string' ? s[0] : '')).join('');
        } catch (e) {
          if (e instanceof ProviderError) throw e;
          const status = (e as AxiosError).response?.status;
          const retryable = !status || status === 429 || status >= 500;
          throw new ProviderError(`Google falhou (${status ?? (e as Error).message})`, retryable);
        }
      },
      this.retries,
      this.retryDelayMs
    );
  }
}

export function toGoogleLang(lang: string): string {
  if (lang === 'auto') return 'auto';
  const base = lang.toLowerCase();
  if (base === 'pt-br' || base === 'pt') return 'pt';
  if (base.startsWith('zh')) return base === 'zh-tw' ? 'zh-TW' : 'zh-CN';
  return base.split('-')[0];
}
