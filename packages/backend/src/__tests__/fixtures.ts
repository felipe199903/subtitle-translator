import fs from 'fs';
import path from 'path';
import { TranslationProvider } from '../translation/TranslationProvider';
import { Db, pgliteDb } from '../db/client';

export const TESTS_DIR = path.resolve(__dirname, '../../../../tests');
export const SHERLOCK = path.join(TESTS_DIR, 'Sherlock Gnomes (2018).en.srt');
export const FAST = path.join(TESTS_DIR, '2 Fast 2 Furious (2003).en.srt');

export const readFixture = (p: string) => fs.readFileSync(p);

/** Deterministic provider: prefixes "PT:" so translated text is recognisable. */
export class FakeProvider implements TranslationProvider {
  readonly name = 'fake';
  calls: string[][] = [];
  constructor(private fn: (t: string) => string | null = t => `PT:${t}`) {}
  async translateBatch(texts: string[]) {
    this.calls.push(texts);
    return texts.map(this.fn);
  }
}

/**
 * One in-memory Postgres (PGlite) per test file, emptied before each test.
 * Starting PGlite takes a moment, so it is not recreated for every test.
 */
export function useTestDb(): { readonly db: Db } {
  let db: Db;
  beforeAll(() => {
    db = pgliteDb();
  });
  beforeEach(async () => {
    await db.query('TRUNCATE memory, jobs CASCADE');
  });
  afterAll(async () => {
    await db.close?.();
  });
  return {
    get db() {
      return db;
    },
  };
}
