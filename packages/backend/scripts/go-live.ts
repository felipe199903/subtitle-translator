/**
 * Turns your keys into a working production site, in one command.
 *
 *   1. Put the keys in .env.production.local at the repo root (git-ignored), e.g.
 *        RESEND_API_KEY=re_...
 *        STRIPE_SECRET_KEY=sk_live_...   (or sk_test_... to try first)
 *        GEMINI_API_KEY=...              (optional: AI translation on Pro)
 *        GOOGLE_CLIENT_ID=...            (optional: "Continue with Google")
 *   2. npm run go-live -- --dry-run                 # checks the keys, changes nothing
 *      npm run go-live -- --confirm acct_...        # does everything below
 *
 * - Stripe: product, prices, portal, webhook (secret captured), launch coupon, Pix on.
 * - Resend: adds the domain, writes its DNS records to Vercel DNS, asks for verification.
 * - Vercel: publishes the env vars to Production and redeploys the current production build.
 * - Checks production (health, config, prices, a test magic link to Resend's test inbox).
 *
 * Secret values are never printed: only their kind and last 4 characters.
 * Requires the Vercel CLI to be logged in (npx vercel login) for the project's team.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import Stripe from 'stripe';
import { setupStripe } from './stripe-setup';
import {
  DnsRecord,
  SITE_DOMAIN,
  envToPublish,
  mask,
  missingRecords,
  wantedRecords,
} from '../src/ops/goLive';

const ROOT = path.resolve(__dirname, '../../..');
const SITE = `https://${SITE_DOMAIN}`;
const KEYS_FILE = path.join(ROOT, '.env.production.local');
const PROJECT = 'subtitle-translator';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const ok = (msg: string) => console.log(`✓ ${msg}`);
const info = (msg: string) => console.log(`• ${msg}`);
const warn = (msg: string) => console.log(`⚠️  ${msg}`);
class Stop extends Error {}
/** Stops the run; main's catch prints it (process.exit mid-request crashes libuv on Windows). */
const fail = (msg: string): never => {
  throw new Stop(msg);
};

