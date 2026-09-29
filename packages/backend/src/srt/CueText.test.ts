import { prepareCue, wrapText, computeWarnings, tmKey, MAX_LINE_LENGTH } from './CueText';

const upper = (xs: string[]) => xs.map(s => s.toUpperCase());

describe('prepareCue', () => {
  it('joins lines of one sentence so it is translated whole', () => {
    const p = prepareCue('Welcome. You\'re just in time for\nour story. An epic detective adventure.');
    expect(p.segments).toEqual(['Welcome. You\'re just in time for our story. An epic detective adventure.']);
  });

  it('rewraps the translation into balanced lines within the limit', () => {
    const p = prepareCue('Sherlock Holmes,\nthe greatest detective of all time.');
    const out = p.rebuild(['Sherlock Holmes, o maior detetive de todos os tempos.']);
    expect(out).toBe('Sherlock Holmes, o maior\ndetetive de todos os tempos.');
    expect(out.split('\n').every(l => l.length <= MAX_LINE_LENGTH)).toBe(true);
  });

  it('keeps a short translation on one line', () => {
    expect(prepareCue('No, we\'re\ndoing this.').rebuild(['Não, vamos fazer isso.'])).toBe('Não, vamos fazer isso.');
  });

  it('splits dialogue turns and keeps the dashes', () => {
    const p = prepareCue('- Oh, Watson.\n- Yes, Sherlock?');
    expect(p.segments).toEqual(['Oh, Watson.', 'Yes, Sherlock?']);
    expect(p.rebuild(['Ah, Watson.', 'Sim, Sherlock?'])).toBe('- Ah, Watson.\n- Sim, Sherlock?');
  });

  it('continues a dialogue turn that wraps onto a line without a dash', () => {
    const p = prepareCue('- I think we should\ngo now.\n- Fine.');
    expect(p.segments).toEqual(['I think we should go now.', 'Fine.']);
  });

  it('treats a single dashed line as normal text', () => {
    expect(prepareCue('- Hello there.').segments).toEqual(['- Hello there.']);
  });

  it('preserves italics for a whole cue split per line', () => {
    const p = prepareCue('<i>Breaking news! While London prepares</i>\n<i>for its largest fireworks display ever...</i>');
    expect(p.segments).toEqual(['Breaking news! While London prepares for its largest fireworks display ever...']);
    const out = p.rebuild(['Últimas notícias! Enquanto Londres se prepara para sua maior queima de fogos...']);
    expect(out.startsWith('<i>')).toBe(true);
    expect(out.endsWith('</i>')).toBe(true);
    expect(out.match(/<i>/g)).toHaveLength(1);
  });

  it('preserves italics when only one line is italic', () => {
    const p = prepareCue('<i>On the radio:</i>\nWe need help.');
    expect(p.segments).toEqual(['On the radio:', 'We need help.']);
    expect(p.rebuild(['No rádio:', 'Precisamos de ajuda.'])).toBe('<i>No rádio:</i>\nPrecisamos de ajuda.');
  });

  it('preserves italics in dialogue', () => {
    const p = prepareCue('<i>- Hello?</i>\n- Who is it?');
    expect(p.rebuild(['Alô?', 'Quem é?'])).toBe('<i>- Alô?</i>\n- Quem é?');
  });

  it('drops partial inline tags instead of producing broken markup', () => {
    const p = prepareCue('I <b>really</b> mean it.');
    expect(p.segments).toEqual(['I really mean it.']);
  });

  it('keeps ASS positioning tags', () => {
    const p = prepareCue('{\\an8}Somewhere in London');
    expect(p.segments).toEqual(['Somewhere in London']);
    expect(p.rebuild(['Em algum lugar de Londres'])).toBe('{\\an8}Em algum lugar de Londres');
  });

  it('keeps music markers around lyrics', () => {
    const p = prepareCue('♪ I\'m on my way ♪');
    expect(p.segments).toEqual(['I\'m on my way']);
    expect(p.rebuild(['Estou a caminho'])).toBe('♪ Estou a caminho ♪');
  });

  it('does not send punctuation-only cues to the translator', () => {
    const p = prepareCue('...');
    expect(p.segments).toEqual([]);
    expect(p.rebuild([])).toBe('...');
    expect(prepareCue('♪♪').segments).toEqual([]);
  });

  it('keeps sound descriptions translatable', () => {
    const p = prepareCue('[door opens]');
    expect(p.segments).toEqual(['[door opens]']);
    expect(p.rebuild(upper(p.segments))).toBe('[DOOR OPENS]');
  });

  it('falls back to the source text for a missing translation', () => {
    expect(prepareCue('- A.\n- B.').rebuild(['X.'])).toBe('- X.\n- B.');
  });
});

