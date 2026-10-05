import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Plan = 'free' | 'pro';

export interface Me {
  email: string;
  name: string | null;
  plan: Plan;
  limits: { filesPerMonth: number; maxCues: number };
  usage: { files: number };
  /** End of the one-off Pro pass (ms), if any. */
  proUntil: number | null;
  subscription: { status: string; periodEnd: number | null; cancelAtPeriodEnd: boolean } | null;
  hasBillingAccount: boolean;
}

export interface SiteConfig {
  googleClientId: string | null;
  /** Pro translates with AI (Gemini); false while the key is not configured. */
  aiEngine: boolean;
}

/** Where to go after signing in; kept across the magic-link round trip. */
const RETURN_KEY = 'auth.return';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private loading: Promise<Me | null> | null = null;
  private configLoading: Promise<SiteConfig> | null = null;

  readonly me = signal<Me | null>(null);
  readonly loaded = signal(false);
  readonly isPro = computed(() => this.me()?.plan === 'pro');
  readonly siteConfig = signal<SiteConfig | null>(null);
  readonly aiEngine = computed(() => !!this.siteConfig()?.aiEngine);

  /** The signed-in user, fetched once and then served from memory. */
  ensure(): Promise<Me | null> {
    if (this.loaded()) return Promise.resolve(this.me());
    return (this.loading ??= this.refresh());
  }

  async refresh(): Promise<Me | null> {
    try {
      const res = await firstValueFrom(this.http.get<{ data: Me | null }>('/api/auth/me'));
      this.set(res.data);
    } catch {
      this.set(null);
    } finally {
      this.loading = null;
    }
    return this.me();
  }

  /** Public site settings, fetched once. */
  config(): Promise<SiteConfig> {
    return (this.configLoading ??= firstValueFrom(this.http.get<{ data: SiteConfig }>('/api/auth/config')).then(
      r => {
        this.siteConfig.set(r.data);
        return r.data;
      },
      () => {
        this.configLoading = null;
        return { googleClientId: null, aiEngine: false };
      }
    ));
  }

  async loginWithGoogle(credential: string): Promise<Me> {
    const me = (await firstValueFrom(this.http.post<{ data: Me }>('/api/auth/google', { credential }))).data;
    this.set(me);
    return me;
  }

  async requestLink(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/magic-link', { email }));
  }

  async verifyLink(token: string): Promise<Me> {
    const me = (await firstValueFrom(this.http.post<{ data: Me }>('/api/auth/verify', { token }))).data;
    this.set(me);
    return me;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.set(null);
  }

  async deleteAccount(): Promise<void> {
    await firstValueFrom(this.http.delete('/api/auth/account'));
    this.set(null);
  }

  /** Forgets the session locally (e.g. after a 401 from an expired cookie). */
  clear(): void {
    this.set(null);
  }

  rememberReturn(url: string): void {
    try {
      sessionStorage.setItem(RETURN_KEY, url);
    } catch {}
  }

  /** The page to open after login; only same-site paths are accepted. */
  takeReturn(fallback = '/app'): string {
    let url: string | null = null;
    try {
      url = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch {}
    return url && url.startsWith('/') && !url.startsWith('//') ? url : fallback;
  }

  private set(me: Me | null): void {
    this.me.set(me);
    this.loaded.set(true);
  }
}