/** Runs the Vercel CLI. Only constant words go in `argv`; secret values go through stdin. */
function vercel(argv: string[], input?: string): { ok: boolean; out: string } {
  const res = spawnSync('npx', ['--yes', 'vercel@latest', ...argv], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
  });
  return { ok: res.status === 0, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function vercelApi<T = any>(apiPath: string, method = 'GET', body?: unknown): T {
  // On Windows the CLI runs through cmd.exe, where "&" in a query string must be quoted.
  const argv = ['api', process.platform === 'win32' ? `"${apiPath}"` : apiPath, '-X', method, '--raw'];
  if (body !== undefined) argv.push('--input', '-');
  const res = vercel(argv, body === undefined ? undefined : JSON.stringify(body));
  const json = res.out.slice(res.out.indexOf('{'));
  try {
    const parsed = JSON.parse(json);
    if (!res.ok && parsed?.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
    return parsed as T;
  } catch (e) {
    throw new Error(`vercel api ${method} ${apiPath}: ${e instanceof Error ? e.message : e}\n${res.out.slice(0, 300)}`);
  }
}

async function resend<T = any>(key: string, apiPath: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`https://api.resend.com${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${method} ${apiPath} → ${res.status}: ${(data as any).message ?? ''}`);
  return data as T;
}

function linkedProject(): { projectId: string; orgId: string } {
  const file = path.join(ROOT, '.vercel', 'project.json');
  if (!fs.existsSync(file)) {
    info('Ligando esta pasta ao projeto da Vercel (vercel link)…');
    // vercel link also writes .env.local and edits .gitignore; neither is wanted here, so undo them.
    const gitignore = path.join(ROOT, '.gitignore');
    const envLocal = path.join(ROOT, '.env.local');
    const ignoreBefore = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : null;
    const hadEnvLocal = fs.existsSync(envLocal);
    const res = vercel(['link', '--yes', '--project', PROJECT]);
    if (ignoreBefore !== null) fs.writeFileSync(gitignore, ignoreBefore);
    if (!hadEnvLocal && fs.existsSync(envLocal)) fs.unlinkSync(envLocal);
    if (!res.ok || !fs.existsSync(file)) fail(`vercel link falhou. Rode "npx vercel login" e tente de novo.\n${res.out.slice(-300)}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function envNamesInProduction(): Set<string> {
  const res = vercel(['env', 'ls', 'production']);
  const names = new Set<string>();
  for (const line of res.out.split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9_]+)\s+Hidden/.exec(line) ?? /^\s*([A-Z][A-Z0-9_]+)\s+\S+\s+(Encrypted|Secret|Plain)/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

function publishEnv(name: string, value: string): void {
  vercel(['env', 'rm', name, 'production', '--yes']); // absent is fine
  const res = vercel(['env', 'add', name, 'production'], value);
  if (!res.ok) fail(`Não foi possível gravar ${name} na Vercel:\n${res.out.slice(-300)}`);
  ok(`${name} = ${mask(value)} (Production)`);
}

/** KEY=value lines; quotes around the value are removed, # starts a comment line. */
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

async function main() {
  const dryRun = flag('dry-run');
  console.log(`Go-live de ${SITE}${dryRun ? ' (simulação: nada será alterado)' : ''}\n`);

  if (!fs.existsSync(KEYS_FILE)) {
    fail(`Crie o arquivo .env.production.local na raiz do repositório (${ROOT}) com as chaves. Modelo: .env.production.example`);
  }
  const keys = readEnvFile(KEYS_FILE);
  const toPublish = envToPublish(keys);
  for (const k of ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'GEMINI_API_KEY', 'GOOGLE_CLIENT_ID']) {
    if (!keys[k]?.trim()) (k === 'RESEND_API_KEY' || k === 'STRIPE_SECRET_KEY' ? warn : info)(`${k} ausente${k.startsWith('GEMINI') || k.startsWith('GOOGLE') ? ' (opcional)' : ''}`);
  }

  // 1. Validate keys
  let stripe: Stripe | null = null;
  let account: Stripe.Account | null = null;
  if (keys.STRIPE_SECRET_KEY) {
    stripe = new Stripe(keys.STRIPE_SECRET_KEY.trim());
    account = await stripe.accounts.retrieveCurrent().catch(e => fail(`Chave do Stripe recusada: ${e.message}`));
    const live = keys.STRIPE_SECRET_KEY.trim().startsWith('sk_live');
    ok(`Stripe: ${account!.id} · ${account!.settings?.dashboard?.display_name || account!.business_profile?.name || '(sem nome)'} · ${live ? 'PRODUÇÃO' : 'TESTE'} · país ${account!.country} · cobranças ${account!.charges_enabled ? 'liberadas' : 'ainda não liberadas (termine a ativação)'}`);
  }
  if (keys.RESEND_API_KEY) {
    await resend(keys.RESEND_API_KEY.trim(), '/domains').catch(e => fail(`Chave do Resend recusada: ${e.message}`));
    ok('Resend: chave válida');
  }
  if (keys.GEMINI_API_KEY) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keys.GEMINI_API_KEY.trim())}`);
    if (!r.ok) fail(`Chave do Gemini recusada (${r.status}).`);
    ok('Gemini: chave válida');
  }

  if (dryRun) {
    console.log('\nO go-live faria:');
    if (stripe) console.log(`  - Stripe: produto, 3 preços, portal, webhook ${SITE}/api/billing/webhook, cupom LANCAMENTO e Pix`);
    if (keys.RESEND_API_KEY) console.log(`  - Resend: domínio ${SITE_DOMAIN} + registros SPF/DKIM/DMARC no DNS da Vercel`);
    console.log(`  - Vercel (Production): ${toPublish.map(e => e.name).join(', ') || '(nada)'}${stripe ? ', STRIPE_WEBHOOK_SECRET' : ''}`);
    console.log('  - Redeploy da produção e checagens');
    if (account) console.log(`\nPara aplicar: npm run go-live -- --confirm ${account.id}`);
    return;
  }
  if (stripe && arg('confirm') !== account!.id) {
    fail(`Confirme a conta Stripe: npm run go-live -- --confirm ${account!.id}`);
  }

  const { projectId, orgId } = linkedProject();
  const existingEnv = envNamesInProduction();
  const env: Array<{ name: string; value: string }> = [...toPublish];

  // 2. Stripe
  if (stripe) {
    console.log('\n— Stripe');
    const haveSecret = !!keys.STRIPE_WEBHOOK_SECRET?.trim() || existingEnv.has('STRIPE_WEBHOOK_SECRET');
    const { webhookSecret } = await setupStripe(stripe, { site: SITE, recreateWebhook: !haveSecret });
    if (webhookSecret) env.push({ name: 'STRIPE_WEBHOOK_SECRET', value: webhookSecret });
  }

  // 3. Resend domain + DNS
  if (keys.RESEND_API_KEY) {
    console.log('\n— E-mail (Resend)');
    const key = keys.RESEND_API_KEY.trim();
    const list = await resend<{ data: Array<{ id: string; name: string; status: string }> }>(key, '/domains');
    let domain = list.data.find(d => d.name === SITE_DOMAIN);
    if (!domain) {
      domain = await resend(key, '/domains', 'POST', { name: SITE_DOMAIN, region: 'sa-east-1' });
      ok(`Domínio ${SITE_DOMAIN} criado no Resend`);
    } else {
      info(`Domínio já existe no Resend (${domain.status})`);
    }
    const details = await resend<{ status: string; records: Array<{ name: string; type: string; value: string; priority?: number }> }>(key, `/domains/${domain!.id}`);
    const existing = vercelApi<{ records: Array<{ name: string; type: string; value: string; mxPriority?: number }> }>(
      `/v4/domains/${SITE_DOMAIN}/records?teamId=${orgId}&limit=100`
    ).records.map<DnsRecord>(r => ({ name: r.name, type: r.type, value: r.value, mxPriority: r.mxPriority }));
    const { create, conflicts } = missingRecords(wantedRecords(details.records), existing);
    for (const r of create) {
      vercelApi(`/v2/domains/${SITE_DOMAIN}/records?teamId=${orgId}`, 'POST', { ...r, ttl: 60 });
      ok(`DNS ${r.type} ${r.name || '@'} criado`);
    }
    if (!create.length) info('Registros de DNS do e-mail já existem');
    for (const r of conflicts) warn(`DNS ${r.type} ${r.name} já existe com outro valor: confira no painel da Vercel (Domains → DNS)`);
    if (details.status !== 'verified') {
      await resend(key, `/domains/${domain!.id}/verify`, 'POST');
      let status = details.status;
      for (let i = 0; i < 12 && status !== 'verified'; i++) {
        await new Promise(r => setTimeout(r, 10_000));
        status = (await resend<{ status: string }>(key, `/domains/${domain!.id}`)).status;
      }
      if (status === 'verified') ok('Domínio verificado no Resend');
      else warn(`Domínio ainda "${status}" no Resend: o DNS pode levar alguns minutos. Rode o go-live de novo depois para conferir.`);
    } else {
      ok('Domínio verificado no Resend');
    }
  }

  // 4. Env vars
  console.log('\n— Variáveis na Vercel');
  if (!existingEnv.has('SESSION_SECRET')) {
    const { randomBytes } = await import('crypto');
    env.push({ name: 'SESSION_SECRET', value: randomBytes(32).toString('hex') });
  }
  if (!existingEnv.has('APP_URL')) env.push({ name: 'APP_URL', value: SITE });
  for (const e of env) publishEnv(e.name, e.value);

  // 5. Redeploy the current production build so it reads the new variables
  console.log('\n— Deploy');
  const deps = vercelApi<{ deployments: Array<{ url: string; state?: string; readyState?: string }> }>(
    `/v6/deployments?projectId=${projectId}&teamId=${orgId}&target=production&limit=5`
  ).deployments;
  const current = deps.find(d => (d.readyState ?? d.state) === 'READY') ?? deps.at(0);
  if (!current) fail('Nenhum deploy de produção encontrado para refazer.');
  info(`Refazendo o deploy ${current!.url}…`);
  const re = vercel(['redeploy', current!.url, '--target', 'production']);
  if (!re.ok) fail(`Redeploy falhou:\n${re.out.slice(-500)}`);
  ok('Deploy pronto');

  // 6. Checks
  console.log('\n— Checagens em produção');
  const get = async (p: string) => (await fetch(`${SITE}${p}`)).json() as Promise<any>;
  const health = await get('/api/health');
  (health.database === 'ok' ? ok : warn)(`Banco: ${health.database}`);
  const config = (await get('/api/auth/config')).data;
  (config.googleClientId ? ok : info)(`Login com Google: ${config.googleClientId ? 'ativo' : 'desligado'}`);
  (config.aiEngine ? ok : info)(`IA no Pro: ${config.aiEngine ? 'ativa' : 'desligada'}`);
  const prices = await get('/api/billing/prices');
  if (prices.data?.pro_monthly) ok(`Preços do Stripe carregando${prices.promo ? ` · cupom ${prices.promo.code} ativo` : ''}`);
  else warn('Preços do Stripe não carregaram');
  // Resend's test inbox accepts any message without delivering it anywhere.
  const link = await fetch(`${SITE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'delivered@resend.dev' }),
  });
  (link.ok ? ok : warn)(`Envio do link de acesso: ${link.status}${link.ok ? '' : ' (veja o domínio no Resend)'}`);

  console.log(`\nPronto. Faça uma compra real de R$ 19,90 em ${SITE}/precos e reembolse pelo painel do Stripe.`);
}

main().catch(e => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
