import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
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
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(stdout).streams ?? [];
}

/**
 * Extracts an embedded subtitle stream. ASS/SSA is copied as-is (so signs and karaoke can
 * be filtered by style); other text formats are converted to SRT by ffmpeg.
 * Written to a temp file instead of stdout: heavily typeset ASS (anime BDs) can exceed any
 * sensible in-memory buffer for the child process output.
 */
export async function extractSubtitle(file: string, streamIndex: number, format: 'srt' | 'ass'): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sub-'));
  const out = path.join(dir, `sub.${format}`);
  try {
    const args = ['-v', 'error', '-y', '-i', file, '-map', `0:${streamIndex}`];
    args.push(...(format === 'ass' ? ['-c:s', 'copy', '-f', 'ass'] : ['-f', 'srt']), out);
    await run('ffmpeg', args, { timeout: 10 * 60_000, maxBuffer: 10 * 1024 * 1024 });
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
