import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';
import { Subscription } from 'rxjs';

interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-overlay" *ngIf="isVisible" [class.global]="isGlobal">
      <div class="loading-content">
        <!-- Spinner para loading geral -->
        <div *ngIf="!hasProgress" class="spinner">
          <div class="spinner-circle"></div>
        </div>
        
        <!-- Barra de progresso para carregamentos com porcentagem -->
        <div class="progress-container" *ngIf="hasProgress">
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="currentProgress"></div>
          </div>
          <div class="progress-text">{{ currentProgress }}%</div>
        </div>
        
        <!-- Mensagem de loading -->
        <div class="loading-message" *ngIf="currentMessage">
          {{ currentMessage }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      border-radius: 8px;
    }

    .loading-overlay.global {
      position: fixed;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    }

    .loading-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 24px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      text-align: center;
    }

    .global .loading-content {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
    }

    .loading-message {
      font-size: 14px;
      color: #333;
      font-weight: 500;
    }

    .spinner {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .spinner-circle {
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007bff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .progress-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .progress-bar {
      width: 300px;
      height: 20px;
      background-color: #f3f3f3;
      border-radius: 10px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #007bff, #0056b3);
      border-radius: 10px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      color: #666;
      font-weight: 600;
    }
  `]
})
export class LoadingComponent implements OnInit, OnDestroy {
  @Input() context?: string;
  @Input() isGlobal = false;
  
  isVisible = false;
  currentMessage = '';
  currentProgress = 0;
  hasProgress = false;

  private subscription?: Subscription;

  constructor(private loadingService: LoadingService) {}

  ngOnInit(): void {
    if (this.isGlobal) {
      // Loading global
      this.subscription = this.loadingService.globalLoading$.subscribe((state: LoadingState) => {
        this.isVisible = state.isLoading;
        this.currentMessage = state.message || '';
        this.currentProgress = state.progress || 0;
        this.hasProgress = state.progress !== undefined;
      });
    } else if (this.context) {
      // Loading por contexto
      const loadingState = this.loadingService.getLoadingState(this.context);
      this.subscription = loadingState.subscribe((state: LoadingState) => {
        this.isVisible = state.isLoading;
        this.currentMessage = state.message || '';
        this.currentProgress = state.progress || 0;
        this.hasProgress = state.progress !== undefined;
      });
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
