import { TranslationPipeline, TranslatedCue } from './TranslationPipeline';
import { parseSrt, Cue } from '../srt/SrtParser';
import { MAX_LINE_LENGTH } from '../srt/CueText';
import { MemoryRepository } from '../db/memory';
import { TranslationProvider } from './TranslationProvider';
import { FAST, SHERLOCK, FakeProvider, readFixture, useTestDb } from '../__tests__/fixtures';

const opts = { from: 'en', to: 'pt-BR' };
const cue = (text: string, i = 1): Cue => ({ index: i, start: '00:00:01,000', end: '00:00:04,000', text });

const t = useTestDb();
let memory: MemoryRepository;
beforeEach(() => {
  memory = new MemoryRepository(t.db);
});
const pipe = (primary: TranslationProvider, fallback?: TranslationProvider) => new TranslationPipeline(memory, primary, fallback);
const remember = (text: string, to: string, tgt: string) =>
  memory.upsertMany([{ srcNorm: TranslationPipeline.memoryKey(text, to), src: text, tgt, origin: 'user' }]);

describe('TranslationPipeline on real files', () => {
  it.each([
    ['Sherlock Gnomes', SHERLOCK],
    ['2 Fast 2 Furious', FAST],
  ])('%s: every cue is translated with timing, order and formatting intact', async (_n, file) => {
    const { cues } = parseSrt(readFixture(file));
    const provider = new FakeProvider();
    const progress: number[] = [];
    const out = await pipe(provider).translate(cues, {
      ...opts,
      onProgress: done => progress.push(done.length),
    });

    expect(out).toHaveLength(cues.length);
    expect(progress.reduce((a, b) => a + b, 0)).toBe(cues.length);
    // Requests are batched, not one per cue.
    expect(provider.calls.length).toBeLessThan(cues.length / 10);

    out.forEach((t, i) => {
      const src = cues[i];
      expect([t.index, t.start, t.end]).toEqual([src.index, src.start, src.end]);
      if (/\p{L}/u.test(src.text)) expect(t.translation).toContain('PT:');
      expect(t.warnings).not.toContain('untranslated');

      // Line-level italics are kept (inline partial italics are dropped by design), and tags stay balanced.
      if (/^<i>[^<]*<\/i>$/.test(src.text.split('\n')[0])) expect(t.translation.startsWith('<i>')).toBe(true);
      expect((t.translation.match(/<i>/g) || []).length).toBe((t.translation.match(/<\/i>/g) || []).length);

      // Dialogue keeps one dashed line per speaker.
      const srcDashes = src.text.split('\n').filter(l => /^(<i>)?-/.test(l)).length;
      if (srcDashes >= 2) {
        expect(t.translation.split('\n').filter(l => /^(<i>)?- /.test(l))).toHaveLength(srcDashes);
      } else {
        // Non-dialogue text is rewrapped: lines within the limit, or two slightly long lines (flagged).
        const lines = t.translation.split('\n').map(l => l.replace(/<\/?i>/g, ''));
        const overLimit = lines.some(l => l.length > MAX_LINE_LENGTH);
        if (overLimit) {
          expect(t.warnings).toContain('long_line');
          if (lines.length === 2) lines.forEach(l => expect(l.length).toBeLessThanOrEqual(Math.round(MAX_LINE_LENGTH * 1.15)));
        }
      }
    });
  });

  it('caches machine translations so a second run needs no provider calls', async () => {
    const { cues } = parseSrt(readFixture(SHERLOCK));
    await pipe(new FakeProvider()).translate(cues, opts);

    const second = new FakeProvider();
    const out = await pipe(second).translate(cues, opts);
    expect(second.calls).toHaveLength(0);
    expect(out.filter(c => /\p{L}/u.test(c.text)).every(c => c.source === 'memory')).toBe(true);
  });
});

describe('TranslationPipeline sources and fallbacks', () => {
  it('prefers a user correction over the cache and the provider', async () => {
    await remember('Hello there.', 'pt-BR', 'Olá, você aí.');
    const provider = new FakeProvider();
    const [out] = await pipe(provider).translate([cue('Hello there.')], opts);
    expect(out).toMatchObject({ translation: 'Olá, você aí.', source: 'user' });
    expect(provider.calls).toHaveLength(0);
  });

  it('matches memory regardless of case, spacing and italics', async () => {
    await remember('Hello there.', 'pt-BR', 'Olá.');
    const [out] = await pipe(new FakeProvider()).translate([cue('<i>hello\nTHERE.</i>')], opts);
    expect(out.translation).toBe('Olá.');
  });

  it('keeps memory separate per target language', async () => {
    await remember('Hello there.', 'es', 'Hola.');
    const [out] = await pipe(new FakeProvider()).translate([cue('Hello there.')], opts);
    expect(out.translation).toBe('PT:Hello there.');
  });

  it('uses the fallback provider only for texts the primary missed', async () => {
    const primary = new FakeProvider(t => (t.startsWith('B') ? null : `PT:${t}`));
    const fallback = new FakeProvider(t => `FB:${t}`);
    const out = await pipe(primary, fallback).translate([cue('A one.', 1), cue('B two.', 2)], opts);
    expect(out.map(o => o.translation)).toEqual(['PT:A one.', 'FB:B two.']);
    expect(out[1]).toMatchObject({ source: 'fallback' });
    expect(out[1].warnings).toContain('fallback_provider');
    expect(fallback.calls).toEqual([['B two.']]);
  });

  it('keeps the original and flags it when every provider fails, without aborting', async () => {
    const dead = new FakeProvider(() => null);
    const out = await pipe(dead, dead).translate([cue('Nothing works here.'), cue('...', 2)], opts);
    expect(out[0]).toMatchObject({ translation: 'Nothing works here.' });
    expect(out[0].warnings).toContain('untranslated');
    expect(out[1]).toMatchObject({ translation: '...', source: 'none', warnings: [] });
    // Failures are not cached.
    expect((await memory.stats()).mt).toBe(0);
  });

  it('userEdit does not flag intentionally kept text as untranslated', () => {
    const edited: TranslatedCue = pipe(new FakeProvider()).userEdit(cue('Sherlock Gnomes rules'), 'Sherlock Gnomes rules');
    expect(edited.warnings).not.toContain('untranslated');
    expect(edited.source).toBe('user');
  });
});

describe('TranslationPipeline without a database', () => {
  it('still translates when the memory is unavailable', async () => {
    jest.spyOn(memory, 'lookupMany').mockRejectedValue(new Error('db down'));
    jest.spyOn(memory, 'upsertMany').mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const [out] = await pipe(new FakeProvider()).translate([cue('Hello there.')], opts);
    expect(out.translation).toBe('PT:Hello there.');
    warn.mockRestore();
  });
});
