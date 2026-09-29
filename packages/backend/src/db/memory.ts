import { Db } from './client';

export type MemoryOrigin = 'user' | 'mt';

export interface MemoryEntry {
  srcNorm: string;
  src: string;
  tgt: string;
  origin: MemoryOrigin;
}

/**
 * Translation memory: whole cues only, exact match on a normalized key.
 * `user` entries are corrections made in the editor and always win;
 * `mt` entries cache machine translations so re-translating a file is instant.
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

  /** Saves entries in one statement. A machine translation never overwrites a user correction. */
  async upsertMany(entries: MemoryEntry[]): Promise<void> {
    // Within one statement a key may appear only once; the last entry wins.
    const byKey = new Map(entries.map(e => [e.srcNorm, e]));
    const list = [...byKey.values()];
    if (!list.length) return;
    await this.db.query(
      `INSERT INTO memory (src_norm, src, tgt, origin)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (src_norm) DO UPDATE
         SET src = excluded.src, tgt = excluded.tgt, origin = excluded.origin, updated_at = now()
         WHERE memory.origin = 'mt' OR excluded.origin = 'user'`,
      [list.map(e => e.srcNorm), list.map(e => e.src), list.map(e => e.tgt), list.map(e => e.origin)]
    );
  }

  async stats(): Promise<Record<MemoryOrigin, number>> {
    const rows = await this.db.query(`SELECT origin, COUNT(*)::int AS n FROM memory GROUP BY origin`);
    const stats = { user: 0, mt: 0 };
    for (const r of rows) stats[r.origin as MemoryOrigin] = r.n;
    return stats;
  }
}
