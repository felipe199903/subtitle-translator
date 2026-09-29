import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'theme';

/**
 * Light/dark theme. Follows the OS until the user picks one; the choice is stored
 * and applied as data-theme on <html> (index.html applies it before first paint).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  readonly mode = signal<ThemeMode>(this.initial());

  constructor() {
    this.media?.addEventListener?.('change', e => {
      if (!this.stored()) this.mode.set(e.matches ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    if (typeof document !== 'undefined') document.documentElement.dataset['theme'] = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage unavailable (private mode): the choice lasts for this page only */
    }
  }

  private initial(): ThemeMode {
    return this.stored() ?? (this.media?.matches ? 'dark' : 'light');
  }

  private stored(): ThemeMode | null {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null;
    }
  }
}
