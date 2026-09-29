import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslationComponent } from './translation';
import { Job, JobCue, SubtitleService, TranslateStep } from '../services/subtitle.service';

const cue = (position: number, patch: Partial<JobCue> = {}): JobCue => ({
  position,
  index: position + 1,
  start: '00:00:01,000',
  end: '00:00:02,000',
  text: `Line ${position}`,
  translation: `Linha ${position}`,
  source: 'provider',
  warnings: [],
  ...patch,
});

const job = (patch: Partial<Job> = {}): Job => ({
  id: 'job-1',
  fileName: 'movie.en.srt',
  from: 'en',
  to: 'pt-BR',
  detectedLanguage: 'en',
  parseWarnings: [],
  status: 'done',
  progress: { done: 3, total: 3 },
  warningCounts: { untranslated: 1 },
  error: null,
  createdAt: Date.now(),
  cues: [cue(0), cue(1, { warnings: ['untranslated'], translation: 'Line 1' }), cue(2)],
  ...patch,
});

describe('TranslationComponent', () => {
  let fixture: ComponentFixture<TranslationComponent>;
  let api: jasmine.SpyObj<SubtitleService>;

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [TranslationComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: SubtitleService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ jobId: 'job-1' }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TranslationComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<SubtitleService>('SubtitleService', ['getJob', 'translateNext', 'editCue', 'retry', 'downloadUrl']);
    api.downloadUrl.and.returnValue('http://api/jobs/job-1/download');
  });

  it('shows every cue side by side and enables download when done', async () => {
    api.getJob.and.returnValue(of(job()));
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.cue:not(.head)').length).toBe(3);
    expect(el.querySelector('a.btn.primary')?.getAttribute('href')).toBe('http://api/jobs/job-1/download');
    expect(el.textContent).toContain('Tentar de novo (1)');
  });

  it('filters to cues with warnings', async () => {
    api.getJob.and.returnValue(of(job()));
    await setup();
    fixture.componentInstance.setFilter('warnings');
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.cue:not(.head)');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Não traduzida');
  });

  it('saves an edited translation on blur and marks it as the user correction', async () => {
    api.getJob.and.returnValue(of(job()));
    api.editCue.and.returnValue(of(cue(0, { translation: 'Minha linha', source: 'user' })));
    await setup();

    const box: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    box.value = 'Minha linha';
    box.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(api.editCue).toHaveBeenCalledWith('job-1', 0, 'Minha linha');
    expect(fixture.nativeElement.textContent).toContain('Sua correção');
  });

  it('does not save when nothing changed', async () => {
    api.getJob.and.returnValue(of(job()));
    await setup();
    const box: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    box.dispatchEvent(new Event('blur'));
    expect(api.editCue).not.toHaveBeenCalled();
  });

  const pendingJob = () =>
    job({
      status: 'translating',
      progress: { done: 1, total: 3 },
      warningCounts: {},
      cues: [cue(0), cue(1, { translation: null, source: null }), cue(2, { translation: null, source: null })],
    });
  const step = (status: TranslateStep['status'], done: number, cues: JobCue[]): TranslateStep => ({
    status,
    progress: { done, total: 3 },
    cues,
  });

  it('drives the translation batch by batch until done (also after a reload)', async () => {
    api.getJob.and.returnValue(of(pendingJob()));
    api.translateNext.and.returnValues(of(step('translating', 2, [cue(1)])), of(step('done', 3, [cue(2)])));
    await setup();
    fixture.detectChanges();

    expect(api.translateNext).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.status()).toBe('done');
    expect(fixture.nativeElement.textContent).not.toContain('traduzindo…');
    expect(fixture.nativeElement.textContent).toContain('Tradução concluída');
  });

  it('does not translate a finished job', async () => {
    api.getJob.and.returnValue(of(job()));
    await setup();
    expect(api.translateNext).not.toHaveBeenCalled();
  });

  it('retries a failed batch, then pauses and lets the user continue', async () => {
    jasmine.clock().install();
    try {
      const fail = throwError(() => new HttpErrorResponse({ status: 0 }));
      api.getJob.and.returnValue(of(pendingJob()));
      api.translateNext.and.returnValues(fail, fail, fail, of(step('done', 3, [cue(1), cue(2)])));
      await setup();

      expect(api.translateNext).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(1000);
      expect(api.translateNext).toHaveBeenCalledTimes(2);
      jasmine.clock().tick(2000);
      expect(api.translateNext).toHaveBeenCalledTimes(3);
      fixture.detectChanges();
      expect(fixture.componentInstance.paused()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Tradução pausada');

      (fixture.nativeElement.querySelector('.paused button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(api.translateNext).toHaveBeenCalledTimes(4);
      expect(fixture.componentInstance.status()).toBe('done');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('restarts the loop after "Tentar de novo"', async () => {
    api.getJob.and.returnValue(of(job()));
    api.retry.and.returnValue(of(1));
    api.translateNext.and.returnValue(of(step('done', 3, [cue(1)])));
    await setup();
    fixture.componentInstance.retry();
    expect(api.translateNext).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.status()).toBe('done');
  });

  it('explains an expired job', async () => {
    api.getJob.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await setup();
    expect(fixture.nativeElement.textContent).toContain('não existe mais');
  });
});
