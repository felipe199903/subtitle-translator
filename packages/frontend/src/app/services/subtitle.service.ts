import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SubtitleItem {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
  translatedText?: string;
}

export interface UploadResponse {
  success: boolean;
  data: {
    originalLanguage: string;
    subtitles: SubtitleItem[];
    totalSubtitles: number;
  };
}

export interface TranslationResponse {
  success: boolean;
  data: {
    translatedSubtitles: SubtitleItem[];
    srtContent: string;
    targetLanguage: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SubtitleService {
  private apiUrl = environment.apiUrl || 'http://localhost:3001/api/subtitles';

  constructor(private http: HttpClient) {}

  uploadSubtitle(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('srtFile', file);

    return this.http.post<UploadResponse>(`${this.apiUrl}/upload`, formData);
  }

  translateSubtitle(subtitles: SubtitleItem[], targetLanguage: string = 'pt-BR'): Observable<TranslationResponse> {
    const body = {
      subtitles,
      targetLanguage
    };

    return this.http.post<TranslationResponse>(`${this.apiUrl}/translate-text`, body);
  }

  getSupportedLanguages(): Observable<any> {
    return this.http.get(`${this.apiUrl}/languages`);
  }

  downloadSRT(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
