/** Settings from environment variables (see packages/auto/README.md). */
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : def;
};

const gemini = (process.env.GEMINI_API_KEY || '').trim();

export const config = {
  /** Media folders to scan (as seen inside the container). */
  mediaRoots: (process.env.MEDIA_ROOTS || '/movies,/TV-Show,/TV-Show-2,/Anime')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  /** Embedded Postgres (map of files + translation memory). */
  dataDir: process.env.DATA_DIR || '/data',
  /** Optional: a Postgres URL (e.g. the Neon of the web app) for the translation memory. */
  memoryDatabaseUrl: process.env.MEMORY_DATABASE_URL || '',
  /** Google AI Studio key: Gemini becomes the main translator (empty = free Google endpoint only). */
  geminiApiKey: gemini,
  /** Gemini models tried in order; each has its own daily free quota, so when one runs out the next is used.
   * Pinned versions on purpose: the "-latest" aliases move to new models with much smaller free quotas. */
  geminiModels: (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  /** Pause before each Gemini request (keeps under the free per-minute limit). */
  geminiDelayMs: num('GEMINI_DELAY_MS', 4500),
  /** Characters of subtitle text per Gemini request (bigger = more context, fewer requests). */
  geminiGroupChars: num('GEMINI_GROUP_CHARS', 12000),
  /** Minutes between cycles; each cycle translates up to FILES_PER_CYCLE files. */
  cycleMinutes: num('CYCLE_MINUTES', gemini ? 20 : 30),
  filesPerCycle: num('FILES_PER_CYCLE', gemini ? 2 : 1),
  dailyLimit: num('DAILY_LIMIT', gemini ? 120 : 40),
  /** Full folder scan interval (hours). */
  scanHours: num('SCAN_HOURS', 6),
  /** Days to wait after a video arrives, giving Bazarr time to find a human subtitle. */
  waitDays: num('WAIT_DAYS', 3),
  /** Pause before each request to the free Google endpoint (fallback when Gemini is on). */
  requestDelayMs: num('REQUEST_DELAY_MS', 3000),
  /** Pause everything after a file fails because the translator is refusing requests. */
  cooldownHours: num('COOLDOWN_HOURS', 6),
  /** Give up on a file after this many failed attempts. */
  maxAttempts: num('MAX_ATTEMPTS', 3),
  /**
   * The translator is considered to be refusing requests (pause, write nothing) when more
   * than this share of the texts sent to the main translator came back empty. Cues that merely stay the
   * same after translation (names, "Hmm", symbols) do not count.
   */
  maxProviderFailRatio: num('MAX_PROVIDER_FAIL_RATIO', 0.2),
  /** More cues than this is not dialogue (effects/karaoke track): skip the file. */
  maxCues: num('MAX_CUES', 3000),
  /** Ignore videos smaller than this (samples, extras). */
  minVideoMb: num('MIN_VIDEO_MB', 50),
  port: num('PORT', 8787),
  /** Optional file to append the log to (besides stdout). */
  logFile: process.env.LOG_FILE || '',
};
