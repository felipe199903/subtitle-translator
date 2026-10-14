import { promises as fs } from 'fs';
import http from 'http';
import path from 'path';
import { FileStatus, STATUS_LABELS } from './classify';
import { config } from './config';
import { FileRow, StateRepository } from './state';
import { ACTION_LABELS, GROUP_LABELS, MEASURE_LABELS, Measure, SYNC_FILES, SyncGroup, actionsOf, byGroup, loadSync, summary } from './sync';
import { AutoTranslator } from './worker';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE').slice(0, 16) : '');

const ORDER: FileStatus[] = ['translated', 'pending', 'waiting', 'failed', 'superseded', 'no_english', 'image_only', 'no_speech', 'has_ptbr', 'audio_pt'];

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

  return shell(
    'traducoes',
    `<p class="muted">Hoje: ${today}/${config.dailyLimit} · ${config.filesPerCycle} arquivo(s) a cada ${config.cycleMinutes} min · espera ${config.waitDays} dias após o vídeo chegar ·
última varredura: ${worker.lastScanAt ? worker.lastScanAt.toLocaleString('sv-SE').slice(0, 16) : 'em andamento'}${
      cooldown ? ` · <b>em pausa até ${cooldown.toLocaleString('sv-SE').slice(0, 16)}</b>` : ''
    }</p>
<p class="muted">${engineLine(worker)}${transcriptionLine()}</p>
<div class="cards">${cards}</div>
${body}`
  );
}

