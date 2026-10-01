import { MemoryRepository } from './memory';
import { useTestDb } from '../__tests__/fixtures';

const t = useTestDb();
let memory: MemoryRepository;
beforeEach(() => {
  memory = new MemoryRepository(t.db);
});

const entry = (srcNorm: string, tgt: string, origin: 'user' | 'mt') => ({ srcNorm, src: 'src', tgt, origin });

describe('MemoryRepository', () => {
  it('never lets a machine translation overwrite a user correction', async () => {
    await memory.upsertMany([entry('k', 'correção', 'user')]);
    await memory.upsertMany([entry('k', 'máquina', 'mt')]);
    expect((await memory.lookupMany(['k'])).get('k')).toMatchObject({ tgt: 'correção', origin: 'user' });
  });

  it('lets a user correction replace a machine translation, and a newer correction replace an older one', async () => {
    await memory.upsertMany([entry('k', 'máquina', 'mt')]);
    await memory.upsertMany([entry('k', 'correção', 'user')]);
    await memory.upsertMany([entry('k', 'correção 2', 'user')]);
    expect((await memory.lookupMany(['k'])).get('k')!.tgt).toBe('correção 2');
  });

  it('accepts duplicate keys in one batch (last one wins)', async () => {
    await memory.upsertMany([entry('k', 'a', 'mt'), entry('k', 'b', 'mt')]);
    expect((await memory.lookupMany(['k'])).get('k')!.tgt).toBe('b');
  });

  it('handles concurrent bulk writes and lookups larger than one query page', async () => {
    const batch = (p: string) => Array.from({ length: 1500 }, (_, i) => entry(`${p}${i}`, 't', 'mt'));
    await Promise.all([memory.upsertMany(batch('a')), memory.upsertMany(batch('b'))]);
    const found = await memory.lookupMany([...batch('a'), ...batch('b')].map(e => e.srcNorm));
    expect(found.size).toBe(3000);
    expect(await memory.stats()).toEqual({ user: 0, mt: 3000 });
  });

  it('skips keys too long for the index instead of failing the whole batch', async () => {
    const huge = 'm 0 0 l '.repeat(1200); // ~9.6 KB, like an ASS vector drawing
    await memory.upsertMany([entry(huge, 'x', 'mt'), entry('ok', 'saved', 'mt')]);
    expect((await memory.lookupMany(['ok'])).get('ok')!.tgt).toBe('saved');
    expect((await memory.lookupMany([huge])).size).toBe(0);
  });

  it('ignores empty input', async () => {
    await memory.upsertMany([]);
    expect((await memory.lookupMany([])).size).toBe(0);
  });
});

describe('pgliteDb on disk', () => {
  it('creates missing parent folders for the data directory', async () => {
    const os = await import('os');
    const fs = await import('fs');
    const path = await import('path');
    const { pgliteDb } = await import('./client');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-'));
    const db = pgliteDb(path.join(root, 'nested', 'pglite'));
    try {
      await new MemoryRepository(db).upsertMany([entry('k', 'v', 'mt')]);
      expect(fs.existsSync(path.join(root, 'nested', 'pglite'))).toBe(true);
    } finally {
      await db.close?.();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
