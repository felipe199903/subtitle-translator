import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { MAX_FILE_BYTES, SubtitleService, apiErrorMessage } from '../services/subtitle.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class UploadComponent {
  private subtitles = inject(SubtitleService);
  private router = inject(Router);

  dragging = signal(false);
  uploading = signal(false);
  error = signal<string | null>(null);
  fileName = signal<string | null>(null);

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again after an error
    if (file) this.start(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.uploading()) this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    // Ignore leave events fired when moving over child elements.
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.uploading()) return;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length > 1) {
      this.error.set('Envie um arquivo por vez.');
      return;
    }
    this.start(files[0]);
  }

  private start(file: File): void {
    this.error.set(null);
    if (!file.name.toLowerCase().endsWith('.srt')) {
      this.error.set(`"${file.name}" não é um arquivo .srt.`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.error.set('Arquivo muito grande. O limite é 4 MB.');
      return;
    }
    if (file.size === 0) {
      this.error.set('O arquivo está vazio.');
      return;
    }

    this.fileName.set(file.name);
    this.uploading.set(true);
    this.subtitles.createJob(file).subscribe({
      next: job => this.router.navigate(['/translation', job.id]),
      error: err => {
        this.uploading.set(false);
        this.error.set(apiErrorMessage(err, 'Não foi possível enviar o arquivo.'));
      },
    });
  }
}
