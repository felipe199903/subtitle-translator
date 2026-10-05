import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { IconComponent } from '../components/icon.component';
import { MAX_FILE_BYTES, SubtitleService, apiErrorMessage } from '../services/subtitle.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class UploadComponent {
  private subtitles = inject(SubtitleService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  dragging = signal(false);
  uploading = signal(false);
  error = signal<string | null>(null);
  fileName = signal<string | null>(null);
  /** The plan limit was hit (HTTP 402): offer the upgrade. */
  upgrade = signal(false);

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
    this.upgrade.set(false);
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
      next: job => {
        this.auth.refresh(); // usage counter
        this.router.navigate(['/translation', job.id]);
      },
      error: err => {
        this.uploading.set(false);
        this.upgrade.set(err instanceof HttpErrorResponse && err.status === 402);
        this.error.set(apiErrorMessage(err, 'Não foi possível enviar o arquivo.'));
      },
    });
  }
}
