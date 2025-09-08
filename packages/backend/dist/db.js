"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTM = exports.queryTMSimilar = exports.queryTMExact = exports.upsertTM = exports.getDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
let db = null;
async function getDb() {
    if (db)
        return db;
    // Allow overriding DB path in Docker via TM_DB_PATH env var. Fallback for local dev.
    const envPath = process.env.TM_DB_PATH || process.env.DB_PATH;
    const dbPath = envPath ? path_1.default.resolve(envPath) : path_1.default.resolve(process.cwd(), 'packages', 'backend', 'tm.db');
    db = await (0, sqlite_1.open)({ filename: dbPath, driver: sqlite3_1.default.Database });
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
        const hasSrcNorm = cols.some((c) => c.name === 'src_norm');
        if (!hasSrcNorm) {
            await db.exec(`ALTER TABLE tm ADD COLUMN src_norm TEXT;`);
        }
    }
    catch (e) {
        // ignore migration errors
    }
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_tm_src_norm ON tm(src_norm);`);
    return db;
}
exports.getDb = getDb;
async function upsertTM(src, tgt) {
    const database = await getDb();
    // Normalize src for better matching (lowercase, collapse whitespace)
    const srcNorm = src.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
    // UPSERT: if exists, increment count and update tgt and src_norm
    await database.run(`INSERT INTO tm (src, src_norm, tgt, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(src) DO UPDATE SET tgt=excluded.tgt, src_norm=excluded.src_norm, count = tm.count + 1;`, [src, srcNorm, tgt]);
}
exports.upsertTM = upsertTM;
async function queryTMExact(src) {
    const database = await getDb();
    const srcNorm = src.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
    const row = await database.get('SELECT src, src_norm, tgt, count FROM tm WHERE src = ? OR src_norm = ? LIMIT 1', [src, srcNorm]);
    return row;
}
exports.queryTMExact = queryTMExact;
async function queryTMSimilar(src, limit = 5) {
    const database = await getDb();
    const rows = await database.all('SELECT src, src_norm, tgt, count FROM tm', []);
    return rows;
}
exports.queryTMSimilar = queryTMSimilar;
async function getAllTM() {
    const database = await getDb();
    const rows = await database.all('SELECT src, src_norm, tgt, count FROM tm');
    return rows;
}
exports.getAllTM = getAllTM;
//# sourceMappingURL=db.js.map