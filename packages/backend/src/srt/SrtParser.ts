export interface Cue {
  index: number;
  start: string;
  end: string;
  /** Anything after the end timestamp on the timing line (e.g. "X1:100 X2:200"). */
  positionTag?: string;
  text: string;
}

export interface ParseResult {
  cues: Cue[];
  warnings: string[];
  encoding: 'utf-8' | 'windows-1252';
}

export interface SerializeOptions {
  eol?: '\r\n' | '\n';
  bom?: boolean;
}

const TIMING_RE =
  /^\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*(.*)$/;

/**
 * Decodes an uploaded subtitle buffer. Tries strict UTF-8 first and falls back to
 * Windows-1252, which is what most legacy .srt files with accents are saved in.
 */
export function decodeBuffer(buffer: Buffer): { content: string; encoding: ParseResult['encoding'] } {
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { content: stripBom(content), encoding: 'utf-8' };
  } catch {
    const content = new TextDecoder('windows-1252').decode(buffer);
    return { content: stripBom(content), encoding: 'windows-1252' };
  }
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Normalizes "1:02:03.5" to "01:02:03,500". */
export function normalizeTimestamp(ts: string): string {
  const [hms, ms] = ts.replace('.', ',').split(',');
  const [h, m, s] = hms.split(':');
  return `${h.padStart(2, '0')}:${m}:${s},${ms.padEnd(3, '0')}`;
}

export function timestampToMs(ts: string): number {
  const [hms, ms] = normalizeTimestamp(ts).split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return ((h * 60 + m) * 60 + s) * 1000 + Number(ms);
}

export function parseSrt(input: string | Buffer): ParseResult {
  let content: string;
  let encoding: ParseResult['encoding'] = 'utf-8';
  if (typeof input === 'string') {
    content = stripBom(input);
  } else {
    ({ content, encoding } = decodeBuffer(input));
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  const warnings: string[] = [];

  // Walk line by line, anchoring on timing lines. This tolerates missing indices,
  // extra blank lines and blank lines inside a cue's text.
  let i = 0;
  while (i < lines.length) {
    const m = TIMING_RE.exec(lines[i]);
    if (!m) {
      const line = lines[i].trim();
      // An index line directly followed by a timing line is expected; anything else is stray.
      const isIndex = /^\d+$/.test(line) && i + 1 < lines.length && TIMING_RE.test(lines[i + 1]);
      if (line && !isIndex) {
        warnings.push(`Linha ${i + 1} ignorada (fora de um bloco de legenda): "${line.slice(0, 60)}"`);
      }
      i++;
      continue;
    }

    const prev = i > 0 ? lines[i - 1].trim() : '';
    const parsedIndex = /^\d+$/.test(prev) ? parseInt(prev, 10) : cues.length + 1;
    i++;

    const textLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        // Blank line ends the cue unless the next non-blank content is not a new cue
        // (some files have blank lines inside text). Peek ahead.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j >= lines.length) break;
        const startsNewCue =
          TIMING_RE.test(lines[j]) || (/^\d+$/.test(lines[j].trim()) && j + 1 < lines.length && TIMING_RE.test(lines[j + 1]));
        if (startsNewCue) break;
        i = j;
        continue;
      }
      if (/^\d+$/.test(line.trim()) && i + 1 < lines.length && TIMING_RE.test(lines[i + 1])) break;
      textLines.push(line.trimEnd());
      i++;
    }

    const text = textLines.join('\n').trim();
    if (!text) {
      warnings.push(`Legenda ${parsedIndex} (${m[1]}) está vazia e foi ignorada`);
      continue;
    }

    cues.push({
      index: parsedIndex,
      start: normalizeTimestamp(m[1]),
      end: normalizeTimestamp(m[2]),
      positionTag: m[3].trim() || undefined,
      text,
    });
  }

  return { cues, warnings, encoding };
}

export function serializeSrt(
  cues: Array<Pick<Cue, 'start' | 'end' | 'positionTag' | 'text'>>,
  { eol = '\r\n', bom = true }: SerializeOptions = {}
): string {
  const body = cues
    .map((c, i) => {
      const timing = `${c.start} --> ${c.end}${c.positionTag ? ' ' + c.positionTag : ''}`;
      return [String(i + 1), timing, ...c.text.split('\n')].join(eol);
    })
    .join(eol + eol);
  return (bom ? '﻿' : '') + body + eol;
}
