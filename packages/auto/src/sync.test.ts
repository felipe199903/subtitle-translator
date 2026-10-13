import { actionsOf, measure, parseCsv, summary } from './sync';
import { segmentsToCues, splitSegment } from './extract';

describe('parseCsv', () => {
  it('reads quoted fields with commas, quotes and CRLF', () => {
    const rows = parseCsv('﻿legenda,acao\r\n"/m/A, B (2001)/A.pt-BR.srt","x ""y"""\r\n/m/C.srt,apagada\n');
    expect(rows).toEqual([
      { legenda: '/m/A, B (2001)/A.pt-BR.srt', acao: 'x "y"' },
      { legenda: '/m/C.srt', acao: 'apagada' },
    ]);
  });
});

describe('sync summary', () => {
  const m = (legenda: string, atraso_s: string, ritmo = '1.0', confiavel = '1', erro = '') => ({ legenda, atraso_s, ritmo, confiavel, erro });

  it('uses the same thresholds as the server scripts', () => {
    expect(measure(m('a', '0.2'))).toBe('ok');
    expect(measure(m('a', '-0.8'))).toBe('leve');
    expect(measure(m('a', '12'))).toBe('atraso');
    expect(measure(m('a', '120'))).toBe('enorme');
    expect(measure(m('a', '0', '1.04271'))).toBe('ritmo');
    expect(measure(m('a', '0', '1', '0'))).toBe('nao_confiavel');
    expect(measure(m('a', '', '', '', 'boom'))).toBe('erro');
  });

  it('counts what is in sync now and what is still to fix', () => {
    const d = {
      measured: [m('ok', '0.1'), m('b', '5'), m('c', '200'), m('d', '0', '0.95904')],
      actions: [
        { legenda: 'b', acao: 'corrigida' },
        { legenda: 'c', acao: 'apagada' },
      ],
      updatedAt: {},
    };
    const s = summary(d);
    expect(s).toMatchObject({ total: 4, inSync: 2, toFix: 1, byAction: { corrigida: 1, apagada: 1 } });
    expect(actionsOf(d, null, 1)).toEqual([{ legenda: 'c', acao: 'apagada' }]);
    expect(actionsOf(d, 'corrigida', 10)).toHaveLength(1);
  });
});

describe('segmentsToCues', () => {
  it('turns Whisper segments into SRT cues and drops hallucinated repeats', () => {
    const cues = segmentsToCues([
      { start: 1.2, end: 3.456, text: ' Hello there. ' },
      { start: 4, end: 4, text: 'Thank you.' },
      { start: 5, end: 6, text: 'Thank you.' },
      { start: 7, end: 8, text: 'Thank you.' },
      { start: 9, end: 10, text: '' },
      { start: 11, end: 12, text: 'Subtitles by the community', no_speech_prob: 0.9, avg_logprob: -1.4 },
      { start: 3661, end: 3662.5, text: 'Bye.' },
    ]);
    expect(cues.map(c => [c.start, c.end, c.text])).toEqual([
      ['00:00:01,200', '00:00:03,456', 'Hello there.'],
      ['00:00:04,000', '00:00:04,500', 'Thank you.'],
      ['00:00:05,000', '00:00:06,000', 'Thank you.'],
      ['01:01:01,000', '01:01:02,500', 'Bye.'],
    ]);
    expect(cues.map(c => c.index)).toEqual([1, 2, 3, 4]);
  });
});

describe('splitSegment', () => {
  const w = (start: number, end: number, word: string) => ({ start, end, word });
  it('cuts long Whisper segments at pauses and size limits, keeping stray first words with their sentence', () => {
    const parts = splitSegment({
      start: 30,
      end: 53,
      text: '',
      words: [w(30.6, 31.2, " You're"), w(51.4, 51.7, ' supposed'), w(51.7, 51.9, ' to'), w(51.9, 52.2, ' catch'), w(52.2, 52.8, ' it.')],
    });
    expect(parts.map(p => [p.start, p.end, p.text])).toEqual([
      [51.1, 52.8, "You're supposed to catch it."],
    ]);
    const two = splitSegment({ start: 0, end: 9, text: '', words: [w(0, 0.5, ' Hello,'), w(0.6, 1, ' there.'), w(5, 5.5, ' Go!')] });
    expect(two.map(p => p.text)).toEqual(['Hello, there.', 'Go!']);
    const long = Array.from({ length: 20 }, (_, i) => w(i * 0.5, i * 0.5 + 0.4, ' word'));
    expect(splitSegment({ start: 0, end: 10, text: '', words: long }).every(p => p.end - p.start <= 6 && p.text.length <= 84)).toBe(true);
  });
});
