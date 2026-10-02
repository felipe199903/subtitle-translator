import axios, { AxiosError } from 'axios';
import { TranslationProvider, sleep } from './TranslationProvider';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Thinking settings tried in order: each model accepts a different one (and some none). */
const THINKING: Array<Record<string, unknown> | undefined> = [
  { thinkingBudget: 0 },
  { thinkingLevel: 'minimal' },
  { thinkingLevel: 'low' },
  undefined,
];

const SAFETY = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map(c => ({
  category: `HARM_CATEGORY_${c}`,
  threshold: 'BLOCK_NONE',
}));

const LANG_NAMES: Record<string, string> = {
  'pt-br': 'português do Brasil',
  pt: 'português do Brasil',
  en: 'inglês',
  es: 'espanhol',
};

const instruction = (from: string, to: string) =>
  `Você traduz legendas de filmes, séries e animes do ${langName(from)} para o ${langName(to)}.
Entrada: um array JSON de falas consecutivas {"i": número, "t": texto}. Saída: o mesmo array, com cada "t" traduzido e o mesmo "i".
- Devolva exatamente um item para cada item recebido, na mesma ordem. Nunca junte, divida, pule ou acrescente itens: uma fala pode ser só o começo ou o fim de uma frase que continua no item vizinho, então traduza só a parte que está nela.
- Use as falas vizinhas como contexto (quem fala com quem, gênero, tratamento), mas traduza cada item no seu lugar.
- Português brasileiro natural e coloquial, como numa boa legenda de streaming: curto e fácil de ler (cerca de 42 caracteres por linha).
- Mantenha nomes próprios, apelidos, honoríficos japoneses (-san, -kun, -chan, -sama, senpai, sensei), golpes/técnicas e termos sem tradução consagrada.
- Não censure nem suavize palavrões, insultos ou violência; adapte gírias e expressões para equivalentes brasileiros.
- Interjeições, onomatopeias e nomes soltos podem ficar como estão.
- Responda só com o JSON.`;

function langName(lang: string): string {
  const l = lang.toLowerCase();
  return LANG_NAMES[l] ?? LANG_NAMES[l.split('-')[0]] ?? lang;
}

/** Milliseconds until the next midnight in Pacific time, when the Gemini API daily quotas reset. */
export function msUntilQuotaReset(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 86_400_000 - elapsed;
}

/** Quota day (Pacific date) used to reset the request counters. */
const quotaDay = (now: Date) => new Date(now.getTime() + msUntilQuotaReset(now)).toISOString().slice(0, 10);

