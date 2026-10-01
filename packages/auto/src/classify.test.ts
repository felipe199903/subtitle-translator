import { MT_TAG, decide, embeddedInfo, mtFileName, needsProbe, sidecars, ProbeStream } from './classify';

const V = '/TV-Show/Show/Season 1/Show - S01E01.mkv';
const names = (...n: string[]) => ['Show - S01E01.mkv', ...n];

describe('mtFileName', () => {
  it('uses a name Emby reads as pt-BR with a title and Bazarr ignores', () => {
    expect(mtFileName(V)).toBe(`/TV-Show/Show/Season 1/Show - S01E01.pt-BR.${MT_TAG}.srt`);
  });
});

describe('sidecars', () => {
  it('detects human PT-BR in the usual spellings, but not forced-only files', () => {
    for (const n of ['pt-BR.srt', 'pt-br.sdh.srt', 'pb.srt', 'por.srt', 'pt.srt']) {
      expect(sidecars(V, names(`Show - S01E01.${n}`)).ptHuman).toHaveLength(1);
    }
    expect(sidecars(V, names('Show - S01E01.pt-BR.forced.srt')).ptHuman).toHaveLength(0);
  });

  it('recognizes our own file separately from human subtitles', () => {
    const s = sidecars(V, names(`Show - S01E01.pt-BR.${MT_TAG}.srt`));
    expect(s.mt).toContain(MT_TAG);
    expect(s.ptHuman).toHaveLength(0);
  });

  it('prefers plain English over SDH and ignores other videos in the folder', () => {
    const s = sidecars(V, names('Show - S01E01.en.sdh.srt', 'Show - S01E01.en.srt', 'Show - S01E02.en.srt', 'Show - S01E01.en.ass'));
    expect(s.enSrt.map(f => f.split('.').slice(-2).join('.'))).toEqual(['en.srt', 'sdh.srt']);
  });
});

const sub = (index: number, language: string, codec = 'subrip', extra: Partial<ProbeStream> = {}): ProbeStream => ({
  index,
  codec_type: 'subtitle',
  codec_name: codec,
  tags: { language },
  ...extra,
});

describe('test files', () => {
  it('ignores engine comparison files written by try.ts', () => {
    const s = sidecars('/m/Movie.mkv', ['Movie.mkv', 'Movie.pt-BR.Teste-Gemini.srt', 'Movie.en.srt']);
    expect(s.ptHuman).toEqual([]);
    expect(s.enSrt).toEqual(['/m/Movie.en.srt'.replace(/\//g, require('path').sep)]);
  });
});

describe('embeddedInfo', () => {
  it('picks a full English text track over SDH and signs/songs', () => {
    const info = embeddedInfo([
      { index: 0, codec_type: 'video' },
      sub(2, 'eng', 'ass', { tags: { language: 'eng', title: 'Signs & Songs' } }),
      sub(3, 'eng', 'subrip', { disposition: { hearing_impaired: 1 } }),
      sub(4, 'eng', 'ass'),
    ]);
    expect(info.enTextStream).toBe(4);
  });

  it('skips "S&S" and other signs tracks but keeps them as last alternatives', () => {
    const info = embeddedInfo([
      sub(3, 'eng', 'ass', { tags: { language: 'eng', title: 'S&S' } }),
      sub(4, 'eng', 'ass', { tags: { language: 'eng', title: 'MTBB (Honorifics) Subs' } }),
      sub(5, 'eng', 'ass', { tags: { language: 'eng', title: 'Dialog - ENG' }, disposition: { forced: 1 } }),
      sub(6, 'eng', 'ass', { tags: { language: 'eng', title: 'TS' } }),
    ]);
    expect(info.enTextStream).toBe(4);
    expect(info.enTextStreams).toEqual([4, 3, 6]);
  });

  it('reports image-only English (PGS) and Portuguese tracks/audio', () => {
    expect(embeddedInfo([sub(2, 'eng', 'hdmv_pgs_subtitle')]).enImageOnly).toBe(true);
    expect(embeddedInfo([sub(2, 'por')]).ptSubtitle).toBe(true);
    expect(embeddedInfo([{ index: 1, codec_type: 'audio', tags: { language: 'por' } }]).ptAudio).toBe(true);
    expect(embeddedInfo([sub(2, 'por', 'subrip', { disposition: { forced: 1 } })]).ptSubtitle).toBe(false);
  });
});

describe('decide', () => {
  const none = { ptHuman: [], mt: null, enSrt: [] };
  const noEmb = { ptSubtitle: false, ptAudio: false, enTextStream: null, enImageOnly: false };

  it('skips videos that already have PT-BR and removes our file when a human one arrives', () => {
    expect(decide({ ...none, ptHuman: ['x'] }, null, 10, 3)).toEqual({ status: 'has_ptbr', deleteMt: false });
    expect(decide({ ...none, ptHuman: ['x'], mt: 'y' }, null, 10, 3)).toEqual({ status: 'superseded', deleteMt: true });
    expect(decide(none, { ...noEmb, ptSubtitle: true }, 10, 3).status).toBe('has_ptbr');
    expect(decide(none, { ...noEmb, ptAudio: true, enTextStream: 3 }, 10, 3).status).toBe('audio_pt');
  });

  it('waits for new videos and queues old ones, preferring the external English file', () => {
    expect(decide({ ...none, enSrt: ['a.en.srt'] }, noEmb, 1, 3)).toEqual({ status: 'waiting', source: 'external:a.en.srt' });
    expect(decide({ ...none, enSrt: ['a.en.srt'] }, { ...noEmb, enTextStream: 3 }, 5, 3)).toEqual({ status: 'pending', source: 'external:a.en.srt' });
    expect(decide(none, { ...noEmb, enTextStream: 3 }, 5, 3)).toEqual({ status: 'pending', source: 'embedded:3' });
  });

  it('explains why there is nothing to translate', () => {
    expect(decide(none, noEmb, 5, 3).status).toBe('no_english');
    expect(decide(none, { ...noEmb, enImageOnly: true }, 5, 3).status).toBe('image_only');
    expect(decide({ ...none, mt: 'y' }, null, 5, 3).status).toBe('translated');
  });

  it('only probes the video when the files next to it cannot decide', () => {
    expect(needsProbe(none)).toBe(true);
    expect(needsProbe({ ...none, ptHuman: ['x'] })).toBe(false);
    expect(needsProbe({ ...none, mt: 'y' })).toBe(false);
  });
});
