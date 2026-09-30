/** Settings from environment variables (see packages/auto/README.md). */
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : def;
};

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
  /** Minutes between cycles; each cycle translates up to FILES_PER_CYCLE files. */
  cycleMinutes: num('CYCLE_MINUTES', 30),
  filesPerCycle: num('FILES_PER_CYCLE', 1),
  dailyLimit: num('DAILY_LIMIT', 40),
  /** Full folder scan interval (hours). */
  scanHours: num('SCAN_HOURS', 6),
  /** Days to wait after a video arrives, giving Bazarr time to find a human subtitle. */
  waitDays: num('WAIT_DAYS', 3),
  /** Pause before each request to the free Google endpoint. */
  requestDelayMs: num('REQUEST_DELAY_MS', 3000),
  /** Pause everything after a file fails because the translator is refusing requests. */
  cooldownHours: num('COOLDOWN_HOURS', 6),
  /** Give up on a file after this many failed attempts. */
  maxAttempts: num('MAX_ATTEMPTS', 3),
  /**
   * Accept a translation only if at most this share of cues came back unchanged. Names and
   * interjections ("Naruto!", "Hmm") legitimately stay the same; when the translator refuses
   * requests nearly every cue does, so 25% separates the two cases.
   */
  maxUntranslatedRatio: num('MAX_UNTRANSLATED_RATIO', 0.25),
  /** Ignore videos smaller than this (samples, extras). */
  minVideoMb: num('MIN_VIDEO_MB', 50),
  port: num('PORT', 8787),
  /** Optional file to append the log to (besides stdout). */
  logFile: process.env.LOG_FILE || '',
};
