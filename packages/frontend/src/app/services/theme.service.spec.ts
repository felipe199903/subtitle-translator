import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const html = document.documentElement;

  beforeEach(() => {
    localStorage.removeItem('theme');
    delete html.dataset['theme'];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    localStorage.removeItem('theme');
    delete html.dataset['theme'];
  });

  it('follows the system theme when nothing was chosen', () => {
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    expect(TestBed.inject(ThemeService).mode()).toBe(systemDark ? 'dark' : 'light');
    expect(html.dataset['theme']).toBeUndefined();
  });

  it('toggles, applies data-theme and remembers the choice', () => {
    const theme = TestBed.inject(ThemeService);
    const before = theme.mode();
    theme.toggle();
    const after = before === 'dark' ? 'light' : 'dark';
    expect(theme.mode()).toBe(after);
    expect(html.dataset['theme']).toBe(after);
    expect(localStorage.getItem('theme')).toBe(after);
  });

  it('starts from the saved choice', () => {
    localStorage.setItem('theme', 'dark');
    expect(TestBed.inject(ThemeService).mode()).toBe('dark');
  });
});
