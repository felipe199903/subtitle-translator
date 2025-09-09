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

// Training-related interfaces
export interface TrainingUploadResponse {
  success: boolean;
  data: {
    sessionId: string;
    totalFiles: number;
    status: string;
  };
}

export interface TrainingProgressResponse {
  success: boolean;
  data: {
    sessionId: string;
    status: string;
    totalFiles: number;
    processedFiles: number;
    currentFile: string;
    detailedStats?: {
      totalSubtitles: number;
      translatedFromTM: number;
      translatedFromDict: number;
      translatedFromAPI: number;
      skippedSubtitles: number;
      uniqueLanguages: string[];
      translationBreakdown: Array<{
        method: string;
        count: number;
      }>;
    };
  };
}

export interface AnalysisResponse {
  success: boolean;
  data: {
    sessionId: string;
    summary: {
      totalFiles: number;
      totalSubtitles: number;
      uniquePhrases: number;
      languageDistribution: { [key: string]: number };
      recommendations: string[];
    };
    dictionaryCandidates: Array<{
      originalPhrase: string;
      translatedPhrase: string;
      frequency: number;
      confidence: number;
      sourceFiles: string[];
    }>;
  };
}

export interface ImprovementResponse {
  success: boolean;
  data: {
    appliedEntries: number;
    skippedEntries: number;
    newDictionarySize: number;
    newTMEntries: number;
    summary: string;
  };
}

export interface SystemMetricsResponse {
  success: boolean;
  data: {
    timestamp: string;
    translationMemory: {
      totalEntries: number;
      recentEntries: number;
      highConfidenceEntries: number;
    };
    dictionary: {
      totalPhrases: number;
      phrasesByLength: {
        single: number;
        multi: number;
      };
    };
    training: {
      totalSessions: number;
      totalFilesProcessed: number;
      totalPhrasesLearned: number;
      lastTrainingDate: string | null;
    };
    performance: {
      tmIndexSize: number;
      averageTranslationMethods: {
        tmHitRate: string;
        dictHitRate: string;
        apiUsageRate: string;
        skipRate: string;
      } | null;
    };
    systemHealth: {
      tmDatabase: 'healthy' | 'needs_data';
      dictionary: 'healthy' | 'needs_expansion';
      trainingData: 'trained' | 'not_trained';
    };
    recommendations: string[];
  };
}

export interface TrainingComparisonResponse {
  success: boolean;
  data: {
    before: {
      totalSubtitles: number;
      tmHitRate: number;
      dictHitRate: number;
      apiUsageRate: number;
      skipRate: number;
    };
    after: {
      totalSubtitles: number;
      tmHitRate: number;
      dictHitRate: number;
      apiUsageRate: number;
      skipRate: number;
    };
    improvement: {
      tmHitRateImprovement: number;
      dictHitRateImprovement: number;
      apiUsageReduction: number;
      overallImprovement: number;
    };
    summary: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SubtitleService {
  private apiUrl = environment.apiUrl;

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

  // Training Methods
  batchUploadForTraining(files: FileList): Observable<TrainingUploadResponse> {
    const formData = new FormData();
    
    // Add all selected files to FormData
    for (let i = 0; i < files.length; i++) {
      formData.append('srtFiles', files[i]);
    }

    return this.http.post<TrainingUploadResponse>(`${this.apiUrl}/batch-upload`, formData);
  }

  getTrainingStatus(sessionId: string): Observable<TrainingProgressResponse> {
    return this.http.get<TrainingProgressResponse>(`${this.apiUrl}/training-status/${sessionId}`);
  }

  analyzeTrainingResults(sessionId: string): Observable<AnalysisResponse> {
    return this.http.post<AnalysisResponse>(`${this.apiUrl}/analyze-training`, { sessionId });
  }

  improveDictionaryFromResults(
    sessionId: string, 
    selectedCandidates: Array<{
      originalPhrase: string;
      translatedPhrase: string;
      frequency: number;
    }>
  ): Observable<ImprovementResponse> {
    return this.http.post<ImprovementResponse>(`${this.apiUrl}/improve-dictionary`, {
      sessionId,
      selectedCandidates
    });
  }

  getSystemMetrics(): Observable<SystemMetricsResponse> {
    return this.http.get<SystemMetricsResponse>(`${this.apiUrl}/system-metrics`);
  }

  compareTrainingImpact(beforeSessionId: string, afterSessionId: string): Observable<TrainingComparisonResponse> {
    return this.http.post<TrainingComparisonResponse>(`${this.apiUrl}/compare-training-impact`, {
      beforeSessionId,
      afterSessionId
    });
  }
}
