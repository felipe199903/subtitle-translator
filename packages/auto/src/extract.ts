import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import axios from 'axios';
import { Cue, parseSrt } from '../../backend/src/srt/SrtParser';

/**
 * Text for videos without a text subtitle: OCR of a Blu-ray PGS subtitle (pgsrip + tesseract)
 * and transcription of the audio (Whisper server).
 */
const run = promisify(execFile);

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'src-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Reads an English PGS track with OCR and returns its cues. */
export async function ocrSubtitle(file: string, streamIndex: number): Promise<Cue[]> {
  return inTempDir(async dir => {
    // pgsrip takes the language from the file name ("<name>.en.sup" → English tesseract model, "<name>.en.srt").
    const sup = path.join(dir, 'sub.en.sup');
    await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-map', `0:${streamIndex}`, '-c:s', 'copy', sup], {
      timeout: 10 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    await run('pgsrip', ['rip', '--force', '--language', 'en', sup], { timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 });
    const srt = path.join(dir, 'sub.en.srt');
    return parseSrt(await fs.readFile(srt).catch(() => Buffer.alloc(0))).cues;
  });
}

export interface Transcription {
  /** Language Whisper heard (ISO 639-1, e.g. "en", "ja", "pt"). */
  language: string;
  cues: Cue[];
}

const ts = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

interface Word {
  start: number;
  end: number;
  word: string;
}
interface Segment {
  start: number;
  end: number;
  text: string;
  words?: Word[];
  no_speech_prob?: number;
  avg_logprob?: number;
}

/** Longest cue: two subtitle lines, a few seconds on screen. */
const MAX_CHARS = 84;
const MAX_SECONDS = 6;
/** Silence between words that starts a new cue. */
const MAX_GAP = 1;

/**
 * Whisper segments can span 20 s or more (VAD merges speech around music); with word timestamps they are cut into
 * subtitle-sized cues: at a pause, after a sentence once the cue has some length, or at the size limits.
 */
export function splitSegment(seg: Segment): Segment[] {
  const words = (seg.words ?? []).filter(w => w.word.trim());
  if (!words.length) return [seg];
  const out: Segment[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map(w => w.word).join('').trim() });
    cur = [];
  };
  for (const w of words) {
    if (cur.length) {
      const text = cur.map(x => x.word).join('').trim();
      const prev = cur[cur.length - 1];
      const sentenceEnd = /[.?!…]["')\]]?$/.test(prev.word.trim()) && text.length >= 30;
      if (w.start - prev.end > MAX_GAP && text.length < 12 && !/[.?!…,;:]$/.test(text)) {
        // A lone "You're" 20 s before the rest of the sentence is a timestamp slip around music: keep it with the rest.
        cur = cur.map(x => ({ ...x, start: Math.max(prev.end, w.start - 0.3), end: w.start }));
      } else if (w.start - prev.end > MAX_GAP || sentenceEnd || (text + w.word).trim().length > MAX_CHARS || w.end - cur[0].start > MAX_SECONDS) {
        flush();
      }
    }
    cur.push(w);
  }
  flush();
  return out;
}

/** Whisper's JSON segments as cues (empty and repeated hallucination lines dropped). */
export function segmentsToCues(segments: Segment[]): Cue[] {
  const cues: Cue[] = [];
  let last = '';
  let repeats = 0;
  // Whisper's own silence test: likely no speech and a low-confidence text = invented over music/noise.
  const heard = segments.filter(s => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1));
  for (const s of heard.flatMap(splitSegment)) {
    const text = (s.text || '').trim();
    if (!text) continue;
    // Over music Whisper tends to repeat one line dozens of times: keep at most two in a row.
    repeats = text === last ? repeats + 1 : 0;
    last = text;
    if (repeats >= 2) continue;
    cues.push({ index: cues.length + 1, start: ts(s.start), end: ts(Math.max(s.end, s.start + 0.5)), text });
  }
  return cues;
}

/**
 * Sends one audio track (16 kHz mono Opus, small to upload) to the Whisper server. The service's VAD filter is
 * off on purpose: on cartoons it dropped half of an episode's dialogue (speech over music and effects).
 * `language` empty = Whisper detects it from the first 30 s.
 */
export async function transcribeAudio(
  file: string,
  streamIndex: number,
  whisperUrl: string,
  timeoutMs: number,
  language?: string
): Promise<Transcription> {
  return inTempDir(async dir => {
    const audio = path.join(dir, 'audio.ogg');
    await run(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', file, '-map', `0:${streamIndex}`, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k', audio],
      { timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 }
    );
    const form = new FormData();
    form.append('audio_file', new Blob([await fs.readFile(audio)], { type: 'audio/ogg' }), 'audio.ogg');
    const params: Record<string, string> = { task: 'transcribe', output: 'json', encode: 'true', vad_filter: 'false', word_timestamps: 'true' };
    if (language) params.language = language;
    const res = await axios.post(`${whisperUrl}/asr`, form, { params, timeout: timeoutMs, maxBodyLength: Infinity });
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return { language: String(body.language || language || ''), cues: segmentsToCues(body.segments ?? []) };
  });
}
