import axios from 'axios';
import { GeminiProvider, msUntilQuotaReset } from './GeminiProvider';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

type Item = { i: number; t: string };
const sent = (call: any[]): Item[] => JSON.parse(call[1].contents[0].parts[0].text);
const reply = (items: Item[], finishReason = 'STOP') => ({
  data: { candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(items) }] } }] },
});
const upper = async (_url: string, body: any) => reply(sent([_url, body]).map(x => ({ i: x.i, t: x.t.toUpperCase() })));
const apiError = (status: number, message = 'erro', details: unknown[] = []) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { error: { code: status, message, details } } } });
const perDay = () =>
  apiError(429, 'quota', [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' },
  ]);
const perMinute = (delay = '2s') =>
  apiError(429, 'quota', [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: delay },
  ]);

const waits: number[] = [];
const make = (extra: Partial<ConstructorParameters<typeof GeminiProvider>[0]> = {}) =>
  new GeminiProvider({
    apiKey: 'k',
    models: ['main', 'lite'],
    wait: async ms => void waits.push(ms),
    now: () => new Date('2026-10-01T18:00:00Z'),
    ...extra,
  });
const modelOf = (call: any[]) => /models\/([^:]+):/.exec(call[0])![1];

beforeEach(() => {
  jest.resetAllMocks();
  waits.length = 0;
});

describe('GeminiProvider', () => {
  it('sends the whole batch as one JSON request and maps the answer back by id', async () => {
    mocked.post.mockImplementation(upper as any);
    const out = await make().translateBatch(['one', 'two\nlines', 'three'], 'en', 'pt-BR');
    expect(out).toEqual(['ONE', 'TWO LINES', 'THREE']);
    expect(mocked.post).toHaveBeenCalledTimes(1);
    const [url, body, cfg] = mocked.post.mock.calls[0] as any[];
    expect(url).toContain('/models/main:generateContent');
    expect(cfg.headers['x-goog-api-key']).toBe('k');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toContain('português do Brasil');
    expect(sent(mocked.post.mock.calls[0])).toEqual([
      { i: 0, t: 'one' },
      { i: 1, t: 'two lines' },
      { i: 2, t: 'three' },
    ]);
  });

  it('retries only the missing ids when the answer is partial', async () => {
    mocked.post
      .mockResolvedValueOnce(reply([{ i: 0, t: 'UM' }, { i: 2, t: 'TRÊS' }]))
      .mockImplementation(upper as any);
    const out = await make().translateBatch(['one', 'two', 'three'], 'en', 'pt');
    expect(out).toEqual(['UM', 'TWO', 'TRÊS']);
    expect(sent(mocked.post.mock.calls[1])).toEqual([{ i: 0, t: 'two' }]);
  });

  it('splits a blocked batch until only the offending text is left as null', async () => {
    mocked.post.mockImplementation((async (url: string, body: any) => {
      const items = sent([url, body]);
      if (items.some(x => x.t === 'bad')) return { data: { candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] } };
      return upper(url, body);
    }) as any);
    const out = await make().translateBatch(['a', 'b', 'bad', 'c'], 'en', 'pt');
    expect(out).toEqual(['A', 'B', null, 'C']);
  });

  it('treats invalid JSON as a failed piece and recovers by splitting', async () => {
    mocked.post
      .mockResolvedValueOnce({ data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '[{"i":0,"t":"U' }] } }] } })
      .mockImplementation(upper as any);
    const out = await make().translateBatch(['one', 'two'], 'en', 'pt');
    expect(out).toEqual(['ONE', 'TWO']);
  });

  it('waits the RetryInfo delay on a per-minute 429 and tries again', async () => {
    mocked.post.mockRejectedValueOnce(perMinute('7s')).mockImplementation(upper as any);
    const out = await make().translateBatch(['hi'], 'en', 'pt');
    expect(out).toEqual(['HI']);
    expect(waits).toEqual([8000]);
    expect(mocked.post.mock.calls.map(modelOf)).toEqual(['main', 'main']);
  });

  it('moves to the next model when the daily quota runs out, and keeps skipping it', async () => {
    mocked.post.mockImplementation((async (url: string, body: any) => {
      if (url.includes('/main:')) throw perDay();
      return upper(url, body);
    }) as any);
    const p = make();
    expect(await p.translateBatch(['hi'], 'en', 'pt')).toEqual(['HI']);
    expect(await p.translateBatch(['bye'], 'en', 'pt')).toEqual(['BYE']);
    expect(mocked.post.mock.calls.map(modelOf)).toEqual(['main', 'lite', 'lite']);
    const usage = p.usage();
    expect(usage[0].exhaustedUntil).not.toBeNull();
    expect(usage[1]).toMatchObject({ model: 'lite', requests: 2, exhaustedUntil: null });
    expect(waits).toEqual([]);
  });

  it('returns nulls (no exception) when every model is out of quota', async () => {
    mocked.post.mockRejectedValue(perDay());
    const p = make();
    expect(await p.translateBatch(['a', 'b'], 'en', 'pt')).toEqual([null, null]);
    expect(p.unavailable).toBe(true);
    expect(mocked.post).toHaveBeenCalledTimes(2);
  });

  it('retries 503 "high demand" with backoff, then falls back to the next model', async () => {
    mocked.post.mockImplementation((async (url: string, body: any) => {
      if (url.includes('/main:')) throw apiError(503, 'high demand');
      return upper(url, body);
    }) as any);
    const out = await make({ retries: 2, retryDelayMs: 10 }).translateBatch(['x'], 'en', 'pt');
    expect(out).toEqual(['X']);
    expect(waits).toEqual([10, 20]);
    expect(mocked.post.mock.calls.map(modelOf)).toEqual(['main', 'main', 'main', 'lite']);
  });

  it('finds a thinking setting the model accepts and remembers it', async () => {
    mocked.post.mockImplementation((async (url: string, body: any) => {
      if (body.generationConfig.thinkingConfig?.thinkingBudget === 0) throw apiError(400, 'Request contains an invalid argument.');
      return upper(url, body);
    }) as any);
    const p = make();
    await p.translateBatch(['a'], 'en', 'pt');
    await p.translateBatch(['b'], 'en', 'pt');
    const configs = mocked.post.mock.calls.map(c => (c[1] as any).generationConfig.thinkingConfig);
    expect(configs).toEqual([{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'minimal' }]);
  });

  it('computes the time left until the Pacific midnight quota reset', () => {
    // 18:00 UTC on 2026-10-01 is 11:00 in Los Angeles (PDT): 13 h to midnight.
    expect(msUntilQuotaReset(new Date('2026-10-01T18:00:00Z'))).toBe(13 * 3_600_000);
  });
});
