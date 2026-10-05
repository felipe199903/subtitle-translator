import { DestroyRef, Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

const ORIGIN = 'https://subtitle-translator.com.br';
const DEFAULT_DESCRIPTION =
  'Traduza legendas .srt do inglês para o português (BR), revise fala por fala e baixe o arquivo pronto. 3 legendas grátis por mês.';

/**
 * Per-page description, Open Graph tags and canonical URL, from each route's `data.description`
 * (the title comes from the route's `title`). Pages without a description use the site default.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private router = inject(Router);
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  start(destroyRef: DestroyRef): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef)
      )
      .subscribe(e => this.apply(e.urlAfterRedirects));
  }

  private apply(url: string): void {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const description: string = route.data['description'] ?? DEFAULT_DESCRIPTION;
    const href = `${ORIGIN}${url.split(/[?#]/)[0]}`;

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:title', content: route.title ?? this.title.getTitle() });
    this.meta.updateTag({ property: 'og:url', content: href });
    // Private pages (account, editor) are not indexed; robots.txt already keeps crawlers out.
    this.meta.updateTag({ name: 'robots', content: route.data['noindex'] ? 'noindex' : 'index, follow' });

    const link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.href = href;
  }
}
