import { Cue, timestampToMs } from '../srt/SrtParser';
import { CueWarning, PreparedCue, computeWarnings, prepareCue, tmKey } from '../srt/CueText';
import { MemoryEntry, MemoryRepository } from '../db/memory';
import { TranslationProvider, mapWithConcurrency } from './TranslationProvider';

/** Where a cue's translation came from. */
export type TranslationSource = 'user' | 'memory' | 'provider' | 'fallback' | 'none';

export interface TranslatedCue extends Cue {
  translation: string;
  source: TranslationSource;
  warnings: CueWarning[];
}

export interface PipelineOptions {
  from: string;
  to: string;
  /** Called after each group of cues is finished, with [position in input, result] pairs. */
  onProgress?: (completed: Array<[number, TranslatedCue]>) => void;
  /** Characters per provider request group (also the unit of progress). */
  groupChars?: number;
  concurrency?: number;
}

export class TranslationPipeline {
  constructor(
    private memory: MemoryRepository,
    private primary: TranslationProvider,
    private fallback?: TranslationProvider
  ) {}

  static memoryKey(text: string, to: string): string {
    return `${to.toLowerCase()}|${tmKey(text)}`;
  }

  async translate(cues: Cue[], opts: PipelineOptions): Promise<TranslatedCue[]> {
    const { from, to, onProgress, groupChars = 4500, concurrency = 3 } = opts;
    const results = new Array<TranslatedCue>(cues.length);

    // 1. Translation memory (user corrections first, then cached machine translations).
    const keys = cues.map(c => TranslationPipeline.memoryKey(c.text, to));
    let memory = new Map<string, MemoryEntry>();
    try {
      memory = await this.memory.lookupMany(keys);
    } catch (e) {
      // The memory is an optimization; translation must still work without it.
      console.warn('Memória de tradução indisponível, seguindo sem ela:', e);
    }
    const pending: number[] = [];
    const fromMemory: Array<[number, TranslatedCue]> = [];
    cues.forEach((cue, i) => {
      const hit = memory.get(keys[i]);
      if (hit) {
        results[i] = this.finish(cue, hit.tgt, hit.origin === 'user' ? 'user' : 'memory');
        fromMemory.push([i, results[i]]);
      } else {
        pending.push(i);
      }
    });
    if (fromMemory.length) onProgress?.(fromMemory);

    // 2. Prepare the rest and group consecutive cues into provider-sized requests.
    const prepared = new Map<number, PreparedCue>();
    for (const i of pending) prepared.set(i, prepareCue(cues[i].text));

    const groups: number[][] = [];
    let cur: number[] = [];
    let size = 0;
    for (const i of pending) {
      const len = prepared.get(i)!.segments.reduce((n, s) => n + s.length + 1, 0);
      if (cur.length && size + len > groupChars) {
        groups.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(i);
      size += len;
    }
    if (cur.length) groups.push(cur);

    // 3. Translate groups (in parallel, bounded), falling back per segment.
    const toSave: MemoryEntry[] = [];
    await mapWithConcurrency(groups, concurrency, async group => {
      const refs: Array<{ cue: number; seg: number }> = [];
      const texts: string[] = [];
      for (const i of group) {
        prepared.get(i)!.segments.forEach((s, k) => {
          refs.push({ cue: i, seg: k });
          texts.push(s);
        });
      }

      let out: Array<string | null> = texts.length ? await this.primary.translateBatch(texts, from, to) : [];
      const usedFallback = new Set<number>();
      const missing = out.map((t, k) => (t == null ? k : -1)).filter(k => k >= 0);
      if (missing.length && this.fallback) {
        const fb = await this.fallback.translateBatch(missing.map(k => texts[k]), from === 'auto' ? 'en' : from, to);
        out = [...out];
        missing.forEach((k, j) => {
          if (fb[j] != null) {
            out[k] = fb[j];
            usedFallback.add(refs[k].cue);
          }
        });
      }

      const perCue = new Map<number, string[]>();
      refs.forEach((r, k) => {
        if (!perCue.has(r.cue)) perCue.set(r.cue, []);
        perCue.get(r.cue)![r.seg] = out[k] ?? texts[k];
      });

      const completed: Array<[number, TranslatedCue]> = [];
      for (const i of group) {
        const p = prepared.get(i)!;
        const translation = p.rebuild(perCue.get(i) ?? []);
        const source: TranslationSource =
          p.segments.length === 0 ? 'none' : usedFallback.has(i) ? 'fallback' : 'provider';
        const done = this.finish(cues[i], translation, source);
        if (usedFallback.has(i)) done.warnings.push('fallback_provider');
        results[i] = done;
        completed.push([i, done]);
        if (p.segments.length && !done.warnings.includes('untranslated')) {
          toSave.push({ srcNorm: keys[i], src: cues[i].text, tgt: translation, origin: 'mt' });
        }
      }
      onProgress?.(completed);
    });

    // 4. Cache machine translations for next time.
    if (toSave.length) {
      try {
        await this.memory.upsertMany(toSave);
      } catch (e) {
        console.warn('Não foi possível salvar na memória de tradução:', e);
      }
    }
    return results;
  }

  private finish(cue: Cue, translation: string, source: TranslationSource): TranslatedCue {
    const duration = timestampToMs(cue.end) - timestampToMs(cue.start);
    let warnings = source === 'none' ? [] : computeWarnings(cue.text, translation, duration);
    // A user who kept the original text did so on purpose.
    if (source === 'user') warnings = warnings.filter(w => w !== 'untranslated');
    return { ...cue, translation, source, warnings };
  }

  /** Builds the cue state for a translation typed by the user in the editor. */
  userEdit(cue: Cue, translation: string): TranslatedCue {
    return this.finish(cue, translation, 'user');
  }
}
