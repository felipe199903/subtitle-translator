import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SubtitleService, apiErrorMessage } from './subtitle.service';
import { environment } from '../../environments/environment';

describe('SubtitleService', () => {
  let service: SubtitleService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SubtitleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads the file as multipart "file" and unwraps the job', () => {
    const file = new File(['1\n00:00:01,000 --> 00:00:02,000\nHi\n'], 'a.srt');
    let id = '';
    service.createJob(file).subscribe(job => (id = job.id));

    const req = http.expectOne(`${api}/jobs`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('file')).toBeTruthy();
    req.flush({ data: { id: 'job-1', cues: [] } });
    expect(id).toBe('job-1');
  });

  it('loads a job and asks for the next translation batch', () => {
    service.getJob('job-1').subscribe();
    http.expectOne(`${api}/jobs/job-1`).flush({ data: { id: 'job-1', cues: [] } });

    let status = '';
    service.translateNext('job-1').subscribe(step => (status = step.status));
    const req = http.expectOne(`${api}/jobs/job-1/translate`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { status: 'done', progress: { done: 1, total: 1 }, cues: [] } });
    expect(status).toBe('done');
  });

  it('talks to the API on the same origin', () => {
    expect(api).toBe('/api/subtitles');
  });

  it('sends edits with PATCH to the cue position', () => {
    let saved = '';
    service.editCue('job-1', 3, 'Olá').subscribe(cue => (saved = cue.translation!));
    const req = http.expectOne(`${api}/jobs/job-1/cues/3`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ translation: 'Olá' });
    req.flush({ data: { cue: { translation: 'Olá' } } });
    expect(saved).toBe('Olá');
  });

  it('builds the download URL', () => {
    expect(service.downloadUrl('job-1')).toBe(`${api}/jobs/job-1/download`);
  });
});

describe('apiErrorMessage', () => {
  it('uses the API message when present', () => {
    const err = new HttpErrorResponse({ status: 400, error: { error: 'Arquivo inválido.' } });
    expect(apiErrorMessage(err)).toBe('Arquivo inválido.');
  });

  it('explains when the server is unreachable', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 0 }))).toContain('servidor');
  });

  it('falls back to the given message', () => {
    expect(apiErrorMessage(new Error('x'), 'Falhou')).toBe('Falhou');
  });
});
