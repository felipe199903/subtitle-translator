import { randomUUID } from 'crypto';
import { Db } from './client';
import { Cue } from '../srt/SrtParser';
import { TranslatedCue, TranslationSource } from '../translation/TranslationPipeline';
import { CueWarning } from '../srt/CueText';

export type JobStatus = 'translating' | 'done' | 'error';

export interface JobCue extends Cue {
  position: number;
  translation: string | null;
  source: TranslationSource | null;
  warnings: CueWarning[];
}

export interface JobMeta {
  id: string;
  fileName: string;
  from: string;
  to: string;
  detectedLanguage: string;
  encoding: string;
  parseWarnings: string[];
  status: JobStatus;
  error: string | null;
  createdAt: number;
}

export interface NewJob {
  fileName: string;
  from: string;
  to: string;
  detectedLanguage: string;
  encoding: string;
  parseWarnings: string[];
  cues: Cue[];
}

const CUE_COLUMNS = `position, idx, start_ts, end_ts, pos_tag, text, translation, source, warnings`;

/** Jobs and their cues, stored in Postgres so any serverless instance can continue a job. */
export class JobRepository {
  constructor(private db: Db) {}

  async create(job: NewJob): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO jobs (id, file_name, src_lang, tgt_lang, detected_language, encoding, parse_warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [id, job.fileName, job.from, job.to, job.detectedLanguage, job.encoding, JSON.stringify(job.parseWarnings)]
    );
    const c = job.cues;
    await this.db.query(
      `INSERT INTO cues (job_id, position, idx, start_ts, end_ts, pos_tag, text)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[])`,
      [
        id,
        c.map((_, i) => i),
        c.map(x => x.index),
        c.map(x => x.start),
        c.map(x => x.end),
        c.map(x => x.positionTag ?? null),
        c.map(x => x.text),
      ]
    );
    return id;
  }

  /** Job metadata, or null when it does not exist. Reading a job keeps it from expiring. */
  async getMeta(id: string): Promise<JobMeta | null> {
    if (!isUuid(id)) return null;
    const [r] = await this.db.query(
      `UPDATE jobs SET updated_at = now() WHERE id = $1
       RETURNING id, file_name, src_lang, tgt_lang, detected_language, encoding, parse_warnings, status, error, created_at`,
      [id]
    );
    if (!r) return null;
    return {
      id: r.id,
      fileName: r.file_name,
      from: r.src_lang,
      to: r.tgt_lang,
      detectedLanguage: r.detected_language,
      encoding: r.encoding,
      parseWarnings: r.parse_warnings ?? [],
      status: r.status,
      error: r.error,
      createdAt: new Date(r.created_at).getTime(),
    };
  }

  async cues(id: string, positions?: number[]): Promise<JobCue[]> {
    const rows = positions
      ? await this.db.query(
          `SELECT ${CUE_COLUMNS} FROM cues WHERE job_id = $1 AND position = ANY($2::int[]) ORDER BY position`,
          [id, positions]
        )
      : await this.db.query(`SELECT ${CUE_COLUMNS} FROM cues WHERE job_id = $1 ORDER BY position`, [id]);
    return rows.map(rowToCue);
  }

  async progress(id: string): Promise<{ done: number; total: number }> {
    const [r] = await this.db.query(
      `SELECT COUNT(*)::int AS total, COUNT(translation)::int AS done FROM cues WHERE job_id = $1`,
      [id]
    );
    return { done: r?.done ?? 0, total: r?.total ?? 0 };
  }

  /** The next untranslated cues, in order, up to `maxChars` of source text (at least one cue). */
  async pendingCues(id: string, maxChars: number): Promise<JobCue[]> {
    const rows = await this.db.query(
      `SELECT ${CUE_COLUMNS} FROM cues WHERE job_id = $1 AND translation IS NULL ORDER BY position LIMIT 1000`,
      [id]
    );
    const picked: JobCue[] = [];
    let size = 0;
    for (const r of rows) {
      if (picked.length && size + r.text.length > maxChars) break;
      picked.push(rowToCue(r));
      size += r.text.length;
    }
    return picked;
  }

  /** Stores machine results. Cues the user already edited are left untouched. */
  async saveResults(id: string, results: Array<[number, TranslatedCue]>): Promise<void> {
    const list = results.filter(([, r]) => r.source !== 'user');
    const user = results.filter(([, r]) => r.source === 'user');
    if (list.length) {
      await this.db.query(
        `UPDATE cues SET translation = u.translation, source = u.source, warnings = u.warnings::jsonb
         FROM unnest($2::int[], $3::text[], $4::text[], $5::text[]) AS u(position, translation, source, warnings)
         WHERE cues.job_id = $1 AND cues.position = u.position AND cues.source IS DISTINCT FROM 'user'`,
        [
          id,
          list.map(([p]) => p),
          list.map(([, r]) => r.translation),
          list.map(([, r]) => r.source),
          list.map(([, r]) => JSON.stringify(r.warnings)),
        ]
      );
    }
    // Memory hits that are user corrections are always applied.
    for (const [p, r] of user) await this.saveCue(id, p, r);
  }

  /** Stores one cue unconditionally (used for user edits). */
  async saveCue(id: string, position: number, r: Pick<TranslatedCue, 'translation' | 'source' | 'warnings'>): Promise<JobCue | null> {
    const [row] = await this.db.query(
      `UPDATE cues SET translation = $3, source = $4, warnings = $5::jsonb
       WHERE job_id = $1 AND position = $2 RETURNING ${CUE_COLUMNS}`,
      [id, position, r.translation, r.source, JSON.stringify(r.warnings)]
    );
    return row ? rowToCue(row) : null;
  }

  async setStatus(id: string, status: JobStatus, error: string | null = null): Promise<void> {
    await this.db.query(`UPDATE jobs SET status = $2, error = $3, updated_at = now() WHERE id = $1`, [id, status, error]);
  }

  /** Clears machine translations flagged as untranslated so they are translated again. */
  async resetUntranslated(id: string): Promise<number> {
    const rows = await this.db.query(
      `UPDATE cues SET translation = NULL, source = NULL, warnings = '[]'::jsonb
       WHERE job_id = $1 AND warnings ? 'untranslated' AND source IS DISTINCT FROM 'user'
       RETURNING position`,
      [id]
    );
    return rows.length;
  }

  async deleteOlderThan(days: number): Promise<number> {
    const rows = await this.db.query(
      `DELETE FROM jobs WHERE updated_at < now() - make_interval(days => $1) RETURNING id`,
      [days]
    );
    return rows.length;
  }
}

function rowToCue(r: any): JobCue {
  return {
    position: r.position,
    index: r.idx,
    start: r.start_ts,
    end: r.end_ts,
    ...(r.pos_tag ? { positionTag: r.pos_tag } : {}),
    text: r.text,
    translation: r.translation,
    source: r.source,
    warnings: r.warnings ?? [],
  } as JobCue;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
