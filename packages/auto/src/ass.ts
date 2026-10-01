import { Cue } from '../../backend/src/srt/SrtParser';

/**
 * Reads an ASS/SSA subtitle keeping only dialogue. Anime releases put signs, karaoke
 * (one event per syllable) and vector drawings in the same file; converted to SRT they
 * become tens of thousands of "cues" that are not speech.
 */

/** Styles that hold signs, songs and notes rather than dialogue. */
// "OP"/"ED"/"TL"/"TS" as a separate token (OP_EN, OP1-Light, ED-Romaji), not inside words ("Speed").
const NON_DIALOGUE_STYLE =
  /sign|song|kara|lyric|romaji|kanji|(^|[^a-z])(op|ed|tl|ts)(\d|[^a-z]|$)|opening|ending|insert|title|eyecatch|preview|note|typeset|screen|credit|logo/i;

/** Same line repeated with (almost) touching times = one animated line, frame by frame. */
const MERGE_GAP_MS = 250;

const toMs = (ts: string) => {
  const [h, m, rest] = ts.split(':');
  const [s, ms] = rest.split(',');
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
};

/** Karaoke timing tags or a vector drawing mode. */
const KARAOKE_OR_DRAWING = /\\(k|kf|ko|K)\d|\\p[1-9]/;

function assTime(t: string): string {
  // H:MM:SS.cc → HH:MM:SS,mmm
  const m = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return '00:00:00,000';
  const ms = m[4].padEnd(3, '0').slice(0, 3);
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]},${ms}`;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\{[^}]*\}/g, '') // override tags {\i1}, {\pos(…)}…
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function assToCues(content: string): Cue[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let inEvents = false;
  let fields: string[] = [];
  const events: Array<{ start: string; end: string; text: string }> = [];

  for (const line of lines) {
    const t = line.trim();
    if (/^\[.*\]$/.test(t)) {
      inEvents = t.toLowerCase() === '[events]';
      continue;
    }
    if (!inEvents) continue;
    if (/^format:/i.test(t)) {
      fields = t.slice(t.indexOf(':') + 1).split(',').map(f => f.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue:/i.test(t) || !fields.length) continue;

    // The last field (Text) may contain commas.
    const parts = t.slice(t.indexOf(':') + 1).split(',');
    const head = parts.slice(0, fields.length - 1).map(p => p.trim());
    const rawText = parts.slice(fields.length - 1).join(',');
    const get = (name: string) => head[fields.indexOf(name)] ?? '';

    if (NON_DIALOGUE_STYLE.test(get('style')) || NON_DIALOGUE_STYLE.test(get('name'))) continue;
    if (get('effect')) continue; // scroll/banner effects are signs
    if (KARAOKE_OR_DRAWING.test(rawText)) continue;
    const text = cleanText(rawText);
    if (!text) continue;
    events.push({ start: assTime(get('start')), end: assTime(get('end')), text });
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  const cues: Cue[] = [];
  for (const e of events) {
    // The same text again (another layer of the same line, or the next frame of an
    // animated one) extends the previous cue instead of creating a new one.
    const prev = [...cues].reverse().find(c => c.text === e.text && toMs(e.start) - toMs(c.end) <= MERGE_GAP_MS);
    if (prev) {
      if (toMs(e.end) > toMs(prev.end)) prev.end = e.end;
      continue;
    }
    cues.push({ index: cues.length + 1, start: e.start, end: e.end, text: e.text });
  }
  return cues;
}
