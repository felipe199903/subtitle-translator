import path from 'path';

/**
 * Decides, for one video, whether a Portuguese (Brazil) subtitle already exists, which
 * English subtitle can be translated and what the machine translation file is called.
 * Pure functions (no I/O) so the rules can be tested in isolation.
 */

/** Title Emby shows for our files: "Português (Brasil) · Tradução-automática". */
export const MT_TAG = 'Tradução-automática';

/**
 * Bazarr only recognizes a plain `.pt-BR.srt`, so this name does NOT count as PT-BR for it
 * (it keeps searching for a human subtitle), while Emby reads it as pt-BR with MT_TAG as title.
 */
export function mtFileName(videoPath: string): string {
  return `${stripExt(videoPath)}.pt-BR.${MT_TAG}.srt`;
}

export const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.ts', '.wmv']);
const SUB_EXTS = new Set(['.srt', '.ass', '.ssa', '.vtt', '.sub']);

const PT_CODES = new Set(['pt-br', 'pt_br', 'ptbr', 'pb', 'pob', 'pt', 'por', 'portuguese', 'brazilian']);
const EN_CODES = new Set(['en', 'eng', 'english']);
const HI_FLAGS = new Set(['sdh', 'hi', 'cc']);

export function stripExt(file: string): string {
  return file.slice(0, file.length - path.extname(file).length);
}

export interface Sidecars {
  /** Human (or at least not ours) PT-BR subtitles next to the video. */
  ptHuman: string[];
  /** Our machine translation, if present. */
  mt: string | null;
  /** English .srt files usable as source, best first (plain before SDH/HI/CC). */
  enSrt: string[];
}

/** Classifies the subtitle files that sit next to a video (`dirFiles` = names in its folder). */
export function sidecars(videoPath: string, dirFiles: string[]): Sidecars {
  const base = path.basename(stripExt(videoPath));
  const dir = path.dirname(videoPath);
  const mtName = path.basename(mtFileName(videoPath)).toLowerCase();
  const out: Sidecars = { ptHuman: [], mt: null, enSrt: [] };
  const en: Array<{ file: string; rank: number }> = [];

  for (const name of dirFiles) {
    const ext = path.extname(name).toLowerCase();
    if (!SUB_EXTS.has(ext) || !name.startsWith(base + '.')) continue;
    const full = path.join(dir, name);
    if (name.toLowerCase() === mtName) {
      out.mt = full;
      continue;
    }
    const tokens = name.slice(base.length + 1, name.length - ext.length).toLowerCase().split('.').filter(Boolean);
    if (!tokens.length || tokens.includes('forced')) continue; // forced = only foreign parts, not a full subtitle
    const lang = tokens[0];
    if (PT_CODES.has(lang)) out.ptHuman.push(full);
    else if (EN_CODES.has(lang) && ext === '.srt') en.push({ file: full, rank: tokens.some(t => HI_FLAGS.has(t)) ? 1 : 0 });
  }
  out.enSrt = en.sort((a, b) => a.rank - b.rank).map(e => e.file);
  return out;
}

/** The part of `ffprobe -show_streams` output this module needs. */
export interface ProbeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  tags?: { language?: string; title?: string };
  disposition?: { forced?: number; hearing_impaired?: number };
}

const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);

export interface EmbeddedInfo {
  ptSubtitle: boolean;
  ptAudio: boolean;
  /** Absolute stream index of the best English text subtitle, if any. */
  enTextStream: number | null;
  /** English subtitles exist but are all images (PGS/VobSub), which cannot be translated. */
  enImageOnly: boolean;
}

export function embeddedInfo(streams: ProbeStream[]): EmbeddedInfo {
  const lang = (s: ProbeStream) => (s.tags?.language || '').toLowerCase();
  const subs = streams.filter(s => s.codec_type === 'subtitle' && !s.disposition?.forced);
  const isHi = (s: ProbeStream) => !!s.disposition?.hearing_impaired || /\b(sdh|cc|hi)\b/i.test(s.tags?.title || '');
  const isSigns = (s: ProbeStream) => /sign|song|karaoke|forced/i.test(s.tags?.title || '');

  const enText = subs
    .filter(s => EN_CODES.has(lang(s)) && TEXT_SUB_CODECS.has((s.codec_name || '').toLowerCase()) && !isSigns(s))
    // Prefer full dialogue over SDH, then SubRip (cleaner than converted ASS).
    .sort((a, b) => Number(isHi(a)) - Number(isHi(b)) || Number(a.codec_name !== 'subrip') - Number(b.codec_name !== 'subrip'));

  return {
    ptSubtitle: subs.some(s => PT_CODES.has(lang(s))),
    ptAudio: streams.some(s => s.codec_type === 'audio' && PT_CODES.has(lang(s))),
    enTextStream: enText[0]?.index ?? null,
    enImageOnly: !enText.length && subs.some(s => EN_CODES.has(lang(s))),
  };
}

export type FileStatus =
  | 'has_ptbr' // já tem legenda PT-BR (externa ou embutida)
  | 'audio_pt' // o áudio já é em português
  | 'waiting' // vídeo recente: dando tempo para o Bazarr achar uma legenda humana
  | 'pending' // na fila para traduzir
  | 'translated' // tradução automática gravada
  | 'superseded' // chegou legenda humana; a automática foi removida
  | 'no_english' // não há legenda em inglês para traduzir
  | 'image_only' // inglês só em imagem (PGS/VobSub)
  | 'failed'; // falhou 3 vezes

export const STATUS_LABELS: Record<FileStatus, string> = {
  has_ptbr: 'Já tem PT-BR',
  audio_pt: 'Áudio em português',
  waiting: 'Aguardando (vídeo recente)',
  pending: 'Na fila',
  translated: 'Traduzida',
  superseded: 'Substituída por legenda humana',
  no_english: 'Sem legenda em inglês',
  image_only: 'Inglês só em imagem (PGS)',
  failed: 'Falhou',
};

export interface Decision {
  status: FileStatus;
  /** "external:<file>" or "embedded:<stream index>" when there is something to translate. */
  source?: string;
  /** Our file must be deleted because a human PT-BR subtitle arrived. */
  deleteMt?: boolean;
}

/**
 * Final decision for a video. `embedded` is only needed (and only probed) when the
 * sidecars alone cannot decide.
 */
export function decide(
  side: Sidecars,
  embedded: EmbeddedInfo | null,
  ageDays: number,
  waitDays: number
): Decision {
  const humanPt = side.ptHuman.length > 0 || !!embedded?.ptSubtitle;
  if (humanPt) return { status: side.mt ? 'superseded' : 'has_ptbr', deleteMt: !!side.mt };
  if (embedded?.ptAudio) return { status: 'audio_pt' };
  if (side.mt) return { status: 'translated' };

  const source = side.enSrt[0]
    ? `external:${side.enSrt[0]}`
    : embedded?.enTextStream != null
      ? `embedded:${embedded.enTextStream}`
      : undefined;
  if (!source) return { status: embedded?.enImageOnly ? 'image_only' : 'no_english' };
  return { status: ageDays < waitDays ? 'waiting' : 'pending', source };
}

/** Sidecars alone are enough when a human PT-BR or our own file already exists. */
export function needsProbe(side: Sidecars): boolean {
  return side.ptHuman.length === 0 && !side.mt;
}