/** Parses Google's "23s" / "1.5s" durations. */
function parseDelay(v: unknown): number | null {
  const m = typeof v === 'string' ? /^([\d.]+)s$/.exec(v) : null;
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

export interface GeminiOptions {
  apiKey: string;
  /** Tried in order; when one runs out of daily quota the next one is used. */
  models?: string[];
  timeoutMs?: number;
  /** Retries per model for transient errors (503 "high demand", per-minute 429, network). */
  retries?: number;
  retryDelayMs?: number;
  /** Longest wait honoured from a per-minute 429 before moving to the next model. */
  maxRetryWaitMs?: number;
  /** A model that keeps answering 429 without a daily quota id is rested this long. */
  restMs?: number;
  log?: (...args: unknown[]) => void;
  now?: () => Date;
  wait?: (ms: number) => Promise<unknown>;
}

export interface GeminiUsage {
  model: string;
  requests: number;
  /** Set while the model is out of quota (ISO date). */
  exhaustedUntil: string | null;
}

type Item = { i: number; t: string };
type Outcome = Map<number, string> | 'malformed' | 'unavailable';

/**
 * Google Gemini (AI Studio API key). The whole batch goes in one request as a JSON array, so
 * the model sees neighbouring lines as context; structured output forces the same ids back.
 * A response that is blocked, truncated or missing ids is retried in smaller pieces, down to a
 * single text; whatever still fails comes back as `null` for the fallback provider.
 */
export class GeminiProvider implements TranslationProvider {
  readonly name = 'gemini';
  /** Model that answered the last successful request. */
  lastModel: string | null = null;
  /** Last error that made a model unusable (for logs/status). */
  lastError: string | null = null;

  private models: string[];
  private timeoutMs: number;
  private retries: number;
  private retryDelayMs: number;
  private maxRetryWaitMs: number;
  private restMs: number;
  private log: (...args: unknown[]) => void;
  private now: () => Date;
  private wait: (ms: number) => Promise<unknown>;

  private thinking = new Map<string, number>();
  private exhausted = new Map<string, number>();
  private requests = new Map<string, number>();
  private day = '';

  constructor(private opts: GeminiOptions) {
    this.models = opts.models?.length ? opts.models : ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 5000;
    this.maxRetryWaitMs = opts.maxRetryWaitMs ?? 90_000;
    this.restMs = opts.restMs ?? 15 * 60_000;
    this.log = opts.log ?? (() => undefined);
    this.now = opts.now ?? (() => new Date());
    this.wait = opts.wait ?? sleep;
  }

  usage(): GeminiUsage[] {
    this.rollDay();
    const now = this.now().getTime();
    return this.models.map(model => {
      const until = this.exhausted.get(model);
      return {
        model,
        requests: this.requests.get(model) ?? 0,
        exhaustedUntil: until && until > now ? new Date(until).toISOString() : null,
      };
    });
  }

  /** True when every model is out of quota right now. */
  get unavailable(): boolean {
    const now = this.now().getTime();
    return this.models.every(m => (this.exhausted.get(m) ?? 0) > now);
  }

  async translateBatch(texts: string[], from: string, to: string): Promise<Array<string | null>> {
    const clean = texts.map(t => t.replace(/\s*\n\s*/g, ' ').trim());
    const out: Array<string | null> = new Array(texts.length).fill(null);
    const todo = clean.map((_, i) => i).filter(i => clean[i]);
    if (todo.length) await this.solve(todo, clean, out, from, to);
    return out;
  }

  /** Translates `idx`; on a partial/blocked answer retries what is missing in smaller groups. */
  private async solve(idx: number[], clean: string[], out: Array<string | null>, from: string, to: string): Promise<void> {
    const res = await this.request(
      idx.map((src, i) => ({ i, t: clean[src] })),
      from,
      to
    );
    if (res === 'unavailable') return;

    let missing = idx;
    if (res instanceof Map) {
      idx.forEach((src, i) => {
        const t = res.get(i);
        if (t) out[src] = t;
      });
      missing = idx.filter(src => out[src] == null);
    }
    if (!missing.length || idx.length === 1) return;

    if (missing.length < idx.length) return this.solve(missing, clean, out, from, to);
    const half = Math.ceil(missing.length / 2);
    await this.solve(missing.slice(0, half), clean, out, from, to);
    await this.solve(missing.slice(half), clean, out, from, to);
  }

  private async request(items: Item[], from: string, to: string): Promise<Outcome> {
    this.rollDay();
    for (const model of this.models) {
      if ((this.exhausted.get(model) ?? 0) > this.now().getTime()) continue;
      const res = await this.callModel(model, items, from, to);
      if (res !== 'unavailable') return res;
    }
    return 'unavailable';
  }

  /** One model, with retries for transient errors. 'unavailable' means: try the next model. */
  private async callModel(model: string, items: Item[], from: string, to: string): Promise<Outcome> {
    let transient = 0;
    for (;;) {
      const variant = this.thinking.get(model) ?? 0;
      try {
        this.requests.set(model, (this.requests.get(model) ?? 0) + 1);
        const res = await axios.post(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, this.body(items, from, to, THINKING[variant]), {
          headers: { 'x-goog-api-key': this.opts.apiKey, 'Content-Type': 'application/json' },
          timeout: this.timeoutMs,
        });
        this.lastModel = model;
        return parseResponse(res.data, items.length);
      } catch (e) {
        const err = e as AxiosError<any>;
        const status = err.response?.status;
        const error = err.response?.data?.error;
        const message: string = error?.message ?? err.message;

        if (status === 400 && /thinking|invalid argument/i.test(message) && variant < THINKING.length - 1) {
          this.thinking.set(model, variant + 1);
          continue;
        }

        if (status === 429) {
          const details: any[] = Array.isArray(error?.details) ? error.details : [];
          const violations: any[] = details.flatMap(d => (Array.isArray(d?.violations) ? d.violations : []));
          const retryMs = details.map(d => parseDelay(d?.retryDelay)).find(v => v != null) ?? null;
          const daily = violations.find(v => /PerDay/i.test(String(v?.quotaId ?? '')));
          if (daily) {
            const limit = daily.quotaValue ? `, limite ${daily.quotaValue}/dia` : '';
            this.rest(model, msUntilQuotaReset(this.now()) + 5 * 60_000, `cota diária esgotada (${model}${limit})`);
            return 'unavailable';
          }
          if (transient++ < this.retries && (retryMs ?? 0) <= this.maxRetryWaitMs) {
            await this.wait((retryMs ?? this.retryDelayMs * 2 ** (transient - 1)) + 1000);
            continue;
          }
          this.rest(model, this.restMs, `limite por minuto (${model}): ${message}`);
          return 'unavailable';
        }

        if (!status || status >= 500) {
          if (transient++ < this.retries) {
            await this.wait(this.retryDelayMs * 2 ** (transient - 1));
            continue;
          }
          this.lastError = `${model} indisponível (${status ?? message})`;
          this.log(`Gemini: ${this.lastError}`);
          return 'unavailable';
        }

        // 400/401/403/404: bad key, model removed, … Rest the model so the next one is used.
        this.rest(model, this.restMs, `${model} recusou (${status}): ${message}`);
        return 'unavailable';
      }
    }
  }

  private rest(model: string, ms: number, reason: string) {
    const until = this.now().getTime() + ms;
    this.exhausted.set(model, until);
    this.lastError = reason;
    this.log(`Gemini: ${reason}; modelo em pausa até ${new Date(until).toLocaleString('sv-SE').slice(0, 16)}.`);
  }

  private rollDay() {
    const day = quotaDay(this.now());
    if (day !== this.day) {
      this.day = day;
      this.requests.clear();
    }
  }

  private body(items: Item[], from: string, to: string, thinking: Record<string, unknown> | undefined) {
    return {
      systemInstruction: { parts: [{ text: instruction(from, to) }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(items) }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { i: { type: 'INTEGER' }, t: { type: 'STRING' } },
            required: ['i', 't'],
          },
        },
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
      safetySettings: SAFETY,
    };
  }
}

/** Reads the {i, t} array from a generateContent response; anything unusable is 'malformed'. */
function parseResponse(data: any, count: number): Outcome {
  const cand = data?.candidates?.[0];
  if (!cand || data?.promptFeedback?.blockReason) return 'malformed';
  const text = (cand.content?.parts ?? []).map((p: any) => (typeof p?.text === 'string' && !p.thought ? p.text : '')).join('');
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return 'malformed';
  }
  if (!Array.isArray(arr)) return 'malformed';
  const map = new Map<number, string>();
  for (const it of arr) {
    const i = Number((it as any)?.i);
    const t = (it as any)?.t;
    if (Number.isInteger(i) && i >= 0 && i < count && typeof t === 'string' && t.trim() && !map.has(i)) {
      map.set(i, t.replace(/\s*\n\s*/g, ' ').trim());
    }
  }
  return map.size ? map : 'malformed';
}
