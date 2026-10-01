import { promises as fs } from 'fs';
import path from 'path';
import { Cue, parseSrt, serializeSrt } from '../../backend/src/srt/SrtParser';
import { assToCues } from './ass';
import { TranslationPipeline } from '../../backend/src/translation/TranslationPipeline';
import { TranslationProvider, sleep } from '../../backend/src/translation/TranslationProvider';
import { GeminiProvider } from '../../backend/src/translation/GeminiProvider';
import {
  Decision,
  EmbeddedInfo,
  ProbeStream,
  decide,
  embeddedInfo,
  mtFileName,
  needsProbe,
  sidecars,
} from './classify';
import { config } from './config';
import { log } from './log';
import { extractSubtitle, listVideos, probeStreams } from './media';
import { FileRow, StateRepository } from './state';

const DAY_MS = 86_400_000;
/** Fewer dialogue cues than this in an embedded track means it is probably signs/songs only. */
const MIN_DIALOGUE_CUES = 30;

/** How many texts were sent to a provider and how many came back empty (per file). */
export class ProviderStats {
  sent = 0;
  failed = 0;
  reset() {
    this.sent = this.failed = 0;
  }
  get failRatio() {
    return this.sent ? this.failed / this.sent : 0;
  }
}

/** Waits before every request, so the free endpoint sees a slow, steady trickle. */
export class PacedProvider implements TranslationProvider {
  readonly name: string;
  constructor(private inner: TranslationProvider, private delayMs: number, private stats?: ProviderStats) {
    this.name = inner.name;
  }
  async translateBatch(texts: string[], from: string, to: string) {
    await sleep(this.delayMs);
    const out = await this.inner.translateBatch(texts, from, to);
    if (this.stats) {
      this.stats.sent += texts.length;
      this.stats.failed += out.filter(t => t == null).length;
    }
    return out;
  }
}

/** The main translator, as the worker needs to know it. */
export interface Engine {
  /** Shown in logs and messages ("Gemini", "Google"). */
  label: string;
  /** Characters of text per request to the main translator. */
  groupChars: number;
  gemini?: GeminiProvider;
}

export class AutoTranslator {
  lastScanAt: Date | null = null;
  running = false;

  constructor(
    private state: StateRepository,
    private pipeline: TranslationPipeline,
    /** Counters of the main provider, to tell a refusal apart from unchanged cues. */
    private primaryStats: ProviderStats,
    readonly engine: Engine
  ) {}

  /** Looks at the video and the files next to it right now and decides what to do. */
  private async evaluate(
    video: { path: string; size: number; mtimeMs: number; siblings: string[] },
    previous?: FileRow
  ): Promise<{ decision: Decision; probe: ProbeStream[] | null; error?: string }> {
    const side = sidecars(video.path, video.siblings);
    let probe: ProbeStream[] | null = null;
    let embedded: EmbeddedInfo | null = null;
    let error: string | undefined;
    if (needsProbe(side)) {
      const cached = previous && previous.size === video.size && previous.mtimeMs === video.mtimeMs ? previous.probe : null;
      try {
        probe = (cached as ProbeStream[]) ?? (await probeStreams(video.path));
        embedded = embeddedInfo(probe);
      } catch (e) {
        error = `ffprobe falhou: ${(e as Error).message}`.slice(0, 300);
      }
    }
    const ageDays = (Date.now() - video.mtimeMs) / DAY_MS;
    return { decision: decide(side, embedded, ageDays, config.waitDays), probe: probe ?? (previous?.probe as any) ?? null, error };
  }

  /** Full scan: updates the map, removes our subtitles where a human PT-BR arrived. */
  async scan(): Promise<Record<string, number>> {
    const started = Date.now();
    const videos = await listVideos(config.mediaRoots, config.minVideoMb * 1024 * 1024);
    const known = await this.state.all();
    const changed: FileRow[] = [];

    for (const v of videos) {
      const prev = known.get(v.path);
      const { decision, probe, error } = await this.evaluate(v, prev);
      if (decision.deleteMt) {
        await fs.unlink(mtFileName(v.path)).catch(() => undefined);
        log('Legenda humana PT-BR encontrada; tradução automática removida:', v.path);
      }
      const row = this.nextRow(v, prev, decision, probe, error);
      if (!prev || rowChanged(prev, row)) changed.push(row);
    }

    await this.state.upsertMany(changed);
    const removed = await this.state.deleteMissing(new Set(videos.map(v => v.path)));
    this.lastScanAt = new Date();
    const counts = await this.state.counts();
    log(
      `Varredura: ${videos.length} vídeos em ${Math.round((Date.now() - started) / 1000)}s,`,
      `${changed.length} atualizados, ${removed} removidos do mapa ·`,
      Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(' ')
    );
    return counts;
  }

