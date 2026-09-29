import fs from 'fs';
import path from 'path';

/** The tiny slice of a Postgres client the app needs. */
export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Releases the connection (only needed for embedded databases). */
  close?(): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS memory (
    src_norm TEXT PRIMARY KEY,
    src TEXT NOT NULL,
    tgt TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'mt',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY,
    file_name TEXT NOT NULL,
    src_lang TEXT NOT NULL,
    tgt_lang TEXT NOT NULL,
    detected_language TEXT NOT NULL,
    encoding TEXT NOT NULL,
    parse_warnings JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'translating',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS cues (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    position INT NOT NULL,
    idx INT NOT NULL,
    start_ts TEXT NOT NULL,
    end_ts TEXT NOT NULL,
    pos_tag TEXT,
    text TEXT NOT NULL,
    translation TEXT,
    source TEXT,
    warnings JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (job_id, position)
  )`,
  `CREATE INDEX IF NOT EXISTS jobs_updated_at_idx ON jobs (updated_at)`,
];

/** Wraps a raw query function so the schema is created once, before the first query. */
function withSchema(run: (sql: string, params?: unknown[]) => Promise<any[]>, close?: () => Promise<void>): Db {
  let ready: Promise<void> | null = null;
  const init = async () => {
    for (const stmt of SCHEMA) await run(stmt);
  };
  return {
    async query(sql, params) {
      ready ??= init().catch(e => {
        ready = null; // let the next request try again
        throw e;
      });
      await ready;
      return run(sql, params);
    },
    close,
  };
}

/** Neon Postgres over HTTP (Vercel: Storage → Create Database → Neon sets DATABASE_URL). */
export function neonDb(url: string): Db {
  // Loaded lazily so tests and local dev never need the driver's network setup.
  const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
  const sql = neon(url);
  return withSchema((text, params = []) => sql.query(text, params) as Promise<any[]>);
}

/** Embedded Postgres (WASM): in-memory for tests, on disk for local dev without DATABASE_URL. */
export function pgliteDb(dataDir?: string): Db {
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  // PGlite does not create parent folders itself.
  if (dataDir && !dataDir.includes('://')) fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = new PGlite(dataDir);
  return withSchema(
    async (text, params = []) => (await pg.query(text, params)).rows as any[],
    () => pg.close()
  );
}

let defaultDb: Db | undefined;

/** The app database: Neon when DATABASE_URL is set, otherwise an embedded PGlite. */
export function getDb(): Db {
  if (defaultDb) return defaultDb;
  if (process.env.DATABASE_URL) {
    defaultDb = neonDb(process.env.DATABASE_URL);
  } else if (process.env.VERCEL) {
    // Function disks are read-only and short-lived: a real database is required.
    const missing = async (): Promise<never> => {
      throw new Error('DATABASE_URL não definida. Na Vercel, crie o banco em Storage → Create Database → Neon.');
    };
    defaultDb = { query: missing };
  } else {
    // The local dev server (index.ts) sets PGLITE_DIR; otherwise the data lives in memory.
    defaultDb = pgliteDb(process.env.PGLITE_DIR || 'memory://');
  }
  return defaultDb;
}
