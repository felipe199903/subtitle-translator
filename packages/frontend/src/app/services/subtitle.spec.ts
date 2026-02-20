import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SubtitleService, SubtitleItem } from './subtitle';
import { environment } from '../../environments/environment';

describe('SubtitleService', () => {
  let service: SubtitleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SubtitleService, provideZonelessChangeDetection()],
    });
    service = TestBed.inject(SubtitleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('uploadSubtitle', () => {
    it('should send a POST request with the file', () => {
      const mockFile = new File(['1\n00:00:01,000 --> 00:00:02,000\nHello\n'], 'test.srt', {
        type: 'text/plain',
      });
      const mockResponse = {
        success: true,
        data: { originalLanguage: 'en', subtitles: [], totalSubtitles: 0 },
      };

      service.uploadSubtitle(mockFile).subscribe((response) => {
        expect(response.success).toBe(true);
        expect(response.data.originalLanguage).toBe('en');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/upload`);
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });
  });

  describe('translateSubtitle', () => {
    it('should send a POST request with subtitles and target language', () => {
      const subtitles: SubtitleItem[] = [
        { index: 1, startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'Hello' },
      ];
      const mockResponse = {
        success: true,
        data: {
          translatedSubtitles: [{ ...subtitles[0], translatedText: 'Olá' }],
          srtContent: '1\n00:00:01,000 --> 00:00:02,000\nOlá\n',
          targetLanguage: 'pt-BR',
        },
      };

      service.translateSubtitle(subtitles, 'pt-BR').subscribe((response) => {
        expect(response.success).toBe(true);
        expect(response.data.targetLanguage).toBe('pt-BR');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/translate-text`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ subtitles, targetLanguage: 'pt-BR' });
      req.flush(mockResponse);
    });

    it('should default to pt-BR as target language', () => {
      const subtitles: SubtitleItem[] = [
        { index: 1, startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'Hello' },
      ];
      const mockResponse = {
        success: true,
        data: { translatedSubtitles: [], srtContent: '', targetLanguage: 'pt-BR' },
      };

      service.translateSubtitle(subtitles).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/translate-text`);
      expect(req.request.body.targetLanguage).toBe('pt-BR');
      req.flush(mockResponse);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should send a GET request to the languages endpoint', () => {
      const mockResponse = { success: true, data: { languages: ['pt-BR', 'en'] } };

      service.getSupportedLanguages().subscribe((response: any) => {
        expect(response.success).toBe(true);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/languages`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });
});
