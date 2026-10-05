import { JobRepository } from './jobs';
import { signIn, useTestDb } from '../__tests__/fixtures';
import { Cue } from '../srt/SrtParser';
import { TranslatedCue } from '../translation/TranslationPipeline';

const t = useTestDb();
let jobs: JobRepository;
let userId: string;
beforeEach(async () => {
  jobs = new JobRepository(t.db);
  userId = (await signIn(t.db)).user.id;
});

const cues: Cue[] = [
  { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'One.' },
  { index: 2, start: '00:00:03,000', end: '00:00:04,000', positionTag: 'X1:10 X2:20', text: 'Two\nlines.' },
  { index: 5, start: '00:00:05,000', end: '00:00:06,000', text: 'Three.' },
];
const newJob = () =>
  jobs.create({ userId, fileName: 'a.srt', from: 'en', to: 'pt-BR', detectedLanguage: 'en', encoding: 'utf-8', parseWarnings: ['aviso'], cues });
const result = (translation: string, patch: Partial<TranslatedCue> = {}): TranslatedCue =>
  ({ ...cues[0], translation, source: 'provider', warnings: [], ...patch }) as TranslatedCue;

describe('JobRepository', () => {
  it('stores a job with its cues in order', async () => {
    const id = await newJob();
    expect(await jobs.getMeta(id)).toMatchObject({
      fileName: 'a.srt', from: 'en', to: 'pt-BR', status: 'translating', parseWarnings: ['aviso'], error: null, userId,
    });
    const stored = await jobs.cues(id);
    expect(stored.map(c => [c.position, c.index, c.text, c.translation])).toEqual([
      [0, 1, 'One.', null],
      [1, 2, 'Two\nlines.', null],
      [2, 5, 'Three.', null],
    ]);
    expect(stored[1].positionTag).toBe('X1:10 X2:20');
    expect(await jobs.progress(id)).toEqual({ done: 0, total: 3 });
  });

  it('returns null for unknown or malformed ids', async () => {
    expect(await jobs.getMeta('nope')).toBeNull();
    expect(await jobs.getMeta('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('hands out pending cues within the character budget, always at least one', async () => {
    const id = await newJob();
    expect((await jobs.pendingCues(id, 1)).map(c => c.position)).toEqual([0]);
    expect((await jobs.pendingCues(id, 15)).map(c => c.position)).toEqual([0, 1]);
    await jobs.saveResults(id, [[0, result('Um.')]]);
    expect((await jobs.pendingCues(id, 1000)).map(c => c.position)).toEqual([1, 2]);
    expect(await jobs.progress(id)).toEqual({ done: 1, total: 3 });
  });

  it('never lets a machine result overwrite a user edit', async () => {
    const id = await newJob();
    await jobs.saveCue(id, 0, { translation: 'Editado', source: 'user', warnings: [] });
    await jobs.saveResults(id, [[0, result('Máquina')], [1, result('Duas linhas.')]]);
    const [first, second] = await jobs.cues(id);
    expect(first).toMatchObject({ translation: 'Editado', source: 'user' });
    expect(second).toMatchObject({ translation: 'Duas linhas.', source: 'provider' });
  });

  it('applies user corrections that come from memory', async () => {
    const id = await newJob();
    await jobs.saveResults(id, [[2, result('Três (memória)', { source: 'user' })]]);
    expect((await jobs.cues(id, [2]))[0]).toMatchObject({ translation: 'Três (memória)', source: 'user' });
  });

  it('resets only machine cues flagged as untranslated', async () => {
    const id = await newJob();
    await jobs.saveResults(id, [
      [0, result('One.', { warnings: ['untranslated'] })],
      [1, result('Duas.', { warnings: ['long_line'] })],
    ]);
    await jobs.saveCue(id, 2, { translation: 'Three.', source: 'user', warnings: [] });
    expect(await jobs.resetUntranslated(id)).toBe(1);
    const stored = await jobs.cues(id);
    expect(stored.map(c => c.translation)).toEqual([null, 'Duas.', 'Three.']);
    expect(stored[0].warnings).toEqual([]);
  });

  it('updates status and deletes jobs idle for too long (with their cues)', async () => {
    const id = await newJob();
    await jobs.setStatus(id, 'error', 'falhou');
    expect(await jobs.getMeta(id)).toMatchObject({ status: 'error', error: 'falhou' });

    expect(await jobs.deleteOlderThan(7)).toBe(0);
    await t.db.query(`UPDATE jobs SET updated_at = now() - interval '8 days' WHERE id = $1`, [id]);
    expect(await jobs.deleteOlderThan(7)).toBe(1);
    expect(await jobs.getMeta(id)).toBeNull();
    expect(await t.db.query('SELECT * FROM cues')).toEqual([]);
  });

  it('keeps a job alive while it is being read', async () => {
    const id = await newJob();
    await t.db.query(`UPDATE jobs SET updated_at = now() - interval '8 days' WHERE id = $1`, [id]);
    await jobs.getMeta(id);
    expect(await jobs.deleteOlderThan(7)).toBe(0);
  });
});
