import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Pages that need an account send visitors to /entrar and bring them back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  // inject() only works before the first await.
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.ensure()) return true;
  auth.rememberReturn(state.url);
  return router.createUrlTree(['/entrar']);
};

/** An expired session on any API call leads back to the login page. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError(err => {
      if (err instanceof HttpErrorResponse && err.status === 401 && err.error?.code === 'AUTH') {
        auth.clear();
        auth.rememberReturn(router.url);
        router.navigate(['/entrar']);
      }
      return throwError(() => err);
    })
  );
};
