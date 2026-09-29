import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { UploadComponent } from './upload';
import { SubtitleService } from '../services/subtitle.service';

describe('UploadComponent', () => {
  let fixture: ComponentFixture<UploadComponent>;
  let api: jasmine.SpyObj<SubtitleService>;
  let router: Router;

  const drop = (...files: File[]) => {
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    fixture.componentInstance.onDrop(new DragEvent('drop', { dataTransfer: dt }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<SubtitleService>('SubtitleService', ['createJob']);
    await TestBed.configureTestingModule({
      imports: [UploadComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: SubtitleService, useValue: api }],
    }).compileComponents();
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(UploadComponent);
    fixture.detectChanges();
  });

  it('starts the translation immediately and opens the job page', () => {
    api.createJob.and.returnValue(of({ id: 'job-9' } as any));
    drop(new File(['x'], 'movie.srt'));
    expect(api.createJob).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/translation', 'job-9']);
  });

  it('rejects files that are not .srt without calling the API', () => {
    drop(new File(['x'], 'movie.mkv'));
    expect(api.createJob).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('não é um arquivo .srt');
  });

  it('rejects more than one file', () => {
    drop(new File(['x'], 'a.srt'), new File(['y'], 'b.srt'));
    expect(api.createJob).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('um arquivo por vez');
  });

  it('shows the API error and lets the user try again', () => {
    api.createJob.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'Não encontramos nenhuma legenda válida.' } }))
    );
    drop(new File(['x'], 'bad.srt'));
    expect(fixture.nativeElement.textContent).toContain('Não encontramos nenhuma legenda válida.');
    expect(fixture.componentInstance.uploading()).toBe(false);
  });
});
