import { Routes } from '@angular/router';
import { UploadComponent } from './upload/upload';
import { TranslationComponent } from './translation/translation';

export const routes: Routes = [
  { path: '', component: UploadComponent, title: 'Tradutor de Legendas' },
  { path: 'translation/:jobId', component: TranslationComponent, title: 'Tradução — Tradutor de Legendas' },
  { path: '**', redirectTo: '' },
];