describe('wrapText', () => {
  it('returns short text unchanged', () => {
    expect(wrapText('Olá')).toEqual(['Olá']);
  });

  it('prefers breaking after punctuation', () => {
    expect(wrapText('Não, eu não acho que isso seja uma boa ideia agora.')).toEqual([
      'Não, eu não acho que isso',
      'seja uma boa ideia agora.',
    ]);
  });

  it('prefers two slightly long lines over three', () => {
    const t = 'Bem-vindo. Você chegou bem na hora da nossa história. Uma aventura épica de detetive.';
    const lines = wrapText(t);
    expect(lines).toHaveLength(2);
    expect(lines.every(l => l.length <= Math.round(MAX_LINE_LENGTH * 1.15))).toBe(true);
  });

  it('uses more lines when the text cannot fit in two', () => {
    const long = 'palavra '.repeat(20).trim();
    const lines = wrapText(long);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every(l => l.length <= MAX_LINE_LENGTH)).toBe(true);
  });
});

describe('computeWarnings', () => {
  it('flags ordinary text that came back unchanged', () => {
    expect(computeWarnings('We have a problem.', 'We have a problem.', 3000)).toContain('untranslated');
    expect(computeWarnings('Hello there, Sherlock.', 'Hello there, Sherlock.', 3000)).toContain('untranslated');
    expect(computeWarnings('WE HAVE A PROBLEM', 'WE HAVE A PROBLEM', 3000)).toContain('untranslated');
  });

  it('does not flag names or single words that stay the same', () => {
    expect(computeWarnings('Sherlock!', 'Sherlock!', 1000)).toEqual([]);
    expect(computeWarnings('Sherlock. Sherlock!', 'Sherlock. Sherlock!', 1000)).toEqual([]);
    expect(computeWarnings('- Nanette!\n- Benny!', '- Nanette!\n- Benny!', 1000)).toEqual([]);
    expect(computeWarnings('Carter Verone.', 'Carter Verone.', 1000)).toEqual([]);
    expect(computeWarnings('OK.', 'OK.', 1000)).toEqual([]);
  });

  it('flags lines longer than the limit', () => {
    expect(computeWarnings('x y', 'a'.repeat(MAX_LINE_LENGTH + 1), 10000)).toContain('long_line');
  });

  it('flags reading speed only when the translation made it too fast', () => {
    expect(computeWarnings('Hi there', 'Uma frase bem comprida para meio segundo', 500)).toContain('fast_reading');
    expect(computeWarnings('Hi there', 'Olá', 2000)).toEqual([]);
    // Original already too fast and the translation is not longer: not the translator's fault.
    const fastSrc = 'This line is already far too fast to read';
    expect(computeWarnings(fastSrc, 'Esta fala já é rápida demais pra ler', 1000)).not.toContain('fast_reading');
  });

  it('ignores tags when checking', () => {
    expect(computeWarnings('<i>We go now.</i>', '<i>Vamos agora.</i>', 2000)).toEqual([]);
  });
});

describe('tmKey', () => {
  it('normalizes case, spaces and tags but keeps punctuation', () => {
    expect(tmKey('<i>Really?</i>\n  Yes')).toBe('really? yes');
    expect(tmKey('Really?')).not.toBe(tmKey('Really.'));
  });
});
