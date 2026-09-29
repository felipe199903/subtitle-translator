export const MAX_LINE_LENGTH = 42;
export const MAX_CHARS_PER_SECOND = 21;

export type CueWarning = 'untranslated' | 'long_line' | 'fast_reading' | 'fallback_provider';

/**
 * A unit of text sent to the translator (one sentence group or one dialogue turn),
 * plus what is needed to put the formatting back afterwards.
 */
interface Part {
  source: string;
  /** Text around the translatable body that must survive untouched ("- ", "♪ ", …). */
  prefix: string;
  suffix: string;
  italic: boolean;
  /** Parts made only of punctuation/symbols are not translated. */
  translatable: boolean;
}

export interface PreparedCue {
  /** Texts to send to the translator, in order. */
  segments: string[];
  /** Rebuilds the final cue text from the translations of `segments` (same order). */
  rebuild(translations: string[]): string;
}

const ASS_TAG_RE = /\{\\[^}]*\}/g;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const MUSIC_RE = /^([♪♫#]+\s*)?(.*?)(\s*[♪♫#]+)?$/s;

function stripTags(s: string): string {
  return s.replace(HTML_TAG_RE, '');
}

function isItalicWrapped(s: string): boolean {
  const t = s.trim();
  return /^<i>/i.test(t) && /<\/i>$/i.test(t) && !/<i>/i.test(t.slice(3, -4));
}

function hasLetters(s: string): boolean {
  return /\p{L}/u.test(s);
}

function makePart(raw: string, italic: boolean, dash: string): Part {
  const text = stripTags(raw).trim();
  const m = MUSIC_RE.exec(text)!;
  const lead = m[1] ?? '';
  const body = (m[2] ?? '').trim();
  const trail = m[3] ?? '';
  return {
    source: body,
    prefix: dash + lead,
    suffix: trail,
    italic,
    translatable: hasLetters(body),
  };
}

/**
 * Splits a cue into translatable parts:
 * - dialogue cues ("- Hi.\n- Hello.") become one part per speaker turn;
 * - otherwise lines are joined so the translator sees whole sentences,
 *   keeping italic runs separate (e.g. an italic narrator line + a normal line).
 */
export function prepareCue(rawText: string): PreparedCue {
  const assTags = (rawText.match(ASS_TAG_RE) || []).join('');
  const text = rawText.replace(ASS_TAG_RE, '');
  const wholeItalic = isItalicWrapped(text.replace(/\n/g, ' ')) && !/<\/i>\s*\n/i.test(text);
  const lines = (wholeItalic ? text.trim().slice(3, -4) : text).split('\n').map(l => l.trim()).filter(Boolean);

  const isDialogueLine = (l: string) => /^(<[^>]+>)*\s*[-–—]\s*/.test(l);
  const isDialogue = lines.length > 1 && lines.filter(isDialogueLine).length >= 2;

  const parts: Part[] = [];
  if (isDialogue) {
    // Each dash line starts a new turn; lines without a dash continue the previous turn.
    let current: { lines: string[]; italic: boolean } | null = null;
    for (const line of lines) {
      const italic = wholeItalic || isItalicWrapped(line);
      if (isDialogueLine(line) || !current) {
        if (current) parts.push(makePart(current.lines.join(' '), current.italic, '- '));
        current = { lines: [stripTags(line).replace(/^\s*[-–—]\s*/, '')], italic };
      } else {
        current.lines.push(line);
      }
    }
    if (current) parts.push(makePart(current.lines.join(' '), current.italic, '- '));
  } else {
    // Group consecutive lines that share the same italic state.
    let group: string[] = [];
    let groupItalic = false;
    for (const line of lines) {
      const italic = wholeItalic || isItalicWrapped(line);
      if (group.length && italic !== groupItalic) {
        parts.push(makePart(group.join(' '), groupItalic, ''));
        group = [];
      }
      group.push(line);
      groupItalic = italic;
    }
    if (group.length) parts.push(makePart(group.join(' '), groupItalic, ''));
  }

  const segments = parts.filter(p => p.translatable).map(p => p.source);

  return {
    segments,
    rebuild(translations: string[]): string {
      let t = 0;
      const rendered = parts.map(p => {
        const body = p.translatable ? (translations[t++] ?? p.source).trim() : p.source;
        return { ...p, body };
      });

      let outLines: Array<{ text: string; italic: boolean }>;
      if (isDialogue) {
        outLines = rendered.map(p => ({ text: `${p.prefix}${p.body}${p.suffix}`, italic: p.italic }));
      } else if (rendered.length === 1) {
        const p = rendered[0];
        outLines = wrapText(`${p.prefix}${p.body}${p.suffix}`).map(text => ({ text, italic: p.italic }));
      } else {
        outLines = rendered.flatMap(p =>
          wrapText(`${p.prefix}${p.body}${p.suffix}`).map(text => ({ text, italic: p.italic }))
        );
      }

      const allItalic = outLines.length > 0 && outLines.every(l => l.italic);
      const body = allItalic
        ? `<i>${outLines.map(l => l.text).join('\n')}</i>`
        : outLines.map(l => (l.italic ? `<i>${l.text}</i>` : l.text)).join('\n');
      return assTags + body;
    },
  };
}

/**
 * Wraps text into lines of at most MAX_LINE_LENGTH, preferring two balanced lines
 * (the subtitle convention). Longer texts get as many lines as needed.
 */
export function wrapText(text: string, max = MAX_LINE_LENGTH): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return [clean];

  const words = clean.split(' ');
  // Two lines is the subtitle convention: first try within the limit, then allow
  // slightly longer lines (flagged later as long_line) rather than a third line.
  for (const limit of [max, Math.round(max * 1.15)]) {
    const two = bestTwoLineSplit(words, limit);
    if (two) return two;
  }

  // Greedy fallback for text that doesn't fit in two lines.
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Picks the break that fits both lines and minimizes the length difference, preferring punctuation. */
function bestTwoLineSplit(words: string[], limit: number): [string, string] | null {
  let best: { i: number; cost: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > limit || b.length > limit) continue;
    let cost = Math.abs(a.length - b.length);
    if (/[,.;:!?]$/.test(a)) cost -= 8;
    if (!best || cost < best.cost) best = { i, cost };
  }
  return best ? [words.slice(0, best.i).join(' '), words.slice(best.i).join(' ')] : null;
}

export function computeWarnings(
  source: string,
  translated: string,
  durationMs: number
): CueWarning[] {
  const warnings: CueWarning[] = [];
  const plainSrc = stripTags(source.replace(ASS_TAG_RE, '')).trim();
  const plainOut = stripTags(translated.replace(ASS_TAG_RE, '')).trim();

  // Names ("Sherlock. Sherlock!", "- Nanette!\n- Benny!") and single words ("OK") legitimately
  // stay the same, so only flag text with ordinary lowercase words (or 2+ words in all-caps text).
  const words = plainSrc.split(/[\s\-–—]+/).filter(hasLetters);
  const allCaps = plainSrc === plainSrc.toUpperCase();
  const ordinary = allCaps
    ? words.length >= 2 ? words.length : 0
    : words.filter(w => /^[^\p{L}]*\p{Ll}/u.test(w)).length;
  if (ordinary >= 1 && normalizeForCompare(plainSrc) === normalizeForCompare(plainOut)) {
    warnings.push('untranslated');
  }
  if (plainOut.split('\n').some(l => l.length > MAX_LINE_LENGTH)) {
    warnings.push('long_line');
  }
  // Only flag reading speed when the translation made it worse than the original
  // (English subtitles are often already above the limit).
  const cps = (s: string) => s.replace(/\n/g, '').length / (durationMs / 1000);
  if (durationMs > 0 && cps(plainOut) > MAX_CHARS_PER_SECOND && cps(plainOut) > cps(plainSrc) * 1.1) {
    warnings.push('fast_reading');
  }
  return warnings;
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalized key used by the translation memory: whole cue, tags stripped, punctuation kept. */
export function tmKey(text: string): string {
  return stripTags(text.replace(ASS_TAG_RE, '')).toLowerCase().replace(/\s+/g, ' ').trim();
}
