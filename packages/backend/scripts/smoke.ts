/**
 * End-to-end smoke test of the API with the real database and real translation.
 *
 *   npm run smoke                      # local app in-process, using DATABASE_URL from .env / .env.local
 *   npm run smoke -- https://x.vercel.app   # a deployed app
 *
 * Flow: health (database ok) → upload a 3-cue .srt → /translate until done → download.
 * Exits with a non-zero code on any failure.
 */
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';

const SRT = [
  '1', '00:00:01,000 --> 00:00:03,000', 'Welcome to the smoke test.', '',
  '2', '00:00:04,000 --> 00:00:06,000', '- Is it working?', '- I think so.', '',
  '3', '00:00:07,000 --> 00:00:09,000', '<i>The subtitles look great.</i>', '',
].join('\n');

const step = (msg: string) => console.log(`• ${msg}`);
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

async function json(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return fail(`Resposta não-JSON (${res.status}) de ${res.url}: ${text.slice(0, 200)}`);
  }
}

async function main() {
  const target = process.argv[2];
  let base: string;
  let server: Server | undefined;
  let cleanup: ((jobId: string) => Promise<void>) | undefined;

  if (target) {
    base = target.replace(/\/+$/, '');
    step(`Testando o deploy em ${base}`);
  } else {
    const root = path.resolve(__dirname, '../../..');
    for (const f of ['.env.local', '.env']) {
      const p = path.join(root, f);
      if (fs.existsSync(p)) process.loadEnvFile(p);
    }
    const { createApp } = await import('../src/app');
    const { getDb, databaseUrl } = await import('../src/db/client');
    const url = databaseUrl();
    if (!url) fail('DATABASE_URL não encontrada em .env / .env.local.');
    const app = createApp();
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    base = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;
    step(`App local contra o Neon (${new URL(url!).host})`);
    cleanup = async id => {
      await getDb().query('DELETE FROM jobs WHERE id = $1', [id]);
    };
  }

  const t0 = Date.now();
  try {
    const health = await json(await fetch(`${base}/api/health`));
    if (health.database !== 'ok') fail(`Health: ${JSON.stringify(health)}`);
    step(`Health ok (banco conectado) em ${Date.now() - t0} ms`);

    const form = new FormData();
    form.append('file', new Blob([SRT], { type: 'application/x-subrip' }), 'smoke-test.en.srt');
    const created = await fetch(`${base}/api/subtitles/jobs`, { method: 'POST', body: form });
    const job = (await json(created)).data;
    if (created.status !== 201 || !job?.id) fail(`Criação do job falhou (${created.status})`);
    step(`Job criado: ${job.id} (${job.cues.length} falas)`);

    let status = 'translating';
    let calls = 0;
    while (status === 'translating') {
      if (++calls > 20) fail('A tradução não terminou em 20 chamadas.');
      const res = await fetch(`${base}/api/subtitles/jobs/${job.id}/translate`, { method: 'POST' });
      const data = (await json(res)).data;
      if (res.status !== 200) fail(`/translate respondeu ${res.status}`);
      status = data.status;
      step(`/translate #${calls}: ${data.progress.done}/${data.progress.total} (${status})`);
    }

    const full = (await json(await fetch(`${base}/api/subtitles/jobs/${job.id}`))).data;
    for (const c of full.cues) console.log(`    ${JSON.stringify(c.text)} → ${JSON.stringify(c.translation)}`);
    const untranslated = full.cues.filter((c: any) => c.warnings.includes('untranslated'));
    if (untranslated.length) fail(`${untranslated.length} fala(s) não traduzida(s): o tradutor pode estar bloqueado.`);

    const dl = await fetch(`${base}/api/subtitles/jobs/${job.id}/download`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const text = new TextDecoder().decode(bytes.slice(3));
    if (dl.status !== 200) fail(`Download respondeu ${dl.status}`);
    if (bytes[0] !== 0xef || bytes[1] !== 0xbb || bytes[2] !== 0xbf) fail('Download sem BOM UTF-8.');
    if (!text.includes('\r\n') || (text.match(/-->/g) || []).length !== 3) fail('Download com formato inesperado.');
    step(`Download ok: ${dl.headers.get('content-disposition')}`);

    if (cleanup) {
      await cleanup(job.id);
      step('Job de teste apagado do banco');
    }
    console.log(`✓ Tudo certo em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    server?.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => fail(e instanceof Error ? e.message : String(e)));
