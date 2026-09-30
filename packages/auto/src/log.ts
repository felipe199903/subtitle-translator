import { appendFileSync } from 'fs';
import { config } from './config';

/** Timestamped log line to stdout and, if LOG_FILE is set, to that file. */
export function log(...parts: unknown[]) {
  // sv-SE gives "YYYY-MM-DD HH:MM:SS" in the container's local time zone (TZ).
  const line = `[${new Date().toLocaleString('sv-SE')}] ${parts
    .map(p => (p instanceof Error ? p.message : String(p)))
    .join(' ')}`;
  console.log(line);
  if (config.logFile) {
    try {
      appendFileSync(config.logFile, line + '\n');
    } catch {
      // the log file is optional
    }
  }
}
