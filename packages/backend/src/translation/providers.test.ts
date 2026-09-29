import axios from 'axios';
import { GoogleFreeProvider, toGoogleLang } from './GoogleFreeProvider';
import { MyMemoryProvider } from './MyMemoryProvider';
import { mapWithConcurrency, withRetry, ProviderError } from './TranslationProvider';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

/** Builds a gtx-shaped response: sentences are split like Google does. */
const gtx = (text: string) => ({ data: [text.split(/(?<=\n)/).map(s => [s, 'src', null, null]), null, 'en'] });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const bodyOf = (call: any[]) => new URLSearchParams(call[1]).get('q')!;

beforeEach(() => jest.resetAllMocks());

describe('GoogleFreeProvider', () => {
  const fast = { retryDelayMs: 1 };

  it('translates many texts in one newline-joined request', async () => {
    mocked.post.mockImplementation(async (_url, body) => gtx(new URLSearchParams(body as string).get('q')!.toUpperCase()));
    const out = await new GoogleFreeProvider(fast).translateBatch(['one', 'two', 'three'], 'en', 'pt-BR');
    expect(out).toEqual(['ONE', 'TWO', 'THREE']);
    expect(mocked.post).toHaveBeenCalledTimes(1);
    expect(bodyOf(mocked.post.mock.calls[0])).toBe('one\ntwo\nthree');
    expect(mocked.post.mock.calls[0][2]!.params).toMatchObject({ client: 'gtx', sl: 'en', tl: 'pt' });
  });

  it('never sends a request larger than maxChars', async () => {
    mocked.post.mockImplementation(async (_url, body) => gtx(new URLSearchParams(body as string).get('q')!));
    const texts = Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(30, 'x'));
    await new GoogleFreeProvider({ ...fast, maxChars: 100 }).translateBatch(texts, 'en', 'pt');
    expect(mocked.post.mock.calls.length).toBeGreaterThan(1);
    for (const call of mocked.post.mock.calls) expect(bodyOf(call).length).toBeLessThanOrEqual(100);
  });

  it('flattens newlines inside a text so alignment is kept', async () => {
    mocked.post.mockImplementation(async (_url, body) => gtx(new URLSearchParams(body as string).get('q')!));
    const out = await new GoogleFreeProvider(fast).translateBatch(['a\nb', 'c'], 'en', 'pt');
    expect(out).toEqual(['a b', 'c']);
  });

  it('falls back to one request per text when line counts do not match', async () => {
    mocked.post
      .mockResolvedValueOnce(gtx('merged line only'))
      .mockResolvedValueOnce(gtx('UM'))
      .mockResolvedValueOnce(gtx('DOIS'));
    const out = await new GoogleFreeProvider(fast).translateBatch(['one', 'two'], 'en', 'pt');
    expect(out).toEqual(['UM', 'DOIS']);
    expect(mocked.post).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 and succeeds', async () => {
    mocked.post.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(gtx('OI'));
    const out = await new GoogleFreeProvider(fast).translateBatch(['hi'], 'en', 'pt');
    expect(out).toEqual(['OI']);
    expect(mocked.post).toHaveBeenCalledTimes(2);
  });

  it('returns nulls (not an exception) when the service keeps failing', async () => {
    mocked.post.mockRejectedValue(httpError(503));
    const out = await new GoogleFreeProvider({ ...fast, retries: 2 }).translateBatch(['a', 'b'], 'en', 'pt');
    expect(out).toEqual([null, null]);
    expect(mocked.post).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    mocked.post.mockRejectedValue(httpError(400));
    await new GoogleFreeProvider(fast).translateBatch(['a'], 'en', 'pt');
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });

  it('maps language codes', () => {
    expect(toGoogleLang('pt-BR')).toBe('pt');
    expect(toGoogleLang('en-US')).toBe('en');
    expect(toGoogleLang('zh-TW')).toBe('zh-TW');
  });
});

describe('MyMemoryProvider', () => {
  const ok = (text: string) => ({ data: { responseStatus: 200, responseData: { translatedText: text } } });

  it('translates each text', async () => {
    mocked.get.mockResolvedValueOnce(ok('Olá')).mockResolvedValueOnce(ok('Tchau'));
    expect(await new MyMemoryProvider(undefined).translateBatch(['Hello', 'Bye'], 'en', 'pt-BR')).toEqual(['Olá', 'Tchau']);
  });

  it('treats the quota warning text as a failure, never as a translation', async () => {
    mocked.get.mockResolvedValue(ok('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.'));
    expect(await new MyMemoryProvider(undefined).translateBatch(['Hello'], 'en', 'pt-BR')).toEqual([null]);
  });

  it('stops calling after a 429', async () => {
    mocked.get.mockResolvedValue({ data: { responseStatus: 429, responseData: { translatedText: 'x' } } });
    const texts = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const out = await new MyMemoryProvider(undefined).translateBatch(texts, 'en', 'pt-BR');
    expect(out.every(o => o === null)).toBe(true);
    expect(mocked.get.mock.calls.length).toBeLessThan(texts.length);
  });

  it('passes the contact email when configured', async () => {
    mocked.get.mockResolvedValue(ok('Oi'));
    await new MyMemoryProvider('me@example.com').translateBatch(['Hi'], 'en', 'pt-BR');
    expect(mocked.get.mock.calls[0][1]!.params).toMatchObject({ de: 'me@example.com', langpair: 'en|pt-BR' });
  });
});

describe('helpers', () => {
  it('mapWithConcurrency keeps order and respects the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 3, 2, 4], 2, async n => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });

  it('withRetry gives up on non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new ProviderError('bad', false));
    await expect(withRetry(fn, 3, 1)).rejects.toThrow('bad');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
