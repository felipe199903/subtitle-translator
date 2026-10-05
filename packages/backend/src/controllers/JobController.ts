import { Request, Response } from 'express';
import path from 'path';
import { parseSrt, serializeSrt } from '../srt/SrtParser';
import { TranslationPipeline } from '../translation/TranslationPipeline';
import { LanguageDetectionService } from '../services/LanguageDetectionService';
import { JobCue, JobMeta, JobRepository } from '../db/jobs';
import { MemoryRepository } from '../db/memory';
import { UserRepository } from '../db/users';
import { LIMITS, planOf } from '../auth/plans';
import { currentUser } from '../auth/session';
import { safe } from './safe';

/** Source characters translated per /translate call: ~300 cues, about a second of work. */
const BATCH_CHARS = 12000;
/** The AI engine is slower: smaller calls (in parallel groups) stay well inside the 60 s limit. */
const AI_BATCH_CHARS = 5000;
const AI_GROUP_CHARS = 1800;
const JOB_TTL_DAYS = 7;

export class JobController {
  private detector = new LanguageDetectionService();

  constructor(
    private jobs: JobRepository,
    private memory: MemoryRepository,
    private pipeline: TranslationPipeline,
    private users: UserRepository,
    /** Used for jobs whose owner is on Pro (AI engine when configured). */
    private proPipeline: TranslationPipeline = pipeline,
    private proUsesAi = false,
    private defaults = { from: 'en', to: 'pt-BR' }
  ) {}

  create = safe(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado. Selecione um arquivo .srt.' });
      return;
    }

    const { cues, warnings, encoding } = parseSrt(req.file.buffer);
    if (cues.length === 0) {
      res.status(400).json({ error: 'Não encontramos nenhuma legenda válida. Verifique se o arquivo está no formato .srt.' });
      return;
    }

    const user = currentUser(res);
    const plan = planOf(user);
    const limits = LIMITS[plan];
    if (cues.length > limits.maxCues) {
      const canUpgrade = plan === 'free' && cues.length <= LIMITS.pro.maxCues;
      res.status(canUpgrade ? 402 : 400).json({
        error: canUpgrade
          ? `O arquivo tem ${cues.length} falas; o plano grátis aceita até ${limits.maxCues}. Assine o Pro para traduzir arquivos de até ${LIMITS.pro.maxCues} falas.`
          : `O arquivo tem ${cues.length} falas; o máximo é ${limits.maxCues}.`,
        ...(canUpgrade ? { code: 'TOO_LONG' } : {}),
      });
      return;
    }
    if ((await this.users.usageThisMonth(user.id)) >= limits.filesPerMonth) {
      res.status(plan === 'free' ? 402 : 429).json({
        error:
          plan === 'free'
            ? `Você já usou as ${limits.filesPerMonth} traduções grátis deste mês. Assine o Pro para continuar.`
            : `Você atingiu o limite de uso justo de ${limits.filesPerMonth} arquivos neste mês. Fale com o suporte se precisar de mais.`,
        code: 'QUOTA',
      });
      return;
    }

    const detectedLanguage = this.detector.detectLanguage(cues.map(c => c.text).join(' '));
    const to = typeof req.body?.to === 'string' && req.body.to ? req.body.to : this.defaults.to;
    // If the file is clearly in another supported language, translate from it; otherwise use the default.
    const from =
      typeof req.body?.from === 'string' && req.body.from
        ? req.body.from
        : detectedLanguage !== 'unknown' && detectedLanguage !== 'pt'
          ? detectedLanguage
          : this.defaults.from;

    const parseWarnings = [...warnings];
    if (detectedLanguage === 'pt') parseWarnings.unshift('Este arquivo parece já estar em português.');
    if (encoding === 'windows-1252') {
      parseWarnings.push('O arquivo não estava em UTF-8; foi lido como Windows-1252 (Latin-1).');
    }

    // Opportunistic cleanup instead of a cron job.
    await this.jobs.deleteOlderThan(JOB_TTL_DAYS).catch(e => console.warn('Limpeza de jobs falhou:', e));

