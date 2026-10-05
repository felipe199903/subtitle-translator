import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SeoService } from './services/seo.service';
import { IconComponent } from './components/icon.component';
import { ThemeService } from './services/theme.service';
import { AuthService } from './services/auth.service';
import { COMPANY } from './legal/company';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/" class="brand" aria-label="Tradutor de Legendas, página inicial">
          <img src="favicon.svg" alt="" width="28" height="28" />
          <span class="brand-name">Tradutor de Legendas</span>
          <span class="badge brand-pair">EN → PT-BR</span>
        </a>
        <nav class="nav">
          <a routerLink="/precos" routerLinkActive="active" class="btn ghost sm">Preços</a>
          @if (auth.me(); as me) {
            <a routerLink="/app" routerLinkActive="active" class="btn ghost sm nav-app">Traduzir</a>
            <a routerLink="/conta" routerLinkActive="active" class="btn sm account" [title]="me.email">
              {{ me.plan === 'pro' ? 'Pro' : 'Minha conta' }}
            </a>
          } @else if (auth.loaded()) {
            <a routerLink="/entrar" class="btn primary sm">Entrar</a>
          }
          <button
            type="button"
            class="btn ghost icon"
            (click)="theme.toggle()"
            [attr.aria-label]="theme.mode() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'"
            [title]="theme.mode() === 'dark' ? 'Tema claro' : 'Tema escuro'"
          >
            <app-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" />
          </button>
        </nav>
      </div>
    </header>

    <main class="page">
      <router-outlet />
    </main>

    <footer class="footer">
      <span>Tradução automática · revise antes de publicar</span>
      <nav>
        <a routerLink="/precos">Preços</a>
        <a routerLink="/traduzir-legenda-srt">Traduzir .srt</a>
        <a routerLink="/legendas-plex-jellyfin-kodi">Plex, Jellyfin e Kodi</a>
        <a routerLink="/corrigir-acentos-legenda">Acentos na legenda</a>
        <a routerLink="/termos">Termos de Uso</a>
        <a routerLink="/privacidade">Privacidade</a>
        <a [href]="'mailto:' + company.email">{{ company.email }}</a>
      </nav>
    </footer>
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
      .nav {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .nav a.active {
        color: var(--accent-text);
      }
      .footer {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem 1.5rem;
        padding: 1.25rem;
        border-top: 1px solid var(--border);
        color: var(--text-subtle);
        font-size: 0.8rem;
        text-align: center;
      }
      .footer nav {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.4rem 1rem;
      }
      .footer a {
        color: var(--text-subtle);
      }
      .footer a:hover {
        color: var(--text);
      }
      @media (max-width: 560px) {
        .brand-pair,
        .brand-name,
        .nav-app {
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
export class AppComponent implements OnInit {
  protected theme = inject(ThemeService);
  protected auth = inject(AuthService);
  protected company = COMPANY;
  private seo = inject(SeoService);
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.auth.ensure();
    this.auth.config();
    // Per-page description, Open Graph tags and canonical URL.
    this.seo.start(this.destroyRef);
  }
}
