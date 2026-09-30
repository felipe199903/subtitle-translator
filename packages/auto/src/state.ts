import { Db } from '../../backend/src/db/client';
import { FileStatus } from './classify';

/** One row per video: the map of what was (and was not) translated, and why. */
export interface FileRow {
  video: string;
  status: FileStatus;
  source: string | null;
  detail: string | null;
  size: number;
  mtimeMs: number;
  probe: unknown | null;
  attempts: number;
  cues: number | null;
  untranslated: number | null;
  translatedAt: string | null;
  updatedAt: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auto_files (
    video TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    source TEXT,
    detail TEXT,
    size BIGINT NOT NULL DEFAULT 0,
    mtime_ms BIGINT NOT NULL DEFAULT 0,
    probe JSONB,
    attempts INT NOT NULL DEFAULT 0,
    cues INT,
    untranslated INT,
    translated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS auto_files_status_idx ON auto_files (status)`,
  `CREATE TABLE IF NOT EXISTS auto_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

const toRow = (r: any): FileRow => ({
  video: r.video,
  status: r.status,
  source: r.source,
  detail: r.detail,
  size: Number(r.size),
  mtimeMs: Number(r.mtime_ms),
  probe: r.probe,
  attempts: r.attempts,
  cues: r.cues,
  untranslated: r.untranslated,
  translatedAt: r.translated_at ? new Date(r.translated_at).toISOString() : null,
  updatedAt: new Date(r.updated_at).toISOString(),
});

export class StateRepository {
  private ready: Promise<void> | null = null;
  constructor(private db: Db) {}

  private init() {
    this.ready ??= (async () => {
      for (const s of SCHEMA) await this.db.query(s);
    })();
    return this.ready;
  }

  async all(): Promise<Map<string, FileRow>> {
    await this.init();
    const rows = await this.db.query(`SELECT * FROM auto_files`);
    return new Map(rows.map(r => [r.video, toRow(r)]));
  }

  async upsertMany(rows: FileRow[]): Promise<void> {
    await this.init();
    for (let i = 0; i < rows.length; i += 500) {
      const b = rows.slice(i, i + 500);
      await this.db.query(
        `INSERT INTO auto_files (video, status, source, detail, size, mtime_ms, probe, attempts, cues, untranslated, translated_at, updated_at)
         SELECT v, s, src, d, sz, mt, p::jsonb, a, c, u, ta::timestamptz, now()
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::bigint[], $6::bigint[], $7::text[], $8::int[], $9::int[], $10::int[], $11::text[])
           AS t(v, s, src, d, sz, mt, p, a, c, u, ta)
         ON CONFLICT (video) DO UPDATE SET
           status = excluded.status, source = excluded.source, detail = excluded.detail, size = excluded.size,
           mtime_ms = excluded.mtime_ms, probe = excluded.probe, attempts = excluded.attempts, cues = excluded.cues,
           untranslated = excluded.untranslated, translated_at = excluded.translated_at, updated_at = now()`,
        [
          b.map(r => r.video),
          b.map(r => r.status),
          b.map(r => r.source),
          b.map(r => r.detail),
          b.map(r => Math.round(r.size)),
          b.map(r => Math.round(r.mtimeMs)),
          b.map(r => (r.probe == null ? null : JSON.stringify(r.probe))),
          b.map(r => r.attempts),
          b.map(r => r.cues),
          b.map(r => r.untranslated),
          b.map(r => r.translatedAt),
        ]
      );
    }
  }

  async deleteMissing(existing: Set<string>): Promise<number> {
    await this.init();
    const rows = await this.db.query(`SELECT video FROM auto_files`);
    const gone = rows.map(r => r.video).filter(v => !existing.has(v));
    for (let i = 0; i < gone.length; i += 500) {
      await this.db.query(`DELETE FROM auto_files WHERE video = ANY($1::text[])`, [gone.slice(i, i + 500)]);
    }
    return gone.length;
  }

  async counts(): Promise<Record<string, number>> {
    await this.init();
    const rows = await this.db.query(`SELECT status, COUNT(*)::int AS n FROM auto_files GROUP BY status`);
    return Object.fromEntries(rows.map(r => [r.status, r.n]));
  }

  async list(status: string | null, limit: number, order: 'recent' | 'translated' | 'queue' = 'recent'): Promise<FileRow[]> {
    await this.init();
    const orderBy = {
      recent: 'updated_at DESC',
      translated: 'translated_at DESC NULLS LAST',
      queue: 'mtime_ms DESC',
    }[order];
    const rows = await this.db.query(
      `SELECT * FROM auto_files ${status ? 'WHERE status = $1' : ''} ORDER BY ${orderBy} LIMIT ${Math.max(1, Math.min(limit, 100000))}`,
      status ? [status] : []
    );
    return rows.map(toRow);
  }

  async translatedSince(sinceIso: string): Promise<number> {
    await this.init();
    const [r] = await this.db.query(`SELECT COUNT(*)::int AS n FROM auto_files WHERE translated_at >= $1::timestamptz`, [sinceIso]);
    return r?.n ?? 0;
  }

  async getMeta(key: string): Promise<string | null> {
    await this.init();
    const [r] = await this.db.query(`SELECT value FROM auto_meta WHERE key = $1`, [key]);
    return r?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.init();
    await this.db.query(
      `INSERT INTO auto_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }
}
