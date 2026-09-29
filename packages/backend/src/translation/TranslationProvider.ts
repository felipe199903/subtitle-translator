export interface TranslationProvider {
  readonly name: string;
  /**
   * Translates each text. The result has the same length and order as `texts`;
   * an entry is `null` when that text could not be translated.
   */
  translateBatch(texts: string[], from: string, to: string): Promise<Array<string | null>>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Runs `fn` with exponential backoff while it throws a retryable ProviderError. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 800): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!(e instanceof ProviderError) || !e.retryable || attempt === attempts - 1) throw e;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Runs async tasks with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
