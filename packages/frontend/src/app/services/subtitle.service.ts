import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type CueWarning = 'untranslated' | 'long_line' | 'fast_reading' | 'fallback_provider';
export type CueSource = 'user' | 'memory' | 'provider' | 'fallback' | 'none';
export type JobStatus = 'translating' | 'done' | 'error';

export interface JobCue {
  position: number;
  index: number;
  start: string;
  end: string;
  text: string;
  translation: string | null;
  source: CueSource | null;
  warnings: CueWarning[];
}

export interface Job {
  id: string;
  fileName: string;
  from: string;
  to: string;
  detectedLanguage: string;
  parseWarnings: string[];
  status: JobStatus;
  error: string | null;
  progress: { done: number; total: number };
  warningCounts: Partial<Record<CueWarning, number>>;
  createdAt: number;
  cues: JobCue[];
}

/** Result of one translation step: the cues it finished and the overall state. */
export interface TranslateStep {
  status: JobStatus;
  progress: { done: number; total: number };
  cues: JobCue[];
}

/** The API runs as a Vercel Function, which accepts bodies up to 4.5 MB. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Extracts the API's Portuguese error message from an HTTP error. */
export function apiErrorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Não foi possível falar com o servidor. Verifique se ele está rodando.';
    if (typeof err.error?.error === 'string') return err.error.error;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class SubtitleService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  createJob(file: File): Observable<Job> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ data: Job }>(`${this.api}/jobs`, form).pipe(map(r => r.data));
  }

  getJob(id: string): Observable<Job> {
    return this.http.get<{ data: Job }>(`${this.api}/jobs/${id}`).pipe(map(r => r.data));
  }

  /** Translates the next batch of pending cues. Call repeatedly until the status is "done". */
  translateNext(id: string): Observable<TranslateStep> {
    return this.http.post<{ data: TranslateStep }>(`${this.api}/jobs/${id}/translate`, {}).pipe(map(r => r.data));
  }

  editCue(id: string, position: number, translation: string): Observable<JobCue> {
    return this.http
      .patch<{ data: { cue: JobCue } }>(`${this.api}/jobs/${id}/cues/${position}`, { translation })
      .pipe(map(r => r.data.cue));
  }

  retry(id: string): Observable<number> {
    return this.http.post<{ data: { retrying: number } }>(`${this.api}/jobs/${id}/retry`, {}).pipe(map(r => r.data.retrying));
  }

  downloadUrl(id: string): string {
    return `${this.api}/jobs/${id}/download`;
  }
}
