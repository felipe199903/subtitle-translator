import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { ProbeStream, VIDEO_EXTS } from './classify';

const run = promisify(execFile);

export interface VideoFile {
  path: string;
  size: number;
  mtimeMs: number;
  /** Names of all files in the same folder (to find subtitles next to it). */
  siblings: string[];
}

/** Walks the media folders and returns every video file (skips hidden folders). */
export async function listVideos(roots: string[], minBytes: number): Promise<VideoFile[]> {
  const out: VideoFile[] = [];
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unmounted or unreadable folder
    }
    const names = entries.map(e => e.name);
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()) && !/\bsample\b/i.test(e.name)) {
        const st = await fs.stat(full).catch(() => null);
        if (st && st.size >= minBytes) out.push({ path: full, size: st.size, mtimeMs: st.mtimeMs, siblings: names });
      }
    }
  };
  for (const root of roots) await walk(root);
  return out;
}

export async function probeStreams(file: string): Promise<ProbeStream[]> {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title:stream_disposition=forced,hearing_impaired', '-of', 'json', file],
    { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(stdout).streams ?? [];
}

/** Extracts an embedded subtitle stream as SRT text (ffmpeg converts ASS/WebVTT). */
export async function extractSubtitle(file: string, streamIndex: number): Promise<Buffer> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-map', `0:${streamIndex}`, '-f', 'srt', '-'], {
    timeout: 10 * 60_000,
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'buffer',
  });
  return stdout as unknown as Buffer;
}
