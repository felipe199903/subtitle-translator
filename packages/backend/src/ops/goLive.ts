/**
 * Pure helpers for scripts/go-live.ts: which env vars to publish, and which DNS records Resend
 * needs that the domain does not have yet. Kept here (not in the script) so they are tested.
 */

export const SITE_DOMAIN = 'subtitle-translator.com.br';
export const DEFAULT_EMAIL_FROM = `Subtitle Translator <nao-responda@${SITE_DOMAIN}>`;

/** Keys go-live reads from .env.production.local and publishes to Vercel (in this order). */
export const PUBLISHED_KEYS = [
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GEMINI_API_KEY',
  'GEMINI_MODELS',
  'GOOGLE_CLIENT_ID',
] as const;
export type PublishedKey = (typeof PUBLISHED_KEYS)[number];

/** Other names people give the same keys in their .env (the first one with a value wins). */
const ALIASES: Record<string, PublishedKey> = {
  RESEND: 'RESEND_API_KEY',
  'STRIPE-CHAVE-SECRETA': 'STRIPE_SECRET_KEY',
  STRIPE_CHAVE_SECRETA: 'STRIPE_SECRET_KEY',
  STRIPE_SECRET: 'STRIPE_SECRET_KEY',
  GEMINI: 'GEMINI_API_KEY',
};

/** Maps aliases onto the names the app reads; the official name always wins. */
export function normalizeKeys(input: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) if (v?.trim()) out[k] = v.trim();
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (!out[name] && out[alias]) out[name] = out[alias];
  }
  return out;
}

/** The env vars to write: only keys with a value, plus EMAIL_FROM's default once e-mail is on. */
export function envToPublish(input: Record<string, string | undefined>): Array<{ name: PublishedKey; value: string }> {
  const values: Partial<Record<PublishedKey, string>> = {};
  for (const k of PUBLISHED_KEYS) {
    const v = input[k]?.trim();
    if (v) values[k] = v;
  }
  if (values.RESEND_API_KEY && !values.EMAIL_FROM) values.EMAIL_FROM = DEFAULT_EMAIL_FROM;
  return PUBLISHED_KEYS.filter(k => values[k]).map(name => ({ name, value: values[name]! }));
}

/** A DNS record as Resend reports it (GET /domains/:id). */
export interface ResendRecord {
  record?: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
}

/** A DNS record in the shape of Vercel's /v2/domains/:domain/records API. */
export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  mxPriority?: number;
}

/** Resend may name a record "send" or "send.example.com"; Vercel wants it relative to the zone. */
export function relativeName(name: string, domain = SITE_DOMAIN): string {
  const n = name.replace(/\.$/, '').toLowerCase();
  if (n === domain || n === '@') return '';
  return n.endsWith(`.${domain}`) ? n.slice(0, -(domain.length + 1)) : n;
}

/** Records Resend asks for, plus a DMARC policy (monitor only) when the domain has none. */
export function wantedRecords(resend: ResendRecord[], domain = SITE_DOMAIN): DnsRecord[] {
  const out: DnsRecord[] = resend.map(r => ({
    name: relativeName(r.name, domain),
    type: r.type.toUpperCase(),
    value: r.value,
    ...(r.type.toUpperCase() === 'MX' ? { mxPriority: r.priority ?? 10 } : {}),
  }));
  out.push({ name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none;' });
  return out;
}

const norm = (s: string) => s.replace(/^"|"$/g, '').replace(/\.$/, '').trim().toLowerCase();

/**
 * What still has to be created. A record already there with the same name and type counts as
 * present: an existing DMARC (or a stale DKIM) is reported rather than duplicated.
 */
export function missingRecords(wanted: DnsRecord[], existing: DnsRecord[]): { create: DnsRecord[]; conflicts: DnsRecord[] } {
  const create: DnsRecord[] = [];
  const conflicts: DnsRecord[] = [];
  for (const w of wanted) {
    const same = existing.filter(e => e.name === w.name && e.type.toUpperCase() === w.type);
    if (!same.length) create.push(w);
    else if (!same.some(e => norm(e.value) === norm(w.value))) conflicts.push(w);
  }
  return { create, conflicts };
}

/** Secret (sk_) and restricted (rk_) keys alike: true for the live (real money) mode. */
export const isLiveStripeKey = (key: string) => /^[sr]k_live_/.test(key.trim());

/**
 * A restricted key that lacks a permission fails with a message naming the resource; turn it into
 * the instruction to fix it in the Dashboard (Developers → API keys → edit the key).
 */
export function permissionHint(message: string): string | null {
  if (!/permission|does not have the required|restricted key/i.test(message)) return null;
  const resource = /\b(?:for|on|to)\s+['"`]?([a-z_.]+(?:\.[a-z_]+)?)['"`]?/i.exec(message)?.[1];
  return `A chave restrita não tem permissão${resource ? ` para "${resource}"` : ''}. No Stripe: Desenvolvedores → Chaves de API → editar a chave → liberar "Gravação" nesse recurso, e rode o go-live de novo.`;
}

/** Never print a secret: show its kind and last 4 characters. */
export function mask(value: string): string {
  const prefix = /^([sr]k_live_|[sr]k_test_|re_|whsec_|AIza)/.exec(value)?.[0] ?? '';
  return `${prefix}…${value.slice(-4)}`;
}
