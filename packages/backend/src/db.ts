import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
  if (db) return db;
  // Allow overriding DB path in Docker via TM_DB_PATH env var. Fallback for local dev.
  const envPath = process.env.TM_DB_PATH || process.env.DB_PATH;
  const dbPath = envPath ? path.resolve(envPath) : path.resolve(process.cwd(), 'packages', 'backend', 'tm.db');
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS tm (
    src TEXT PRIMARY KEY,
    src_norm TEXT,
    tgt TEXT,
    count INT DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_tm_src ON tm(src);`);
  // Ensure backwards compatibility: add src_norm column if it doesn't exist
  try {
    const cols = await db.all("PRAGMA table_info('tm')");
    const hasSrcNorm = cols.some((c: any) => c.name === 'src_norm');
    if (!hasSrcNorm) {
      await db.exec(`ALTER TABLE tm ADD COLUMN src_norm TEXT;`);
    }
  } catch (e) {
    // ignore migration errors
  }
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_tm_src_norm ON tm(src_norm);`);
  return db;
}

export async function upsertTM(src: string, tgt: string) {
  const database = await getDb();
  // Normalize src for better matching (lowercase, collapse whitespace)
  const srcNorm = src.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
  // UPSERT: if exists, increment count and update tgt and src_norm
  await database.run(`INSERT INTO tm (src, src_norm, tgt, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(src) DO UPDATE SET tgt=excluded.tgt, src_norm=excluded.src_norm, count = tm.count + 1;`, [src, srcNorm, tgt]);
}

export async function queryTMExact(src: string) {
  const database = await getDb();
  const srcNorm = src.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
  const row = await database.get('SELECT src, src_norm, tgt, count FROM tm WHERE src = ? OR src_norm = ? LIMIT 1', [src, srcNorm]);
  return row;
}

export async function queryTMSimilar(src: string, limit = 5) {
  const database = await getDb();
  const rows = await database.all('SELECT src, src_norm, tgt, count FROM tm', []);
  return rows;
}

export async function getAllTM() {
  const database = await getDb();
  const rows = await database.all('SELECT src, src_norm, tgt, count FROM tm');
  return rows;
}
