import http from 'http';
import { FileStatus, STATUS_LABELS } from './classify';
import { config } from './config';
import { FileRow, StateRepository } from './state';
import { AutoTranslator } from './worker';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE').slice(0, 16) : '');

const ORDER: FileStatus[] = ['translated', 'pending', 'waiting', 'failed', 'superseded', 'no_english', 'image_only', 'has_ptbr', 'audio_pt'];

function table(rows: FileRow[], cols: Array<[string, (r: FileRow) => string]>) {
  if (!rows.length) return '<p class="muted">Nada aqui.</p>';
  return `<table><thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map(r => `<tr>${cols.map(([, f]) => `<td>${f(r)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

const name = (r: FileRow) => `<span title="${esc(r.video)}">${esc(r.video)}</span>`;

async function page(state: StateRepository, worker: AutoTranslator, status: string | null): Promise<string> {
  const counts = await state.counts();
  const cooldown = await worker.cooldownUntil();
  const today = await worker.translatedToday();
  const cards = ORDER.map(
    s => `<a class="card ${status === s ? 'on' : ''}" href="/?status=${s}"><b>${(counts[s] ?? 0).toLocaleString('pt-BR')}</b><span>${STATUS_LABELS[s]}</span></a>`
  ).join('');

  let body: string;
  if (status) {
    const rows = await state.list(status, 2000, status === 'translated' ? 'translated' : status === 'pending' ? 'queue' : 'recent');
    body = `<h2>${esc(STATUS_LABELS[status as FileStatus] ?? status)} <small>(${rows.length}${rows.length === 2000 ? '+' : ''})</small></h2>
      <p><a href="/api/files.csv?status=${esc(status)}">Baixar CSV</a> · <a href="/">voltar</a></p>
      ${table(rows, [
        ['Vídeo', name],
        ['Detalhe', r => esc(r.detail)],
        ['Tentativas', r => String(r.attempts)],
        ['Atualizado', r => fmtDate(r.updatedAt)],
      ])}`;
  } else {
    const recent = await state.list('translated', 25, 'translated');
    const queue = await state.list('pending', 15, 'queue');
    const failed = await state.list('failed', 15, 'recent');
    body = `<h2>Últimas traduzidas</h2>${table(recent, [
      ['Quando', r => fmtDate(r.translatedAt)],
      ['Vídeo', name],
      ['Falas', r => `${r.cues ?? ''}${r.untranslated ? ` (${r.untranslated} iguais)` : ''}`],
      ['Fonte', r => esc(r.detail)],
    ])}
      <h2>Próximas da fila</h2>${table(queue, [['Vídeo', name], ['Fonte', r => esc(r.source)], ['Obs.', r => esc(r.detail)]])}
      <h2>Falhas</h2>${table(failed, [['Vídeo', name], ['Motivo', r => esc(r.detail)]])}`;
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tradução automática de legendas</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--card:#f5f5f7;--accent:#0a84ff}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#f5f5f7;--muted:#a1a1a6;--line:#2c2c2e;--card:#1c1c1e}}
body{margin:0;padding:24px 16px;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1200px;margin:auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted,small{color:var(--muted)}a{color:var(--accent)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;text-decoration:none;color:inherit}
.card.on{border-color:var(--accent)}.card b{display:block;font-size:20px}.card span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
th{color:var(--muted);font-weight:600}td:first-child{width:auto}
</style></head><body><main>
<h1>Tradução automática de legendas (EN → PT-BR)</h1>
<p class="muted">Hoje: ${today}/${config.dailyLimit} · ${config.filesPerCycle} arquivo(s) a cada ${config.cycleMinutes} min · espera ${config.waitDays} dias após o vídeo chegar ·
última varredura: ${worker.lastScanAt ? worker.lastScanAt.toLocaleString('sv-SE').slice(0, 16) : 'em andamento'}${
    cooldown ? ` · <b>em pausa até ${cooldown.toLocaleString('sv-SE').slice(0, 16)}</b>` : ''
  }</p>
<div class="cards">${cards}</div>
${body}
</main></body></html>`;
}

function csv(rows: FileRow[]): string {
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return (
    '﻿video;status;detalhe;tentativas;falas;iguais;traduzida_em;atualizado_em\r\n' +
    rows.map(r => [r.video, r.status, r.detail, r.attempts, r.cues, r.untranslated, r.translatedAt, r.updatedAt].map(q).join(';')).join('\r\n')
  );
}

/** Status page: http://<server>:PORT (HTML), /api/status and /api/files.csv. */
export function startServer(state: StateRepository, worker: AutoTranslator) {
  http
    .createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        const status = url.searchParams.get('status');
        if (url.pathname === '/api/status') {
          const body = {
            counts: await state.counts(),
            translatedToday: await worker.translatedToday(),
            dailyLimit: config.dailyLimit,
            cooldownUntil: (await worker.cooldownUntil())?.toISOString() ?? null,
            lastScanAt: worker.lastScanAt?.toISOString() ?? null,
          };
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
        } else if (url.pathname === '/api/files.csv') {
          const rows = await state.list(status, 100000, 'recent');
          res
            .writeHead(200, {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="legendas-${status || 'todas'}.csv"`,
            })
            .end(csv(rows));
        } else if (url.pathname === '/') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await page(state, worker, status));
        } else {
          res.writeHead(404).end('not found');
        }
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String((e as Error).message));
      }
    })
    .listen(config.port);
}
