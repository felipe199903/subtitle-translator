import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../components/icon.component';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { apiErrorMessage } from '../services/subtitle.service';

declare global {
  interface Window {
    google?: any;
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const s = existing ?? document.createElement('script');
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('gsi')));
    if (!existing) {
      s.src = GSI_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="card box">
      <h1>Entrar</h1>
      <p class="lead">Use sua conta Google ou receba um link de acesso por e-mail. Não precisa de senha.</p>

      @if (googleReady() !== false) {
        <div class="google" #googleBtn></div>
        <div class="divider"><span>ou</span></div>
      }

      @if (sentTo()) {
        <div class="alert success" role="status">
          <app-icon name="check" />
          <div class="alert-body">
            Enviamos um link para <strong>{{ sentTo() }}</strong>. Abra o e-mail neste aparelho e clique em
            <em>Entrar</em>. O link vale por 15 minutos.
          </div>
        </div>
        <button type="button" class="btn ghost sm" (click)="sentTo.set(null)">Usar outro e-mail</button>
      } @else {
        <form (ngSubmit)="sendLink()">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" required [(ngModel)]="email" placeholder="voce@exemplo.com" />
          <button type="submit" class="btn primary" [disabled]="sending() || !email">
            @if (sending()) { <span class="spinner"></span> } Receber link de acesso
          </button>
        </form>
      }

      @if (error()) {
        <div class="alert danger" role="alert"><app-icon name="alert" /><div class="alert-body">{{ error() }}</div></div>
      }

      <p class="fine">
        Ao entrar você concorda com os <a routerLink="/termos">Termos de Uso</a> e a
        <a routerLink="/privacidade">Política de Privacidade</a>.
      </p>
    </div>
  `,
  styles: [
    `
      .box {
        max-width: 420px;
        margin: 2rem auto;
        padding: 2rem;
      }
      h1 {
        font-size: 1.5rem;
      }
      .lead {
        margin: 0.5rem 0 1.5rem;
        color: var(--text-muted);
        font-size: 0.92rem;
      }
      .google {
        display: flex;
        justify-content: center;
        min-height: 44px;
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: 1.25rem 0;
        color: var(--text-subtle);
        font-size: 0.8rem;
      }
      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        border-top: 1px solid var(--border);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      label {
        font-size: 0.85rem;
        font-weight: 500;
      }
      input {
        padding: 0.6rem 0.75rem;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-sm);
        background: var(--surface);
      }
      input:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: var(--ring);
      }
      form .btn {
        justify-content: center;
        margin-top: 0.4rem;
      }
      .alert {
        margin-top: 1rem;
      }
      .fine {
        margin-top: 1.5rem;
        color: var(--text-subtle);
        font-size: 0.78rem;
        text-align: center;
      }
    `,
  ],
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);
  private googleBtn = viewChild<ElementRef<HTMLElement>>('googleBtn');

  email = '';
  sending = signal(false);
  sentTo = signal<string | null>(null);
  error = signal<string | null>(null);
  /** null while loading, false when Google login is not available. */
  googleReady = signal<boolean | null>(null);

  async ngAfterViewInit(): Promise<void> {
    if (await this.auth.ensure()) {
      this.router.navigateByUrl(this.auth.takeReturn());
      return;
    }
    try {
      const { googleClientId } = await this.auth.config();
      if (!googleClientId) throw new Error('not configured');
      await loadGsi();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (r: { credential: string }) => this.onGoogle(r.credential),
        ux_mode: 'popup',
      });
      const el = this.googleBtn()?.nativeElement;
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: this.theme.mode() === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'pt-BR',
          width: 300,
        });
      }
      this.googleReady.set(true);
    } catch {
      this.googleReady.set(false);
    }
  }

  ngOnDestroy(): void {
    window.google?.accounts?.id?.cancel?.();
  }

  async sendLink(): Promise<void> {
    this.error.set(null);
    this.sending.set(true);
    try {
      await this.auth.requestLink(this.email);
      this.sentTo.set(this.email.trim().toLowerCase());
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Não foi possível enviar o link. Tente novamente.'));
    } finally {
      this.sending.set(false);
    }
  }

  private async onGoogle(credential: string): Promise<void> {
    this.error.set(null);
    try {
      await this.auth.loginWithGoogle(credential);
      this.router.navigateByUrl(this.auth.takeReturn());
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Não foi possível entrar com o Google.'));
    }
  }
}
