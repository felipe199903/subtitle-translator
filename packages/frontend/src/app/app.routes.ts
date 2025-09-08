import { Routes } from '@angular/router';
import { UploadComponent } from './upload/upload';
import { TranslationComponent } from './translation/translation';

export const routes: Routes = [
  { path: '', redirectTo: '/upload', pathMatch: 'full' },
  { path: 'upload', component: UploadComponent },
  { path: 'translation', component: TranslationComponent },
  { path: '**', redirectTo: '/upload' }
];
