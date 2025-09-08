import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  SubtitleService,
  TrainingUploadResponse,
  TrainingProgressResponse,
  AnalysisResponse,
  ImprovementResponse
} from '../services/subtitle.service';
import { interval, Subscription } from 'rxjs';

interface TrainingSession {
  sessionId: string;
  totalFiles: number;
  processedFiles: number;
  status: 'processing' | 'completed' | 'error';
  progress: number;
  totalSubtitles: number;
  totalTranslated: number;
  totalUniquePhrases: number;
  translationStats: {
    tmHits: number;
    dictHits: number;
    apiTranslations: number;
    skipped: number;
  };
  error?: string;
  duration: number;
}

interface AnalysisResult {
  totalFiles: number;
  totalUniquePhrases: number;
  dictionaryCandidates: Array<{
    original: string;
    frequency: number;
    translations: string[];
    mostCommon: string;
  }>;
  languageDistribution: Record<string, number>;
  averageTranslationRate: number;
  recommendations: string[];
}

@Component({
  selector: 'app-training',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './training.html',
  styleUrl: './training.scss'
})
export class TrainingComponent implements OnInit, OnDestroy {
  selectedFiles: File[] = [];
  currentSession: TrainingSession | null = null;
  isUploading = false;
  analysisResult: AnalysisResult | null = null;
  isAnalyzing = false;
  selectedPhrases: Array<{ original: string; translation: string }> = [];
  isImprovingDict = false;

  private statusSubscription: Subscription | null = null;

