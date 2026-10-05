import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { inject as injectAnalytics } from '@vercel/analytics';

// Vercel Web Analytics: anonymous page views, no cookies. Query strings are dropped so the
// magic-link token (/entrar/confirmar?token=…) and job ids in links never reach the analytics.
injectAnalytics({
  beforeSend: event => ({ ...event, url: event.url.split('?')[0] }),
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err: any) => console.error(err));
