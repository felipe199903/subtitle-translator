import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SubtitleService, SubtitleItem } from '../services/subtitle';

@Component({
  selector: 'app-translation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './translation.html',
  styleUrl: './translation.scss'
})
export class TranslationComponent implements OnInit, OnDestroy {
  subtitles: SubtitleItem[] = [];
  originalLanguage = '';
  fileName = '';
  isTranslating = false;
  translationError: string | null = null;
  translationSuccess: string | null = null;
  translatedSrtContent = '';

  // Indicadores de treinamento
  isTrainingActive = false;
  translationProgress: { current: number; total: number; percentage: number } | null = null;

  // Referencias aos elementos de scroll
  @ViewChild('originalList') originalList!: ElementRef<HTMLDivElement>;
  @ViewChild('translatedList') translatedList!: ElementRef<HTMLDivElement>;

  // Controle para evitar loop infinito de scroll
  private isScrollingSynced = false;
  private scrollTimeout: any = null;
  private lastScrollTime = 0;
  private scrollAnimationFrame: number | null = null;
  private scrollEndTimeout: any = null;
  
  // Controle de hover para destaque sincronizado
  hoveredIndex: number | null = null;

  constructor(
    private subtitleService: SubtitleService,
  private router: Router,
  private cdr: ChangeDetectorRef
  ) {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.subtitles = navigation.extras.state['subtitles'] || [];
      this.originalLanguage = navigation.extras.state['originalLanguage'] || '';
      this.fileName = navigation.extras.state['fileName'] || '';
    }
  }

  ngOnInit(): void {
    if (this.subtitles.length === 0) {
      this.router.navigate(['/upload']);
    }

    // Verifica se há um treinamento ativo (simulação)
    this.checkTrainingStatus();
  }

  /**
   * Verifica se há um treinamento ativo no sistema
   */
  private checkTrainingStatus(): void {
    // Verifica se está no browser (não no SSR)
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    // Simula verificação de treinamento ativo
    // Em uma implementação real, isso viria de um serviço que monitora sessões de treinamento
    const trainingData = localStorage.getItem('activeTrainingSession');
    if (trainingData) {
      try {
        const training = JSON.parse(trainingData);
        const now = Date.now();
        const trainingAge = now - training.startTime;
        
        // Se o treinamento foi iniciado há menos de 1 hora, considera ativo
        if (trainingAge < 60 * 60 * 1000) {
          this.isTrainingActive = true;
          console.log('🧠 Treinamento ativo detectado - usando melhorias do dicionário');
        } else {
          // Remove treinamento expirado
          localStorage.removeItem('activeTrainingSession');
        }
      } catch (e) {
        localStorage.removeItem('activeTrainingSession');
      }
    }
  }

  ngOnDestroy(): void {
    // Limpa recursos para evitar memory leaks e conflitos
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame);
      this.scrollAnimationFrame = null;
    }

    if (this.scrollEndTimeout) {
      clearTimeout(this.scrollEndTimeout);
      this.scrollEndTimeout = null;
    }
    
    this.isScrollingSynced = false;
    this.hoveredIndex = null;
  }

  translateSubtitles(): void {
    this.isTranslating = true;
    this.translationError = null;
    this.translationSuccess = null;

    // Inicializa o progresso
    this.translationProgress = {
      current: 0,
      total: this.subtitles.length,
      percentage: 0
    };

    console.log('🔄 Iniciando tradução...');
    if (this.isTrainingActive) {
      console.log('⚡ Usando melhorias do treinamento ativo');
    }

    // Simula progresso da tradução
    this.simulateTranslationProgress();

    this.subtitleService.translateSubtitle(this.subtitles, 'pt-BR').subscribe({
      next: (response) => {
        console.log('✅ Resposta recebida:', response);
        this.isTranslating = false;
        
        if (response.data && response.data.translatedSubtitles) {
          this.subtitles = response.data.translatedSubtitles;
          console.log('📄 Legendas traduzidas:', this.subtitles.length);
        }
        
        if (response.data && response.data.srtContent) {
          this.translatedSrtContent = response.data.srtContent;
          console.log('📝 Conteúdo SRT recebido:', this.translatedSrtContent.length, 'caracteres');
        }

        // Finaliza o progresso
        if (this.translationProgress) {
          this.translationProgress.current = this.subtitles.length;
          this.translationProgress.percentage = 100;
        }

        // Remove o progresso após um breve delay para mostrar 100%
        setTimeout(() => {
          this.translationProgress = null;
          try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
        }, 500);
        
        this.translationSuccess = this.isTrainingActive 
          ? 'Legendas traduzidas com melhorias do treinamento!' 
          : 'Legendas traduzidas com sucesso!';
        
        console.log('🎉 Tradução concluída com sucesso!');
        if (this.isTrainingActive) {
          console.log('⚡ Beneficiado pelas melhorias do treinamento ativo');
        }
        
        // zoneless app: manually trigger change detection so template updates
        try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
      },
      error: (error) => {
        console.error('❌ Erro na tradução:', error);
        this.isTranslating = false;
        this.translationError = error.error?.error || 'Erro ao traduzir legendas';
        this.translationProgress = null;
  try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
      }
    });
  }

  /**
   * Simula o progresso da tradução para feedback visual
   */
  private simulateTranslationProgress(): void {
    if (!this.translationProgress) return;

    const totalSteps = Math.min(this.subtitles.length, 20); // Máximo 20 steps para performance
    const stepDuration = 100; // ms entre cada step
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      if (!this.translationProgress || !this.isTranslating) {
        clearInterval(progressInterval);
        return;
      }

      currentStep++;
      const percentage = Math.min((currentStep / totalSteps) * 90, 90); // Máximo 90% até receber resposta real
      
      this.translationProgress.current = Math.floor((percentage / 100) * this.subtitles.length);
      this.translationProgress.percentage = Math.floor(percentage);

      try { 
        this.cdr.detectChanges(); 
      } catch (e) { 
        /* ignore */ 
      }

      if (currentStep >= totalSteps) {
        clearInterval(progressInterval);
      }
    }, stepDuration);
  }

  downloadTranslatedSRT(): void {
    if (this.translatedSrtContent) {
      const newFileName = this.fileName.replace('.srt', '_pt-br.srt');
      this.subtitleService.downloadSRT(this.translatedSrtContent, newFileName);
    }
  }

  goBack(): void {
    this.router.navigate(['/upload']);
  }

  getLanguageName(code: string): string {
    const languages: { [key: string]: string } = {
      'en': 'Inglês',
      'es': 'Espanhol',
      'fr': 'Francês',
      'de': 'Alemão',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Russo',
      'ja': 'Japonês',
      'ko': 'Coreano',
      'zh': 'Chinês',
      'ar': 'Árabe'
    };
    return languages[code] || code;
  }

  /**
   * Sincroniza o scroll entre as duas listas de legendas com otimizações para performance
   */
  onScroll(event: Event, source: 'original' | 'translated'): void {
    // Evita loop infinito quando o scroll é programático
    if (this.isScrollingSynced) {
      return;
    }

    const currentTime = Date.now();
    
    // Throttling: limita a frequência de execução para evitar tremida
    if (currentTime - this.lastScrollTime < 16) { // ~60fps
      return;
    }
    
    this.lastScrollTime = currentTime;

    // Cancela animações e timeouts anteriores se existirem
    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame);
    }

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    if (this.scrollEndTimeout) {
      clearTimeout(this.scrollEndTimeout);
    }

    const target = event.target as HTMLDivElement;
    
    // Usa requestAnimationFrame para sincronização suave
    this.scrollAnimationFrame = requestAnimationFrame(() => {
      this.performScrollSync(target, source);
    });

    // Detecta quando o scroll termina para reset definitivo
    this.scrollEndTimeout = setTimeout(() => {
      this.isScrollingSynced = false;
    }, 100);
  }

  /**
   * Executa a sincronização de scroll de forma otimizada
   */
  private performScrollSync(target: HTMLDivElement, source: 'original' | 'translated'): void {
    // Evita execução se já estiver sincronizando
    if (this.isScrollingSynced) {
      return;
    }

    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;
    
    // Verifica se há conteúdo para fazer scroll
    if (scrollHeight <= clientHeight) {
      return;
    }

    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

    // Marca que estamos fazendo scroll sincronizado
    this.isScrollingSynced = true;

    // Define qual elemento será sincronizado
    let targetElement: HTMLDivElement;
    
    if (source === 'original' && this.translatedList) {
      targetElement = this.translatedList.nativeElement;
    } else if (source === 'translated' && this.originalList) {
      targetElement = this.originalList.nativeElement;
    } else {
      this.isScrollingSynced = false;
      return;
    }

    // Calcula a nova posição de scroll
    const targetScrollHeight = targetElement.scrollHeight - targetElement.clientHeight;
    
    // Verifica se o elemento alvo tem conteúdo para scroll
    if (targetScrollHeight > 0) {
      const newScrollTop = scrollPercentage * targetScrollHeight;
      
      // Aplica o scroll de forma suave
      targetElement.scrollTo({
        top: newScrollTop,
        behavior: 'auto' // Usa 'auto' para performance, 'smooth' pode causar conflitos
      });
    }

    // Reset do flag de forma mais rápida e eficiente
    this.scrollTimeout = setTimeout(() => {
      this.isScrollingSynced = false;
      this.scrollAnimationFrame = null;
    }, 10); // Reduzido de 50ms para 10ms para responsividade
  }

  /**
   * Define o índice do item em hover para destaque sincronizado
   */
  setHoveredIndex(index: number): void {
    this.hoveredIndex = index;
  }

  /**
   * Limpa o destaque quando o mouse sai do item
   */
  clearHoveredIndex(): void {
    this.hoveredIndex = null;
  }
}