  constructor(
    private subtitleService: SubtitleService,
    private router: Router
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles = Array.from(input.files).filter(file => 
        file.name.endsWith('.srt')
      );
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  clearFiles(): void {
    this.selectedFiles = [];
  }

  startTraining(): void {
    if (this.selectedFiles.length === 0) {
      alert('Por favor, selecione pelo menos um arquivo .srt');
      return;
    }

    this.isUploading = true;
    this.currentSession = null;
    this.analysisResult = null;

    // Create FileList from selected files
    const dataTransfer = new DataTransfer();
    this.selectedFiles.forEach(file => {
      dataTransfer.items.add(file);
    });

    console.log(`🎓 Iniciando treino com ${this.selectedFiles.length} arquivos`);
    
    this.subtitleService.batchUploadForTraining(dataTransfer.files).subscribe({
      next: (response: TrainingUploadResponse) => {
        if (response.success) {
          console.log(`✅ Treino iniciado com sessão: ${response.data.sessionId}`);
          
          // Marca treinamento como ativo para indicadores visuais
          this.markTrainingAsActive(response.data.sessionId);
          
          this.startPollingStatus(response.data.sessionId);
        } else {
          alert('Falha ao iniciar o treinamento');
        }
        this.isUploading = false;
      },
      error: (error) => {
        console.error('❌ Erro ao iniciar treino:', error);
        alert('Erro ao iniciar o treino. Tente novamente.');
        this.isUploading = false;
      }
    });
  }

  private startPollingStatus(sessionId: string): void {
    this.statusSubscription = interval(2000).subscribe(() => {
      this.subtitleService.getTrainingStatus(sessionId).subscribe({
        next: (response: TrainingProgressResponse) => {
          if (response.success) {
            // Map the API response to our interface
            this.currentSession = {
              sessionId: response.data.sessionId,
              totalFiles: response.data.totalFiles,
              processedFiles: response.data.processedFiles,
              status: response.data.status as 'processing' | 'completed' | 'error',
              progress: Math.round((response.data.processedFiles / response.data.totalFiles) * 100),
              totalSubtitles: response.data.detailedStats?.totalSubtitles || 0,
              totalTranslated: (response.data.detailedStats?.translatedFromTM || 0) + 
                             (response.data.detailedStats?.translatedFromDict || 0) + 
                             (response.data.detailedStats?.translatedFromAPI || 0),
              totalUniquePhrases: 0, // Will be calculated during analysis
              translationStats: {
                tmHits: response.data.detailedStats?.translatedFromTM || 0,
                dictHits: response.data.detailedStats?.translatedFromDict || 0,
                apiTranslations: response.data.detailedStats?.translatedFromAPI || 0,
                skipped: response.data.detailedStats?.skippedSubtitles || 0
              },
              duration: 0 // Will be calculated
            };

            if (this.currentSession.status === 'completed' || this.currentSession.status === 'error') {
              this.statusSubscription?.unsubscribe();
              console.log(`🎉 Treino concluído: ${this.currentSession.status}`);
              
              // Remove a marca de treinamento ativo após um delay para permitir que usuários vejam os resultados
              setTimeout(() => {
                this.markTrainingAsCompleted();
              }, 30000); // 30 segundos de delay
            }
          }
        },
        error: (error) => {
          console.error('❌ Erro ao verificar status:', error);
        }
      });
    });
  }

  analyzeResults(): void {
    if (!this.currentSession?.sessionId) return;

    this.isAnalyzing = true;
    
    this.subtitleService.analyzeTrainingResults(this.currentSession.sessionId).subscribe({
      next: (response: AnalysisResponse) => {
        if (response.success) {
          // Map the API response to our interface
          this.analysisResult = {
            totalFiles: response.data.summary.totalFiles,
            totalUniquePhrases: response.data.summary.uniquePhrases,
            dictionaryCandidates: response.data.dictionaryCandidates.map(candidate => ({
              original: candidate.originalPhrase,
              frequency: candidate.frequency,
              translations: [candidate.translatedPhrase], // Simplified for this interface
              mostCommon: candidate.translatedPhrase
            })),
            languageDistribution: response.data.summary.languageDistribution,
            averageTranslationRate: 0, // Could be calculated if needed
            recommendations: response.data.summary.recommendations
          };
          
          console.log(`📊 Análise concluída: ${this.analysisResult.dictionaryCandidates.length} candidatos encontrados`);
        } else {
          alert('Erro ao analisar resultados.');
        }
        this.isAnalyzing = false;
      },
      error: (error) => {
        console.error('❌ Erro na análise:', error);
        alert('Erro ao analisar resultados.');
        this.isAnalyzing = false;
      }
    });
  }

  togglePhraseSelection(phrase: any): void {
    const index = this.selectedPhrases.findIndex(p => 
      p.original === phrase.original && p.translation === phrase.mostCommon
    );

    if (index >= 0) {
      this.selectedPhrases.splice(index, 1);
    } else {
      this.selectedPhrases.push({
        original: phrase.original,
        translation: phrase.mostCommon
      });
    }
  }

  isPhraseSelected(phrase: any): boolean {
    return this.selectedPhrases.some(p => 
      p.original === phrase.original && p.translation === phrase.mostCommon
    );
  }

  selectAllHighFrequency(): void {
    if (!this.analysisResult) return;

    this.selectedPhrases = this.analysisResult.dictionaryCandidates
      .filter(phrase => phrase.frequency >= 3)
      .map(phrase => ({
        original: phrase.original,
        translation: phrase.mostCommon
      }));
  }

  clearSelection(): void {
    this.selectedPhrases = [];
  }

  improveDictionary(autoApprove = false): void {
    if (!this.currentSession?.sessionId && !autoApprove) return;
    
    if (!autoApprove && this.selectedPhrases.length === 0) {
      alert('Selecione pelo menos uma frase para adicionar ao dicionário.');
      return;
    }

    this.isImprovingDict = true;
    
    // Convert selectedPhrases to the format expected by the service
    const selectedCandidates = this.selectedPhrases.map(phrase => ({
      originalPhrase: phrase.original,
      translatedPhrase: phrase.translation,
      frequency: 1 // Default frequency since we don't track it in the UI
    }));

    this.subtitleService.improveDictionaryFromResults(
      this.currentSession?.sessionId || '',
      selectedCandidates
    ).subscribe({
      next: (response: ImprovementResponse) => {
        if (response.success) {
          alert(`✅ Dicionário melhorado!\n${response.data.summary}`);
          
          if (!autoApprove) {
            this.selectedPhrases = [];
          }
        } else {
          alert('Erro ao melhorar o dicionário.');
        }
        this.isImprovingDict = false;
      },
      error: (error) => {
        console.error('❌ Erro ao melhorar dicionário:', error);
        alert('Erro ao melhorar o dicionário.');
        this.isImprovingDict = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/upload']);
  }

  getProgressPercentage(): number {
    return this.currentSession?.progress || 0;
  }

  getStatusColor(): string {
    if (!this.currentSession) return '#6c757d';
    
    switch (this.currentSession.status) {
      case 'processing': return '#007bff';
      case 'completed': return '#28a745';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }

  getLanguageNames(): string[] {
    if (!this.analysisResult) return [];
    return Object.keys(this.analysisResult.languageDistribution);
  }

  /**
   * Marca o treinamento como ativo no localStorage para que outros componentes possam detectar
   */
  private markTrainingAsActive(sessionId: string): void {
    // Verifica se está no browser
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const trainingData = {
      sessionId,
      startTime: Date.now(),
      status: 'active'
    };
    
    localStorage.setItem('activeTrainingSession', JSON.stringify(trainingData));
    console.log('🧠 Treinamento marcado como ativo para indicadores visuais');
  }

  /**
   * Remove a marca de treinamento ativo
   */
  private markTrainingAsCompleted(): void {
    // Verifica se está no browser
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem('activeTrainingSession');
    console.log('✅ Treinamento marcado como concluído');
  }
}
