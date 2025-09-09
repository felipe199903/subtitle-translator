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
import { NotificationService } from '../services/notification.service';
import { LoadingService } from '../services/loading.service';
import { LoadingComponent } from '../components/loading/loading.component';
import { interval, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

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
  imports: [CommonModule, FormsModule, LoadingComponent],
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
  batchUploadProgress = { current: 0, total: 0, currentBatch: 0, totalBatches: 0 };
  systemMetrics: any = null;
  isLoadingMetrics = false;
  massiveTrainingStats = { 
    totalSessions: 0, 
    completedSessions: 0, 
    isActive: false,
    estimatedProgress: 0
  };

  private statusSubscription: Subscription | null = null;
  private metricsRefreshSubscription: Subscription | null = null;

  constructor(
    private subtitleService: SubtitleService,
    private router: Router,
    private notificationService: NotificationService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    // Carregar métricas do sistema ao inicializar o componente
    this.loadSystemMetrics();
    
    // Auto-refresh das métricas durante treinamentos massivos
    this.startMetricsAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
    if (this.metricsRefreshSubscription) {
      this.metricsRefreshSubscription.unsubscribe();
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
      this.notificationService.warning('Por favor, selecione pelo menos um arquivo .srt');
      return;
    }

    this.isUploading = true;
    this.currentSession = null;
    this.analysisResult = null;

    console.log(`🎓 Iniciando treino com ${this.selectedFiles.length} arquivos`);
    
    // Se há muitos arquivos, usar upload inteligente em lotes
    if (this.selectedFiles.length > 100) {
      console.log(`📦 Muitos arquivos detectados (${this.selectedFiles.length}). Usando upload em lotes automático...`);
      this.notificationService.info(
        `${this.selectedFiles.length} arquivos serão enviados em lotes automáticos para melhor performance.`,
        'Upload Inteligente'
      );
      this.startBatchUploadWithRetry();
    } else {
      // Upload normal para quantidade menor de arquivos
      this.performSingleUpload(this.selectedFiles);
    }
  }

  private performSingleUpload(files: File[]): void {
    // Create FileList from selected files
    const dataTransfer = new DataTransfer();
    files.forEach(file => {
      dataTransfer.items.add(file);
    });
    
    this.subtitleService.batchUploadForTraining(dataTransfer.files).subscribe({
      next: (response: TrainingUploadResponse) => {
        if (response.success) {
          console.log(`✅ Treino iniciado com sessão: ${response.data.sessionId}`);
          
          // Marca treinamento como ativo para indicadores visuais
          this.markTrainingAsActive(response.data.sessionId);
          
          this.startPollingStatus(response.data.sessionId);
        } else {
          this.notificationService.error('Falha ao iniciar o treinamento');
        }
        this.isUploading = false;
      },
      error: (error) => {
        console.error('❌ Erro ao iniciar treino:', error);
        
        // Verificar se é erro de muitos arquivos
        const errorMessage = error?.error || error?.message || '';
        const errorDetails = error?.details || '';
        
        if (errorMessage.includes('Too many files') || 
            errorMessage.includes('LIMIT_FILE_COUNT') || 
            errorDetails.includes('LIMIT_FILE_COUNT') ||
            error?.errorCode === 'LIMIT_FILE_COUNT') {
          
          console.log(`🔄 Erro de muitos arquivos detectado (${this.selectedFiles.length} arquivos). Tentando upload em lotes automaticamente...`);
          
          // Mostrar mensagem informativa ao usuário
          this.notificationService.info(
            `${this.selectedFiles.length} arquivos detectados. O sistema irá dividir automaticamente em lotes menores.`,
            'Upload Automático'
          );
          
          this.startBatchUploadWithRetry();
        } else {
          const userMessage = error?.suggestion || 'Erro ao iniciar o treino. Tente novamente.';
          this.notificationService.error(userMessage);
          this.isUploading = false;
        }
      }
    });
  }

  private async startBatchUploadWithRetry(): Promise<void> {
    try {
      console.log('📦 Iniciando upload inteligente em lotes...');
      
      // Configurações de lote adaptativas baseadas na quantidade de arquivos
      let BATCH_SIZE = 70; // Tamanho inicial
      
      // Ajustar tamanho do lote baseado na quantidade total
      if (this.selectedFiles.length > 1000) {
        BATCH_SIZE = 40; // Lotes menores para grandes volumes
      } else if (this.selectedFiles.length > 500) {
        BATCH_SIZE = 50;
      }
      
      const DELAY_BETWEEN_BATCHES = 800; // Delay menor para melhor performance
      const MAX_RETRIES_PER_BATCH = 2; // Tentar novamente lotes que falharam
      
      let allSessionIds: string[] = [];
      let totalBatches = Math.ceil(this.selectedFiles.length / BATCH_SIZE);
      let processedFiles = 0;
      
      console.log(`📊 Estratégia: ${totalBatches} lotes de ~${BATCH_SIZE} arquivos cada`);
      
      // Initialize progress tracking
      this.batchUploadProgress = {
        current: 0,
        total: this.selectedFiles.length,
        currentBatch: 0,
        totalBatches: totalBatches
      };
      
      // Dividing files into batches
      for (let i = 0; i < this.selectedFiles.length; i += BATCH_SIZE) {
        const batch = this.selectedFiles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        // Update progress
        this.batchUploadProgress.currentBatch = batchNumber;
        
        console.log(`📤 Enviando lote ${batchNumber}/${totalBatches} com ${batch.length} arquivos... (${processedFiles}/${this.selectedFiles.length} arquivos processados)`);
        
        let batchSuccess = false;
        let retryCount = 0;
        
        // Retry logic for each batch
        while (!batchSuccess && retryCount < MAX_RETRIES_PER_BATCH) {
          try {
            const sessionId = await this.uploadBatch(batch, batchNumber, totalBatches);
            if (sessionId) {
              allSessionIds.push(sessionId);
              processedFiles += batch.length;
              batchSuccess = true;
              
              // Update progress
              this.batchUploadProgress.current = processedFiles;
              
              // Se é o primeiro lote bem-sucedido, marcar como treinamento ativo
              if (allSessionIds.length === 1) {
                this.markTrainingAsActive(sessionId);
              }
              
              console.log(`✅ Lote ${batchNumber} enviado! Progresso: ${Math.round((processedFiles / this.selectedFiles.length) * 100)}%`);
            }
            
          } catch (batchError: any) {
            retryCount++;
            console.error(`❌ Erro no lote ${batchNumber} (tentativa ${retryCount}):`, batchError);
            
            // Se ainda há tentativas disponíveis
            if (retryCount < MAX_RETRIES_PER_BATCH) {
              console.log(`🔄 Tentando novamente lote ${batchNumber} em 2 segundos...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        
        // Se o lote falhou mesmo com tentativas, continuar
        if (!batchSuccess) {
          console.warn(`⚠️ Lote ${batchNumber} foi pulado após ${MAX_RETRIES_PER_BATCH} tentativas`);
        }
        
        // Delay entre lotes para não sobrecarregar o servidor
        if (i + BATCH_SIZE < this.selectedFiles.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      // Results summary
      if (allSessionIds.length > 0) {
        const successRate = Math.round((allSessionIds.length / totalBatches) * 100);
        console.log(`🎉 Upload em lotes concluído! ${allSessionIds.length}/${totalBatches} lotes enviados (${successRate}% de sucesso)`);
        console.log(`📈 Total de arquivos processados: ${processedFiles}/${this.selectedFiles.length}`);
        
        // Configurar stats do treinamento massivo
        this.massiveTrainingStats = {
          totalSessions: allSessionIds.length,
          completedSessions: 0,
          isActive: true,
          estimatedProgress: 0
        };

        // Iniciar monitoramento de múltiplas sessões
        this.startMassiveTrainingMonitoring(allSessionIds);
        
        // Usar a primeira sessão para monitoramento da interface
        this.startPollingStatus(allSessionIds[0]);
        
        if (allSessionIds.length < totalBatches) {
          this.notificationService.customSuccess(
            `Sucesso: ${allSessionIds.length}/${totalBatches} lotes (${successRate}%). Arquivos processados: ${processedFiles}/${this.selectedFiles.length}. O treinamento iniciará com os arquivos enviados.`,
            'Upload Concluído',
            8000
          );
        } else {
          this.notificationService.customSuccess(
            `${this.selectedFiles.length} arquivos enviados em ${totalBatches} lotes. Treinamento iniciado!`,
            '🎉 Todos os lotes enviados',
            8000
          );
        }
      } else {
        throw new Error('Nenhum lote foi enviado com sucesso');
      }
      
      this.isUploading = false;
      
    } catch (error) {
      console.error('❌ Erro no upload em lotes:', error);
      this.notificationService.customError(
        `Erro no upload: ${error}. Sugestões: Tente com menos arquivos, verifique sua conexão ou tente novamente em alguns minutos.`,
        'Erro no Upload',
        10000
      );
      this.isUploading = false;
    }
  }

  private uploadBatch(files: File[], batchNumber: number, totalBatches: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const dataTransfer = new DataTransfer();
      files.forEach(file => {
        dataTransfer.items.add(file);
      });
      
      this.subtitleService.batchUploadForTraining(dataTransfer.files).subscribe({
        next: (response: TrainingUploadResponse) => {
          if (response.success) {
            console.log(`✅ Lote ${batchNumber}/${totalBatches} enviado com sucesso: ${response.data.sessionId}`);
            resolve(response.data.sessionId);
          } else {
            console.error(`❌ Lote ${batchNumber} falhou:`, response);
            reject(new Error(`Lote ${batchNumber} falhou`));
          }
        },
        error: (error) => {
          console.error(`❌ Erro no lote ${batchNumber}:`, error);
          reject(error);
        }
      });
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
                this.stopMetricsAutoRefresh();
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
    this.loadingService.show('analysis', 'Analisando resultados do treinamento...');
    
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
          this.notificationService.error('Erro ao analisar resultados.');
        }
        this.isAnalyzing = false;
        this.loadingService.hide('analysis');
      },
      error: (error) => {
        console.error('❌ Erro na análise:', error);
        this.notificationService.error('Erro ao analisar resultados.');
        this.isAnalyzing = false;
        this.loadingService.hide('analysis');
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
      this.notificationService.warning('Selecione pelo menos uma frase para adicionar ao dicionário.');
      return;
    }

    this.isImprovingDict = true;
    this.loadingService.show('dictionary', 'Melhorando dicionário...');
    
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
          this.notificationService.customSuccess(
            response.data.summary,
            '✅ Dicionário Melhorado!',
            6000
          );
          
          if (!autoApprove) {
            this.selectedPhrases = [];
          }
        } else {
          this.notificationService.error('Erro ao melhorar o dicionário.');
        }
        this.isImprovingDict = false;
        this.loadingService.hide('dictionary');
      },
      error: (error) => {
        console.error('❌ Erro ao melhorar dicionário:', error);
        this.notificationService.error('Erro ao melhorar o dicionário.');
        this.isImprovingDict = false;
        this.loadingService.hide('dictionary');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/upload']);
  }

  getProgressPercentage(): number {
    return this.currentSession?.progress || 0;
  }

  getBatchUploadProgress(): number {
    if (this.batchUploadProgress.total === 0) return 0;
    return Math.round((this.batchUploadProgress.current / this.batchUploadProgress.total) * 100);
  }

  isBatchUploading(): boolean {
    return this.isUploading && this.batchUploadProgress.totalBatches > 1;
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
    
    // Recarregar métricas após treinamento concluído
    setTimeout(() => {
      this.loadSystemMetrics();
    }, 2000);
  }

  /**
   * Carrega as métricas do sistema para mostrar impacto do treinamento
   */
  loadSystemMetrics(): void {
    this.isLoadingMetrics = true;
    this.loadingService.show('metrics', 'Carregando métricas do sistema...');
    
    this.subtitleService.getSystemMetrics().subscribe({
      next: (response) => {
        if (response.success) {
          this.systemMetrics = response.data;
          console.log('📊 Métricas do sistema carregadas:', this.systemMetrics);
        }
        this.isLoadingMetrics = false;
        this.loadingService.hide('metrics');
      },
      error: (error) => {
        console.error('❌ Erro ao carregar métricas do sistema:', error);
        this.notificationService.error('Erro ao carregar métricas do sistema');
        this.isLoadingMetrics = false;
        this.loadingService.hide('metrics');
      }
    });
  }

  /**
   * Força atualização das métricas
   */
  refreshSystemMetrics(): void {
    console.log('🔄 Atualizando métricas do sistema...');
    this.loadSystemMetrics();
  }

  /**
   * Retorna cor baseada na saúde do sistema
   */
  getSystemHealthColor(status: string): string {
    switch (status) {
      case 'healthy': return '#28a745';
      case 'trained': return '#28a745'; 
      case 'needs_data': return '#ffc107';
      case 'needs_expansion': return '#ffc107';
      case 'not_trained': return '#dc3545';
      default: return '#6c757d';
    }
  }

  /**
   * Retorna texto amigável para status de saúde do sistema
   */
  getSystemHealthText(component: string, status: string): string {
    const texts: Record<string, Record<string, string>> = {
      tmDatabase: {
        healthy: 'Banco TM Saudável',
        needs_data: 'Precisa Mais Dados'
      },
      dictionary: {
        healthy: 'Dicionário Completo',
        needs_expansion: 'Precisa Expansão'
      },
      trainingData: {
        trained: 'Sistema Treinado',
        not_trained: 'Não Treinado'
      }
    };
    
    return texts[component]?.[status] || status;
  }

  /**
   * Inicia auto-refresh das métricas durante treinamentos em massa
   */
  private startMetricsAutoRefresh(): void {
    // Verificar se há treinamento ativo
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const activeTraining = localStorage.getItem('activeTrainingSession');
      
      if (activeTraining) {
        console.log('🔄 Treinamento ativo detectado - iniciando auto-refresh de métricas');
        
        // Atualizar métricas a cada 10 segundos durante treinamentos
        this.metricsRefreshSubscription = interval(10000).subscribe(() => {
          this.loadSystemMetrics();
        });
      }
    }
  }

  /**
   * Para o auto-refresh das métricas
   */
  private stopMetricsAutoRefresh(): void {
    if (this.metricsRefreshSubscription) {
      this.metricsRefreshSubscription.unsubscribe();
      this.metricsRefreshSubscription = null;
      console.log('⏹️ Auto-refresh de métricas parado');
    }
  }

  /**
   * Monitora o progresso de múltiplas sessões de treinamento
   */
  private startMassiveTrainingMonitoring(sessionIds: string[]): void {
    console.log(`📊 Iniciando monitoramento de ${sessionIds.length} sessões de treinamento massivo`);
    
    // Verificar progresso de todas as sessões a cada 5 segundos
    const monitoringInterval = setInterval(() => {
      this.checkMassiveTrainingProgress(sessionIds, monitoringInterval);
    }, 5000);
  }

  /**
   * Verifica o progresso de todas as sessões de treinamento
   */
  private async checkMassiveTrainingProgress(sessionIds: string[], intervalId: any): Promise<void> {
    let completedCount = 0;
    let totalProgress = 0;

    // Verificar algumas sessões aleatórias (não todas para não sobrecarregar)
    const samplesToCheck = Math.min(sessionIds.length, 5);
    const sampleSessions = sessionIds.slice(0, samplesToCheck);

    for (const sessionId of sampleSessions) {
      try {
        const response = await fetch(`${environment.apiUrl}/training-status/${sessionId}`);
        const result = await response.json();
        
        if (result.success) {
          const status = result.data.summary.status;
          const progress = result.data.summary.progress;
          
          if (status === 'completed') {
            completedCount++;
          }
          totalProgress += progress;
        }
      } catch (error) {
        console.warn(`Erro ao verificar sessão ${sessionId}:`, error);
      }
    }

    // Estimar progresso total baseado na amostra
    const avgProgress = totalProgress / sampleSessions.length;
    this.massiveTrainingStats.estimatedProgress = Math.round(avgProgress);
    this.massiveTrainingStats.completedSessions = Math.round(
      (completedCount / sampleSessions.length) * sessionIds.length
    );

    console.log(`📊 Progresso estimado: ${this.massiveTrainingStats.estimatedProgress}%, Sessões completas: ${this.massiveTrainingStats.completedSessions}/${sessionIds.length}`);

    // Se todas as sessões da amostra estão completas, assumir que todas estão
    if (completedCount === sampleSessions.length) {
      this.massiveTrainingStats.isActive = false;
      this.massiveTrainingStats.completedSessions = sessionIds.length;
      this.massiveTrainingStats.estimatedProgress = 100;
      
      clearInterval(intervalId);
      console.log('🎉 Treinamento massivo concluído! Atualizando métricas finais...');
      
      // Atualizar métricas finais após um delay
      setTimeout(() => {
        this.loadSystemMetrics();
      }, 3000);
    }
  }

  /**
   * Verifica se há treinamento massivo ativo
   */
  isMassiveTrainingActive(): boolean {
    return this.massiveTrainingStats.isActive;
  }

  /**
   * Retorna progresso do treinamento massivo
   */
  getMassiveTrainingProgress(): number {
    return this.massiveTrainingStats.estimatedProgress;
  }
}
