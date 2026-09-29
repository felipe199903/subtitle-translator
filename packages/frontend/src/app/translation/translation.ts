import { Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { HttpErrorResponse } from '@angular/common/http';
import { CueWarning, Job, JobCue, SubtitleService, apiErrorMessage } from '../services/subtitle.service';

type Filter = 'all' | 'warnings' | CueWarning;
type SaveState = 'saving' | 'saved' | 'error';

export const WARNING_LABELS: Record<CueWarning, { label: string; help: string }> = {
  untranslated: { label: 'Não traduzida', help: 'O texto voltou igual ao original. Revise ou tente de novo.' },
  long_line: { label: 'Linha longa', help: 'Uma linha passou de 42 caracteres; pode ficar grande na tela.' },
  fast_reading: { label: 'Leitura rápida', help: 'A tradução ficou longa para o tempo da fala. Considere encurtar.' },
  fallback_provider: { label: 'Tradutor reserva', help: 'Traduzida pelo serviço reserva (MyMemory). Vale conferir.' },
};

/** Consecutive failed steps before the loop pauses and asks the user to continue. */
const MAX_FAILURES = 3;

@Component({
  selector: 'app-translation',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './translation.html',
  styleUrl: './translation.scss',
})
export class TranslationComponent implements OnInit {
  private api = inject(SubtitleService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly warningLabels = WARNING_LABELS;
  readonly warningTypes = Object.keys(WARNING_LABELS) as CueWarning[];

  job = signal<Omit<Job, 'cues'> | null>(null);
  cues = signal<JobCue[]>([]);
  loadError = signal<string | null>(null);
  actionError = signal<string | null>(null);
  filter = signal<Filter>('all');
  /** Free-text search over the original and the translation (case and accent insensitive). */
  search = signal('');
  saveState = signal<Record<number, SaveState>>({});
  /** True when translation stopped after repeated network errors. */
  paused = signal(false);

  private jobId = '';
  private running = false;
  private destroyed = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private loopStartedAt = 0;
  private doneAtLoopStart = 0;

  status = computed(() => this.job()?.status ?? 'translating');
  progress = computed(() => {
    const p = this.job()?.progress ?? { done: 0, total: 0 };
    return { ...p, percent: p.total ? Math.round((p.done / p.total) * 100) : 0 };
  });
  eta = computed(() => {
    const { done, total } = this.progress();
    const doneThisRun = done - this.doneAtLoopStart;
    if (this.status() !== 'translating' || this.paused() || doneThisRun <= 0 || done >= total) return null;
    const perCue = (Date.now() - this.loopStartedAt) / doneThisRun;
    const secs = Math.ceil((perCue * (total - done)) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.ceil(secs / 60)} min`;
  });
  totalWarnings = computed(() => this.cues().filter(c => c.warnings.length).length);
  /** Per-type counts, derived from the local cues so they update right after an edit. */
  warningCounts = computed(() => {
    const counts: Partial<Record<CueWarning, number>> = {};
    for (const c of this.cues()) for (const w of c.warnings) counts[w] = (counts[w] ?? 0) + 1;
    return counts;
  });
  visibleCues = computed(() => {
    const f = this.filter();
    let list = this.cues();
    if (f === 'warnings') list = list.filter(c => c.warnings.length);
    else if (f !== 'all') list = list.filter(c => c.warnings.includes(f));
    const q = normalize(this.search().trim());
    if (q) list = list.filter(c => normalize(c.text).includes(q) || normalize(c.translation ?? '').includes(q));
    return list;
  });
  statusLabel = computed(() => {
    if (this.status() === 'translating') return this.paused() ? 'Pausada' : 'Traduzindo';
    return this.status() === 'done' ? 'Concluída' : 'Erro';
  });
  editedCount = computed(() => this.cues().filter(c => c.source === 'user').length);

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('jobId') ?? '';
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.retryTimer) clearTimeout(this.retryTimer);
    });
    if (this.isBrowser) this.load();
  }

  private load(): void {
    this.api.getJob(this.jobId).subscribe({
      next: job => {
        const { cues, ...meta } = job;
        this.job.set(meta);
        this.cues.set(cues);
        // A new upload, or a reload in the middle of a translation: (re)start the loop.
        if (job.status === 'translating') this.startLoop();
      },
      error: (err: unknown) => {
        this.loadError.set(
          err instanceof HttpErrorResponse && err.status === 404
            ? 'Esta tradução não existe mais (elas expiram 7 dias depois do último acesso). Envie o arquivo de novo.'
            : apiErrorMessage(err, 'Não foi possível carregar a tradução.')
        );
      },
    });
  }

  /**
   * The server translates one batch per request, so the page drives the job:
   * it asks for the next batch until the status is "done".
   */
  private startLoop(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.failures = 0;
    this.paused.set(false);
    this.loopStartedAt = Date.now();
    this.doneAtLoopStart = this.progress().done;
    this.step();
  }

  private step(): void {
    if (this.destroyed) return;
    this.api.translateNext(this.jobId).subscribe({
      next: result => {
        this.failures = 0;
        if (result.cues.length) this.mergeCues(result.cues);
        this.job.update(j => (j ? { ...j, status: result.status, progress: result.progress } : j));
        if (result.status === 'translating') this.step();
        else this.running = false;
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.running = false;
          this.loadError.set('Esta tradução não existe mais. Envie o arquivo de novo.');
          return;
        }
        this.failures++;
        if (this.failures >= MAX_FAILURES) {
          this.running = false;
          this.paused.set(true);
          return;
        }
        // Transient failure: wait a little longer each time, then try the same batch again.
        this.retryTimer = setTimeout(() => this.step(), 1000 * 2 ** (this.failures - 1));
      },
    });
  }

  /** Continues a translation that paused after network errors. */
  resume(): void {
    this.startLoop();
  }

  private mergeCues(updates: JobCue[]): void {
    const next = [...this.cues()];
    for (const u of updates) next[u.position] = u;
    this.cues.set(next);
  }

  setFilter(f: Filter): void {
    this.filter.set(this.filter() === f ? 'all' : f);
  }

  /** Saves an edited translation when the textarea loses focus. */
  save(cue: JobCue, textarea: HTMLTextAreaElement): void {
    const value = textarea.value.trim();
    if (!value) {
      textarea.value = cue.translation ?? '';
      return;
    }
    if (value === (cue.translation ?? '').trim()) return;

    this.setSaveState(cue.position, 'saving');
    this.api.editCue(this.jobId, cue.position, value).subscribe({
      next: updated => {
        this.mergeCues([updated]);
        this.setSaveState(cue.position, 'saved');
      },
      error: err => {
        this.setSaveState(cue.position, 'error');
        this.actionError.set(apiErrorMessage(err, 'Não foi possível salvar a correção.'));
      },
    });
  }

  revert(cue: JobCue, textarea: HTMLTextAreaElement): void {
    textarea.value = cue.translation ?? '';
    textarea.blur();
  }

  retry(): void {
    this.actionError.set(null);
    this.api.retry(this.jobId).subscribe({
      next: count => {
        if (count > 0) {
          this.job.update(j => (j ? { ...j, status: 'translating' } : j));
          this.startLoop();
        }
      },
      error: err => this.actionError.set(apiErrorMessage(err, 'Não foi possível tentar de novo.')),
    });
  }

  downloadUrl(): string {
    return this.api.downloadUrl(this.jobId);
  }

  /** Colour family of a warning: red when the text was not translated, blue for info, amber otherwise. */
  level(w: CueWarning): 'danger' | 'warning' | 'info' {
    return w === 'untranslated' ? 'danger' : w === 'fallback_provider' ? 'info' : 'warning';
  }

  /** The most severe warning level of a cue, used for the coloured edge of its row. */
  cueLevel(cue: JobCue): string | null {
    if (!cue.warnings.length) return null;
    const levels = cue.warnings.map(w => this.level(w));
    return levels.includes('danger') ? 'danger' : levels.includes('warning') ? 'warning' : 'info';
  }

  rows(text: string | null): number {
    return Math.max(2, (text ?? '').split('\n').length);
  }

  shortTime(ts: string): string {
    return ts.replace(/^00:/, '').replace(/,\d+$/, '');
  }

  private setSaveState(position: number, state: SaveState): void {
    this.saveState.update(s => ({ ...s, [position]: state }));
    if (state === 'saved') {
      setTimeout(() => {
        this.saveState.update(s => {
          if (s[position] !== 'saved') return s;
          const { [position]: _, ...rest } = s;
          return rest;
        });
      }, 2500);
    }
  }
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
