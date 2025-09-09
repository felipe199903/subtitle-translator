import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';
import { LoadingComponent } from './components/loading/loading.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, LoadingComponent],
  template: `
    <div class="app-container">
      <header class="header">
        <div class="header-content">
          <h1>🎬 Subtitle Translator</h1>
          <p>Traduza suas legendas para Português</p>
        </div>
      </header>
      <main class="main-container">
        <router-outlet></router-outlet>
      </main>
      <app-toast></app-toast>
      <app-loading [isGlobal]="true"></app-loading>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      text-align: center;
      padding: 0 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 300;
    }
    .header p {
      margin: 0.5rem 0 0;
      opacity: 0.9;
      font-size: 1.1rem;
    }
    .main-container {
      flex: 1;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
    }
  `]
})
export class AppComponent {
  title = 'Subtitle Translator';
}