function transcriptionLine(): string {
  const parts = [config.ocr ? 'OCR de legendas em imagem (PGS)' : '', config.whisperUrl ? 'transcrição do áudio (Whisper)' : ''].filter(Boolean);
  return parts.length ? `<br>Sem legenda em inglês em texto: ${parts.join(' e ')}, depois traduz para PT-BR.` : '';
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR');
const secs = (v: string) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s` : '');
const base = (p: string) => esc(path.basename(p || ''));

async function syncPage(action: string | null, groupParam: string | null): Promise<string> {
  const all = await loadSync();
  if (!all) {
    return shell('sincronia', `<p class="muted">Nenhuma medição encontrada em <code>${esc(config.syncDir)}</code> (sincronia.csv / correcao.csv).</p>`);
  }
  const group = groupParam && groupParam in GROUP_LABELS ? (groupParam as SyncGroup) : null;
  const d = byGroup(all, group);
  const link = (params: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries({ grupo: group, ...params }).filter(([, v]) => v) as [string, string][]).toString();
    return `/sincronia${q ? `?${q}` : ''}`;
  };
  const groups = ([[null, 'Tudo'], ...Object.entries(GROUP_LABELS)] as Array<[string | null, string]>)
    .map(([g, l]) => `<a class="pill ${group === g ? 'on' : ''}" href="${g ? `/sincronia?grupo=${g}` : '/sincronia'}">${l}</a>`)
    .join('');
  const s = summary(d);
  const at = (f: string) => (d.updatedAt[f] ? d.updatedAt[f]!.toLocaleString('sv-SE').slice(0, 16) : '—');
  const card = (n: number, label: string, href?: string, on = false) =>
    href
      ? `<a class="card ${on ? 'on' : ''}" href="${href}"><b>${fmtNum(n)}</b><span>${label}</span></a>`
      : `<div class="card"><b>${fmtNum(n)}</b><span>${label}</span></div>`;
  const overview = [
    card(s.total, 'Legendas PT-BR medidas'),
    card(s.inSync, 'Em sincronia agora'),
    card(s.toFix, 'A corrigir'),
    ...Object.entries(ACTION_LABELS).map(([k, l]) => card(s.byAction[k] ?? 0, l, link({ acao: k }), action === k)),
  ].join('');
  const measures = (Object.keys(MEASURE_LABELS) as Measure[]).map(k => card(s.byMeasure[k], MEASURE_LABELS[k])).join('');
  const rows = actionsOf(d, action, action ? 5000 : 30);
  const list = rows.length
    ? `<table><thead><tr><th>Legenda</th><th>Ação</th><th>Atraso antes</th><th>Medido no vídeo</th><th>Ritmo</th><th>Referência</th></tr></thead><tbody>${rows
        .map(
          r => `<tr><td title="${esc(r.legenda)}">${base(r.legenda)}</td><td>${esc(r.acao)}</td><td>${secs(r.atraso_antes)}</td><td>${secs(r.atraso_s)}</td>
<td>${esc(r.ritmo_antes)}${r.ritmo && r.ritmo !== r.ritmo_antes ? ` → ${esc(r.ritmo)}` : ''}</td><td>${esc(r.referencia)}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '<p class="muted">Nada aqui.</p>';
  return shell(
    'sincronia',
    `<p class="muted">Legendas PT-BR de filmes, séries e animes medidas contra o próprio vídeo (ffsubsync no Bazarr), toda semana. Antes de corrigir ou apagar,
uma cópia vai para <code>backup-legendas</code>; as apagadas são buscadas de novo pelo Bazarr e, sem legenda humana, a tradução automática cobre o vídeo.<br>
Medição: ${at('sincronia.csv')} · correção: ${at('correcao.csv')} · ${SYNC_FILES.map(f => `<a href="/sincronia/${f}">${f}</a>`).join(' · ')}</p>
<p class="pills">${groups}</p>
<div class="cards">${overview}</div>
<h2>Resultado da medição</h2><div class="cards">${measures}</div>
<h2>${action ? `${esc(ACTION_LABELS[action] ?? action)} <small>(${rows.length})</small> · <a href="${link({})}">voltar</a>` : 'Últimas ações da correção'}</h2>${list}`
  );
}

function shell(tab: 'traducoes' | 'sincronia', content: string): string {
  const nav = (id: string, href: string, label: string) => `<a class="${tab === id ? 'on' : ''}" href="${href}">${label}</a>`;
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
nav{display:flex;gap:4px;margin:12px 0 4px;border-bottom:1px solid var(--line)}
nav a{padding:6px 12px;text-decoration:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
nav a.on{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
code{font-size:12px}
.pills{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0}.pill{padding:3px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--muted)}
.pill.on{border-color:var(--accent);color:var(--fg)}
@media (max-width:640px){th:nth-child(n+4),td:nth-child(n+4){display:none}}
</style></head><body><main>
<h1>Tradução automática de legendas (PT-BR)</h1>
<nav>${nav('traducoes', '/', 'Traduções')}${nav('sincronia', '/sincronia', 'Sincronia')}</nav>
${content}
</main></body></html>`;
}

function engineLine(worker: AutoTranslator): string {
  const g = worker.engine.gemini;
  if (!g) return 'Motor: Google gratuito (sem GEMINI_API_KEY).';
  const models = g
    .usage()
    .map(u => `${esc(u.model)}: ${u.requests} pedidos hoje${u.exhaustedUntil ? ` <b>(cota esgotada até ${fmtDate(u.exhaustedUntil)})</b>` : ''}`)
    .join(' · ');
  return `Motor: Gemini (Google gratuito de reserva) · ${models}${g.lastError ? ` · último erro: ${esc(g.lastError)}` : ''}`;
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
            engine: worker.engine.label,
            gemini: worker.engine.gemini
              ? { usage: worker.engine.gemini.usage(), lastModel: worker.engine.gemini.lastModel, lastError: worker.engine.gemini.lastError }
              : null,
          };
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
        } else if (url.pathname === '/api/retry' && req.method === 'POST') {
          // Puts a file that is stuck in a final status (failed, no_speech, no_english) back in the queue.
          const video = url.searchParams.get('video') || '';
          const row = await state.get(video);
          if (!row) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('vídeo não está no mapa');
          } else {
            await state.upsertMany([{ ...row, status: 'pending', attempts: 0, detail: 'nova tentativa pedida' }]);
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ video, status: 'pending' }));
          }
        } else if (url.pathname === '/api/files.csv') {
          const rows = await state.list(status, 100000, 'recent');
          res
            .writeHead(200, {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="legendas-${status || 'todas'}.csv"`,
            })
            .end(csv(rows));
        } else if (url.pathname === '/sincronia') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await syncPage(url.searchParams.get('acao'), url.searchParams.get('grupo')));
        } else if (url.pathname.startsWith('/sincronia/') && SYNC_FILES.includes(url.pathname.slice(11))) {
          const f = url.pathname.slice(11);
          res
            .writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${f}"` })
            .end(await fs.readFile(path.join(config.syncDir, f)));
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
