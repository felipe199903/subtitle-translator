import { Routes } from '@angular/router';
import { UploadComponent } from './upload/upload';
import { TranslationComponent } from './translation/translation';
import { TrainingComponent } from './training/training';

export const routes: Routes = [
  { path: '', redirectTo: '/upload', pathMatch: 'full' },
  { path: 'upload', component: UploadComponent },
  { path: 'translation', component: TranslationComponent },
  { path: 'training', component: TrainingComponent },
  { path: '**', redirectTo: '/upload' }
];
