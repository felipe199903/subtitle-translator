import { parseSrt, serializeSrt, normalizeTimestamp, timestampToMs } from './SrtParser';
import { FAST, SHERLOCK, readFixture } from '../__tests__/fixtures';

const SAMPLE = '1\n00:00:01,000 --> 00:00:02,500\nHello there.\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\nlines\n';

describe('parseSrt', () => {
  it('parses a simple LF file', () => {
    const { cues, warnings } = parseSrt(SAMPLE);
    expect(warnings).toEqual([]);
    expect(cues).toEqual([
      { index: 1, start: '00:00:01,000', end: '00:00:02,500', positionTag: undefined, text: 'Hello there.' },
      { index: 2, start: '00:00:03,000', end: '00:00:04,000', positionTag: undefined, text: 'Two\nlines' },
    ]);
  });

  it('handles CRLF and bare CR line endings', () => {
    expect(parseSrt(SAMPLE.replace(/\n/g, '\r\n')).cues).toHaveLength(2);
    expect(parseSrt(SAMPLE.replace(/\n/g, '\r')).cues).toHaveLength(2);
    expect(parseSrt(SAMPLE.replace(/\n/g, '\r\n')).cues[1].text).toBe('Two\nlines');
  });

  it('strips a UTF-8 BOM so the first cue is not lost', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SAMPLE)]);
    const { cues, encoding } = parseSrt(buf);
    expect(encoding).toBe('utf-8');
    expect(cues[0].index).toBe(1);
    expect(cues).toHaveLength(2);
  });

  it('falls back to Windows-1252 when the file is not valid UTF-8', () => {
    const latin1 = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nCaf\xe9 com a\xe7\xfacar\n', 'latin1');
    const { cues, encoding } = parseSrt(latin1);
    expect(encoding).toBe('windows-1252');
    expect(cues[0].text).toBe('Café com açúcar');
  });

  it('accepts dotted milliseconds, short hours and positions', () => {
    const { cues } = parseSrt('1\n0:00:01.5 --> 0:00:02.25 X1:10 X2:20\nHi\n');
    expect(cues[0].start).toBe('00:00:01,500');
    expect(cues[0].end).toBe('00:00:02,250');
    expect(cues[0].positionTag).toBe('X1:10 X2:20');
  });

  it('tolerates missing indices and extra blank lines', () => {
    const { cues } = parseSrt('\n\n00:00:01,000 --> 00:00:02,000\nA\n\n\n\n00:00:03,000 --> 00:00:04,000\nB\n\n\n');
    expect(cues.map(c => c.text)).toEqual(['A', 'B']);
    expect(cues.map(c => c.index)).toEqual([1, 2]);
  });

  it('keeps a blank line inside a cue text as part of the cue', () => {
    const { cues } = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nFirst\n\nSecond\n\n2\n00:00:03,000 --> 00:00:04,000\nNext\n');
    expect(cues.map(c => c.text)).toEqual(['First\nSecond', 'Next']);
  });

  it('reports stray lines and empty cues as warnings instead of failing', () => {
    const { cues, warnings } = parseSrt('garbage here\n\n1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nOk\n');
    expect(cues.map(c => c.text)).toEqual(['Ok']);
    expect(warnings).toHaveLength(2);
  });

  it('returns no cues for non-SRT content', () => {
    expect(parseSrt('just some text\nwithout timings').cues).toEqual([]);
  });
});

describe('serializeSrt', () => {
  it('renumbers cues and writes CRLF with a BOM by default', () => {
    const out = serializeSrt([
      { start: '00:00:01,000', end: '00:00:02,000', text: 'Olá' },
      { start: '00:00:03,000', end: '00:00:04,000', text: 'Duas\nlinhas' },
    ]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('1\r\n00:00:01,000 --> 00:00:02,000\r\nOlá\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nDuas\r\nlinhas\r\n');
  });

  it('can write plain LF without BOM', () => {
    const out = serializeSrt([{ start: '00:00:01,000', end: '00:00:02,000', text: 'x' }], { eol: '\n', bom: false });
    expect(out).toBe('1\n00:00:01,000 --> 00:00:02,000\nx\n');
  });
});

describe('timestamps', () => {
  it('normalizes and converts to milliseconds', () => {
    expect(normalizeTimestamp('1:02:03.4')).toBe('01:02:03,400');
    expect(timestampToMs('01:02:03,400')).toBe(3723400);
  });
});

describe('real subtitle files', () => {
  it.each([
    ['Sherlock Gnomes (LF)', SHERLOCK, 1128],
    ['2 Fast 2 Furious (CRLF)', FAST, 1073],
  ])('%s parses every cue and round-trips losslessly', (_name, file, expected) => {
    const first = parseSrt(readFixture(file));
    expect(first.warnings).toEqual([]);
    expect(first.cues).toHaveLength(expected);
    expect(first.cues[0].index).toBe(1);
    expect(first.cues.every(c => c.text.length > 0)).toBe(true);

    const again = parseSrt(Buffer.from(serializeSrt(first.cues), 'utf8'));
    expect(again.cues).toEqual(first.cues);
  });
});