    const id = await this.jobs.create({
      userId: user.id,
      fileName: path.basename(req.file.originalname),
      from,
      to,
      detectedLanguage,
      encoding,
      parseWarnings,
      cues,
    });
    await this.users.incrementUsage(user.id);
    res.status(201).json({ data: await this.fullView(id) });
  });

  get = safe(async (req, res) => {
    const meta = await this.ownedMeta(req, res);
    if (!meta) return this.notFound(res);
    res.json({ data: this.view(meta, await this.jobs.cues(meta.id)) });
  });

  /**
   * Translates the next batch of pending cues. The browser calls this in a loop until
   * the status is "done", so no work ever runs after a response (serverless-friendly)
   * and a reloaded page simply continues where it stopped.
   */
  translate = safe(async (req, res) => {
    const meta = await this.ownedMeta(req, res);
    if (!meta) return this.notFound(res);

    let cues: JobCue[] = [];
    if (meta.status === 'translating') {
      const ai = this.proUsesAi && planOf(currentUser(res)) === 'pro';
      const pending = await this.jobs.pendingCues(meta.id, ai ? AI_BATCH_CHARS : BATCH_CHARS);
      if (pending.length) {
        const results = ai
          ? await this.proPipeline.translate(pending, { from: meta.from, to: meta.to, groupChars: AI_GROUP_CHARS })
          : await this.pipeline.translate(pending, { from: meta.from, to: meta.to });
        await this.jobs.saveResults(meta.id, results.map((r, i) => [pending[i].position, r]));
        cues = await this.jobs.cues(meta.id, pending.map(c => c.position));
      }
    }

    const progress = await this.jobs.progress(meta.id);
    let status = meta.status;
    if (status === 'translating' && progress.done >= progress.total) {
      status = 'done';
      await this.jobs.setStatus(meta.id, 'done');
    }
    res.json({ data: { status, progress, cues } });
  });

  editCue = safe(async (req, res) => {
    const meta = await this.ownedMeta(req, res);
    if (!meta) return this.notFound(res);
    const pos = Number(req.params.position);
    const [cue] = Number.isInteger(pos) ? await this.jobs.cues(meta.id, [pos]) : [];
    if (!cue) {
      res.status(404).json({ error: 'Legenda não encontrada.' });
      return;
    }
    const translation = req.body?.translation;
    if (typeof translation !== 'string' || !translation.trim()) {
      res.status(400).json({ error: 'A tradução não pode ficar vazia.' });
      return;
    }

    const clean = translation.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    const saved = await this.jobs.saveCue(meta.id, pos, this.pipeline.userEdit(cue, clean));
    await this.memory.upsertMany([
      { srcNorm: TranslationPipeline.memoryKey(cue.text, meta.to), src: cue.text, tgt: clean, origin: 'user' },
    ]);
    res.json({ data: { position: pos, cue: saved } });
  });

  retry = safe(async (req, res) => {
    const meta = await this.ownedMeta(req, res);
    if (!meta) return this.notFound(res);
    const retrying = await this.jobs.resetUntranslated(meta.id);
    if (retrying) await this.jobs.setStatus(meta.id, 'translating');
    res.json({ data: { retrying } });
  });

  download = safe(async (req, res) => {
    const meta = await this.ownedMeta(req, res);
    if (!meta) return this.notFound(res);
    if (meta.status === 'translating') {
      res.status(409).json({ error: 'A tradução ainda está em andamento.' });
      return;
    }
    const cues = await this.jobs.cues(meta.id);
    const content = serializeSrt(
      cues.map(c => ({ start: c.start, end: c.end, positionTag: c.positionTag, text: c.translation ?? c.text }))
    );
    const base = meta.fileName.replace(/\.srt$/i, '').replace(/\.(en|eng|english)$/i, '');
    const outName = `${base}.${meta.to}.srt`;
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${outName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(outName)}`
    );
    res.send(Buffer.from(content, 'utf8'));
  });

  stats = safe(async (_req, res) => {
    res.json({ data: { memory: await this.memory.stats() } });
  });

  private notFound(res: Response): void {
    res.status(404).json({ error: 'Tradução não encontrada ou expirada. Envie o arquivo novamente.' });
  }

  private async fullView(id: string) {
    const meta = await this.jobs.getMeta(id);
    if (!meta) return null;
    const cues = await this.jobs.cues(meta.id);
    return this.view(meta, cues);
  }

  /** The job, only when it belongs to the signed-in user; other people's jobs look like missing ones. */
  private async ownedMeta(req: Request, res: Response): Promise<JobMeta | null> {
    const meta = await this.jobs.getMeta(req.params.id);
    return meta && meta.userId === currentUser(res).id ? meta : null;
  }

  private view(meta: JobMeta, cues: JobCue[]) {
    const warningCounts: Record<string, number> = {};
    for (const c of cues) for (const w of c.warnings) warningCounts[w] = (warningCounts[w] ?? 0) + 1;
    const { userId: _owner, ...rest } = meta;
    return {
      ...rest,
      progress: { done: cues.filter(c => c.translation != null).length, total: cues.length },
      warningCounts,
      cues,
    };
  }
}
