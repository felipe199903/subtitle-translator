import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
export class TranslationComponent implements OnInit {
  subtitles: SubtitleItem[] = [];
  originalLanguage = '';
  fileName = '';
  isTranslating = false;
  translationError: string | null = null;
  translationSuccess: string | null = null;
  translatedSrtContent = '';

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
  }

  translateSubtitles(): void {
    this.isTranslating = true;
    this.translationError = null;
    this.translationSuccess = null;

    console.log('🔄 Iniciando tradução...');

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
        
  this.translationSuccess = 'Legendas traduzidas com sucesso!';
  console.log('🎉 Tradução concluída com sucesso!');
  // zoneless app: manually trigger change detection so template updates
  try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
      },
      error: (error) => {
        console.error('❌ Erro na tradução:', error);
        this.isTranslating = false;
        this.translationError = error.error?.error || 'Erro ao traduzir legendas';
  try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
      }
    });
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
}
