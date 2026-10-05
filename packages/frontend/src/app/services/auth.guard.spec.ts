import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  function run(me: unknown) {
    const auth = { ensure: () => Promise.resolve(me), rememberReturn: jasmine.createSpy('rememberReturn') };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/conta' } as any)) as Promise<boolean | UrlTree>;
    return { result, auth };
  }

  it('lets signed-in users through', async () => {
    expect(await run({ email: 'a@b.c' }).result).toBe(true);
  });

  it('sends visitors to /entrar and remembers where they were going', async () => {
    const { result, auth } = run(null);
    const tree = await result;
    expect(TestBed.inject(Router).serializeUrl(tree as UrlTree)).toBe('/entrar');
    expect(auth.rememberReturn).toHaveBeenCalledWith('/conta');
  });
});