  private nextRow(
    v: { path: string; size: number; mtimeMs: number },
    prev: FileRow | undefined,
    d: Decision,
    probe: ProbeStream[] | null,
    error?: string
  ): FileRow {
    let status = d.status;
    let detail = error ?? null;
    // A file that already failed too often stays "failed" until it changes on disk.
    const sameFile = prev && prev.size === v.size && prev.mtimeMs === v.mtimeMs;
    if (status === 'pending' && prev?.status === 'failed' && sameFile) {
      status = 'failed';
      detail = prev.detail;
    } else if (status === 'pending' && prev?.status === 'pending' && prev.detail) {
      detail = prev.detail;
    }
    return {
      video: v.path,
      status,
      source: d.source ?? null,
      detail,
      size: v.size,
      mtimeMs: v.mtimeMs,
      probe,
      attempts: sameFile ? prev!.attempts : 0,
      cues: status === 'translated' ? prev?.cues ?? null : null,
      untranslated: status === 'translated' ? prev?.untranslated ?? null : null,
      translatedAt: status === 'translated' ? prev?.translatedAt ?? null : null,
      updatedAt: new Date().toISOString(),
    };
  }

  async cooldownUntil(): Promise<Date | null> {
    const v = await this.state.getMeta('cooldown_until');
    const d = v ? new Date(v) : null;
    return d && d.getTime() > Date.now() ? d : null;
  }

  async translatedToday(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.state.translatedSince(start.toISOString());
  }

  /** Translates up to FILES_PER_CYCLE queued videos (newest first), within the daily limit. */
  async translateQueued(): Promise<void> {
    const cooldown = await this.cooldownUntil();
    if (cooldown) return log(`Em pausa até ${cooldown.toLocaleString('sv-SE')} (tradutor recusando pedidos).`);

    let budget = Math.min(config.filesPerCycle, config.dailyLimit - (await this.translatedToday()));
    if (budget <= 0) return;

    for (const row of await this.state.list('pending', 50, 'queue')) {
      if (budget <= 0) break;
      const done = await this.translateOne(row);
      if (done === 'translated') budget--;
      if (done === 'stop') break;
    }
  }

  /** Returns 'translated', 'skipped' (no longer applies) or 'stop' (translator refusing). */
  private async translateOne(row: FileRow): Promise<'translated' | 'skipped' | 'stop'> {
    // Re-check right before translating: a human subtitle may have arrived since the scan.
    const st = await fs.stat(row.video).catch(() => null);
    if (!st) {
      await this.state.upsertMany([{ ...row, status: 'no_english', detail: 'vídeo não encontrado' }]);
      return 'skipped';
    }
    const siblings = await fs.readdir(path.dirname(row.video));
    const video = { path: row.video, size: st.size, mtimeMs: st.mtimeMs, siblings };
    const { decision, probe } = await this.evaluate(video, row);
    if (decision.status !== 'pending' || !decision.source) {
      await this.state.upsertMany([this.nextRow(video, row, decision, probe)]);
      return 'skipped';
    }

    const started = Date.now();
    const attempt = row.attempts + 1;
    try {
      const [kind, ref] = splitSource(decision.source);
      const cues = await this.loadCues(row.video, kind, ref, probe);
      if (!cues.length) {
        await this.state.upsertMany([{ ...this.nextRow(video, row, { status: 'no_english' }, probe), detail: 'legenda em inglês vazia' }]);
        return 'skipped';
      }
      if (cues.length > config.maxCues) {
        // Effects/karaoke track, not dialogue: translating it would take hours for nothing.
        return await this.fail(row, video, probe, config.maxAttempts, `${cues.length} falas: não parece diálogo (legenda de efeitos)`, false);
      }

      this.primaryStats.reset();
      const requestsBefore = this.geminiRequests();
      const results = await this.pipeline.translate(cues, {
        from: 'en',
        to: 'pt-BR',
        concurrency: 1,
        groupChars: this.engine.groupChars,
      });
      if (this.primaryStats.failRatio > config.maxProviderFailRatio) {
        const pct = Math.round(this.primaryStats.failRatio * 100);
        const why = this.engine.gemini?.lastError ? ` - ${this.engine.gemini.lastError}` : ' (limite atingido?)';
        return await this.fail(row, video, probe, attempt, `${this.engine.label} não respondeu ${pct}% dos pedidos${why}`, true);
      }
      const fallbackCues = results.filter(r => r.source === 'fallback').length;
      const untranslated = results.filter(r => r.warnings.includes('untranslated')).length;

      const target = mtFileName(row.video);
      const tmp = `${target}.tmp`;
      await fs.writeFile(tmp, serializeSrt(results.map(r => ({ ...r, text: r.translation })), { eol: '\r\n', bom: true }), { mode: 0o664 });
      await fs.rename(tmp, target);

      await this.state.upsertMany([
        {
          ...this.nextRow(video, row, { status: 'translated', source: decision.source }, probe),
          attempts: attempt,
          cues: cues.length,
          untranslated,
          translatedAt: new Date().toISOString(),
          detail: `fonte: ${kind === 'external' ? path.basename(ref) : `faixa embutida #${ref}`} · ${this.engineNote(fallbackCues)}`,
        },
      ]);
      await this.state.setMeta('cooldown_streak', '0');
      const requests = this.geminiRequests() - requestsBefore;
      log(
        `Traduzida (${cues.length} falas, ${Math.round((Date.now() - started) / 1000)}s, ${this.engineNote(fallbackCues)}` +
          `${this.engine.gemini ? `, ${requests} pedidos` : ''}):`,
        target
      );
      return 'translated';
    } catch (e) {
      return this.fail(row, video, probe, attempt, (e as Error).message, false);
    }
  }

