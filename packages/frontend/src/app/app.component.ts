import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { IconComponent } from './components/icon.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, IconComponent],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/" class="brand" aria-label="Tradutor de Legendas, página inicial">
          <img src="favicon.svg" alt="" width="28" height="28" />
          <span class="brand-name">Tradutor de Legendas</span>
          <span class="badge brand-pair">EN → PT-BR</span>
        </a>
        <button
          type="button"
          class="btn ghost icon"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.mode() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'"
          [title]="theme.mode() === 'dark' ? 'Tema claro' : 'Tema escuro'"
        >
          <app-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" />
        </button>
      </div>
    </header>

    <main class="page">
      <router-outlet />
    </main>

    <footer class="footer">Tradução automática · revise antes de publicar</footer>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        height: var(--topbar-h);
        background: color-mix(in srgb, var(--bg) 82%, transparent);
        backdrop-filter: saturate(180%) blur(10px);
        border-bottom: 1px solid var(--border);
      }
      .topbar-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        max-width: 1100px;
        height: 100%;
        margin: 0 auto;
        padding: 0 1.25rem;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--text);
        text-decoration: none;
        border-radius: var(--radius-sm);
      }
      .brand img {
        border-radius: 7px;
      }
      .brand-name {
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .page {
        flex: 1;
        width: 100%;
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.25rem 3rem;
      }
      .footer {
        padding: 1.25rem;
        border-top: 1px solid var(--border);
        color: var(--text-subtle);
        font-size: 0.8rem;
        text-align: center;
      }
      @media (max-width: 560px) {
        .brand-pair {
          display: none;
        }
        .page {
          padding: 1.25rem 1rem 2rem;
        }
        .topbar-inner {
          padding: 0 1rem;
        }
      }
    `,
  ],
})
export class AppComponent {
  protected theme = inject(ThemeService);
}
