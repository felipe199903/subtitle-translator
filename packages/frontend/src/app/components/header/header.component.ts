import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatToolbarModule, MatIconModule],
  template: `
    <mat-toolbar color="primary">
      <mat-icon>translate</mat-icon>
      <span class="title">Subtitle Translator</span>
      <span class="spacer"></span>
      <span class="subtitle">Traduza suas legendas para Português</span>
    </mat-toolbar>
  `,
  styles: [`
    .title {
      margin-left: 10px;
      font-size: 24px;
      font-weight: 500;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .subtitle {
      font-size: 14px;
      opacity: 0.8;
    }
  `]
})
export class HeaderComponent { }