  /** "gemini-3.5-flash" / "Google", plus how many cues needed the fallback. */
  private engineNote(fallbackCues: number): string {
    const name = this.engine.gemini?.lastModel ?? this.engine.label;
    return fallbackCues ? `${name} + ${fallbackCues} pelo reserva` : name;
  }

  private geminiRequests(): number {
    return this.engine.gemini?.usage().reduce((n, u) => n + u.requests, 0) ?? 0;
  }

  /** When every Gemini model is out of quota, the earliest moment one comes back. */
  private geminiQuotaBack(): Date | null {
    const g = this.engine.gemini;
    if (!g?.unavailable) return null;
    const times = g.usage().map(u => (u.exhaustedUntil ? Date.parse(u.exhaustedUntil) : 0)).filter(Boolean);
    return times.length ? new Date(Math.min(...times)) : null;
  }

  /** English cues from an external .srt or an embedded track (ASS read directly, dialogue only). */
  async loadCues(videoPath: string, kind: string, ref: string, probe: ProbeStream[] | null): Promise<Cue[]> {
    if (kind === 'external') return parseSrt(await fs.readFile(ref)).cues;
    let cues = await this.loadTrack(videoPath, Number(ref), probe);
    if (cues.length >= MIN_DIALOGUE_CUES || !probe) return cues;
    // Nearly empty (a mislabelled signs/songs track): use the English track with the most dialogue.
    for (const other of embeddedInfo(probe).enTextStreams ?? []) {
      if (other === Number(ref)) continue;
      const alt = await this.loadTrack(videoPath, other, probe).catch(() => [] as Cue[]);
      if (alt.length > cues.length) {
        log(`Faixa #${ref} quase vazia (${cues.length} falas); usando a #${other} (${alt.length} falas):`, videoPath);
        cues = alt;
      }
    }
    return cues;
  }

  private async loadTrack(videoPath: string, index: number, probe: ProbeStream[] | null): Promise<Cue[]> {
    const codec = (probe?.find(s => s.index === index)?.codec_name || '').toLowerCase();
    if (codec === 'ass' || codec === 'ssa') {
      return assToCues((await extractSubtitle(videoPath, index, 'ass')).toString('utf8'));
    }
    return parseSrt(await extractSubtitle(videoPath, index, 'srt')).cues;
  }

  private async fail(
    row: FileRow,
    video: { path: string; size: number; mtimeMs: number },
    probe: ProbeStream[] | null,
    attempt: number,
    reason: string,
    translatorRefusing: boolean
  ): Promise<'skipped' | 'stop'> {
    if (translatorRefusing) {
      // Not the file's fault: keep it in the queue without spending an attempt.
      await this.state.upsertMany([
        {
          ...this.nextRow(video, row, { status: 'pending', source: row.source ?? undefined }, probe),
          detail: `aguardando o ${this.engine.label} liberar: ${reason}`.slice(0, 500),
        },
      ]);
      let until = this.geminiQuotaBack();
      if (!until) {
        // Consecutive refusals double the pause (6 h → 12 h → 24 h); a success resets it.
        const streak = Number((await this.state.getMeta('cooldown_streak')) ?? 0) + 1;
        until = new Date(Date.now() + Math.min(config.cooldownHours * 2 ** (streak - 1), 24) * 3_600_000);
        await this.state.setMeta('cooldown_streak', String(streak));
      }
      // (When every Gemini model is out of daily quota, resume right after it resets.)
      await this.state.setMeta('cooldown_until', until.toISOString());
      const hours = Math.round(((until.getTime() - Date.now()) / 3_600_000) * 10) / 10;
      log(`Tradutor recusando (${reason}) em`, row.video, `- pausando ${hours} h, até ${until.toLocaleString('sv-SE')}.`);
      return 'stop';
    }

    const final = attempt >= config.maxAttempts;
    await this.state.upsertMany([
      {
        ...this.nextRow(video, row, { status: final ? 'failed' : 'pending', source: row.source ?? undefined }, probe),
        status: final ? 'failed' : 'pending',
        attempts: attempt,
        detail: `tentativa ${attempt}: ${reason}`.slice(0, 500),
      },
    ]);
    log(`Falha (tentativa ${attempt}/${config.maxAttempts}):`, row.video, '-', reason);
    return 'skipped';
  }
}

function splitSource(source: string): [string, string] {
  const i = source.indexOf(':');
  return [source.slice(0, i), source.slice(i + 1)];
}

function rowChanged(a: FileRow, b: FileRow): boolean {
  return (
    a.status !== b.status ||
    a.source !== b.source ||
    a.detail !== b.detail ||
    a.size !== b.size ||
    a.mtimeMs !== b.mtimeMs ||
    JSON.stringify(a.probe) !== JSON.stringify(b.probe)
  );
}
