import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SubtitleService, SubtitleItem } from '../services/subtitle.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss'
})
export class UploadComponent {
  selectedFile: File | null = null;
  isUploading = false;
  uploadError: string | null = null;
  uploadSuccess: string | null = null;
  mode: 'single' | 'training' = 'single';

  constructor(
    private subtitleService: SubtitleService,
    private router: Router
  ) {}

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.srt')) {
      this.selectedFile = file;
      this.uploadError = null;
    } else {
      this.uploadError = 'Por favor, selecione um arquivo .srt válido';
      this.selectedFile = null;
    }
  }

  setMode(newMode: 'single' | 'training'): void {
    this.mode = newMode;
    this.selectedFile = null;
    this.uploadError = null;
    this.uploadSuccess = null;
  }

  handleFileAction(): void {
    if (this.mode === 'training') {
      this.router.navigate(['/training']);
    } else {
      // Trigger file selection for single mode
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.click();
      }
    }
  }

  onUpload(): void {
    if (!this.selectedFile) {
      this.uploadError = 'Por favor, selecione um arquivo primeiro';
      return;
    }

    this.isUploading = true;
    this.uploadError = null;
    this.uploadSuccess = null;

    this.subtitleService.uploadSubtitle(this.selectedFile).subscribe({
      next: (response) => {
        this.isUploading = false;
        this.uploadSuccess = 'Arquivo enviado com sucesso!';
        
        // Navigate to translation component with data
        this.router.navigate(['/translation'], {
          state: {
            subtitles: response.data.subtitles,
            originalLanguage: response.data.originalLanguage,
            fileName: this.selectedFile?.name
          }
        });
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadError = error.error?.error || 'Erro ao enviar arquivo';
      }
    });
  }
}
