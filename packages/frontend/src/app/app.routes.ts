import { Routes } from '@angular/router';
import { UploadComponent } from './upload/upload';
import { TranslationComponent } from './translation/translation';
import { LandingComponent } from './landing/landing';
import { PricingComponent } from './pricing/pricing';
import { LoginComponent } from './login/login';
import { LoginConfirmComponent } from './login/confirm';
import { AccountComponent } from './account/account';
import { TermsComponent } from './legal/terms';
import { PrivacyComponent } from './legal/privacy';
import { authGuard } from './services/auth.guard';
import { GuideComponent } from './seo/guide';
import { GUIDES } from './seo/pages';

const NAME = 'Tradutor de Legendas';

export const routes: Routes = [
  { path: '', component: LandingComponent, title: `${NAME} — traduza .srt para português` },
  { path: 'app', component: UploadComponent, canActivate: [authGuard], title: `Nova tradução — ${NAME}`, data: { noindex: true } },
  {
    path: 'translation/:jobId',
    component: TranslationComponent,
    canActivate: [authGuard],
    title: `Tradução — ${NAME}`,
    data: { noindex: true },
  },
  {
    path: 'precos',
    component: PricingComponent,
    title: `Planos e preços — ${NAME}`,
    data: {
      description:
        'Grátis para 3 legendas por mês. Pro por R$ 19,90/mês no cartão ou avulso com Pix: mais legendas, arquivos maiores e tradução por IA.',
    },
  },
  { path: 'entrar', component: LoginComponent, title: `Entrar — ${NAME}`, data: { noindex: true } },
  { path: 'entrar/confirmar', component: LoginConfirmComponent, title: `Entrando — ${NAME}`, data: { noindex: true } },
  { path: 'conta', component: AccountComponent, canActivate: [authGuard], title: `Minha conta — ${NAME}`, data: { noindex: true } },
  { path: 'termos', component: TermsComponent, title: `Termos de Uso — ${NAME}` },
  { path: 'privacidade', component: PrivacyComponent, title: `Política de Privacidade — ${NAME}` },
  ...GUIDES.map(guide => ({
    path: guide.path,
    component: GuideComponent,
    title: guide.title,
    data: { guide, description: guide.description },
  })),
  { path: '**', redirectTo: '' },
];
