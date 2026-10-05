import { Db } from './client';

/** user: corrections typed in the editor; ai: Gemini (Pro); mt: free machine translation. */
export type MemoryOrigin = 'user' | 'ai' | 'mt';

/** Longest key cached (well under the ~8 KB limit of a Postgres btree index row). */
export const MAX_KEY_BYTES = 2000;

const RANK = (col: string) => `(CASE ${col} WHEN 'user' THEN 3 WHEN 'ai' THEN 2 ELSE 1 END)`;

export interface MemoryEntry {
  srcNorm: string;
  src: string;
  tgt: string;
  origin: MemoryOrigin;
}

/**
 * Translation memory: whole cues only, exact match on a normalized key.
 * `user` entries are corrections made in the editor and always win; `ai` entries (Gemini)
 * outrank `mt` ones (free machine translation), which only cache so re-translating is instant.
 */
export class MemoryRepository {
  constructor(private db: Db) {}

  async lookupMany(srcNorms: string[]): Promise<Map<string, MemoryEntry>> {
    const found = new Map<string, MemoryEntry>();
    const unique = [...new Set(srcNorms)];
    for (let i = 0; i < unique.length; i += 1000) {
      const rows = await this.db.query(
        `SELECT src_norm, src, tgt, origin FROM memory WHERE src_norm = ANY($1::text[])`,
        [unique.slice(i, i + 1000)]
      );
      for (const r of rows) found.set(r.src_norm, { srcNorm: r.src_norm, src: r.src, tgt: r.tgt, origin: r.origin });
    }
    return found;
  }

  /** Saves entries in one statement. An entry never overwrites one of a higher origin (user > ai > mt). */
  async upsertMany(entries: MemoryEntry[]): Promise<void> {
    // Within one statement a key may appear only once; the last entry wins. Keys too long for
    // the primary-key index (Postgres btree rows max ~8 KB) would fail the whole statement:
    // such "cues" are not dialogue anyway (e.g. ASS vector drawings), so they are not cached.
    const byKey = new Map(
      entries.filter(e => Buffer.byteLength(e.srcNorm) <= MAX_KEY_BYTES).map(e => [e.srcNorm, e])
    );
    const list = [...byKey.values()];
    if (!list.length) return;
    await this.db.query(
      `INSERT INTO memory (src_norm, src, tgt, origin)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (src_norm) DO UPDATE
         SET src = excluded.src, tgt = excluded.tgt, origin = excluded.origin, updated_at = now()
         WHERE ${RANK('excluded.origin')} >= ${RANK('memory.origin')}`,
      [list.map(e => e.srcNorm), list.map(e => e.src), list.map(e => e.tgt), list.map(e => e.origin)]
    );
  }

  async stats(): Promise<Record<MemoryOrigin, number>> {
    const rows = await this.db.query(`SELECT origin, COUNT(*)::int AS n FROM memory GROUP BY origin`);
    const stats = { user: 0, ai: 0, mt: 0 };
    for (const r of rows) stats[r.origin as MemoryOrigin] = r.n;
    return stats;
  }
}
