import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, ToastMessage } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div 
        *ngFor="let toast of toasts" 
        class="toast"
        [class]="'toast-' + toast.type"
        [attr.data-id]="toast.id">
        
        <div class="toast-content">
          <div class="toast-icon">
            <span [ngSwitch]="toast.type">
              <span *ngSwitchCase="'success'">✅</span>
              <span *ngSwitchCase="'error'">❌</span>
              <span *ngSwitchCase="'warning'">⚠️</span>
              <span *ngSwitchCase="'info'">ℹ️</span>
            </span>
          </div>
          
          <div class="toast-text">
            <div class="toast-title">{{ toast.title }}</div>
            <div class="toast-message">{{ toast.message }}</div>
          </div>
          
          <button 
            class="toast-close"
            (click)="removeToast(toast.id)">
            ×
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
      width: 100%;
    }

    .toast {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border-left: 4px solid;
      overflow: hidden;
      transform: translateX(100%);
      animation: slideIn 0.3s ease-out forwards;
    }

    @keyframes slideIn {
      to {
        transform: translateX(0);
      }
    }

    .toast-success {
      border-left-color: #28a745;
    }

    .toast-error {
      border-left-color: #dc3545;
    }

    .toast-warning {
      border-left-color: #ffc107;
    }

    .toast-info {
      border-left-color: #007bff;
    }

    .toast-content {
      display: flex;
      align-items: flex-start;
      padding: 16px;
      gap: 12px;
    }

    .toast-icon {
      font-size: 20px;
      line-height: 1;
      flex-shrink: 0;
    }

    .toast-text {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 4px;
      font-size: 14px;
    }

    .toast-message {
      color: #6c757d;
      font-size: 13px;
      line-height: 1.4;
      word-wrap: break-word;
    }

    .toast-close {
      background: none;
      border: none;
      font-size: 20px;
      color: #adb5bd;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .toast-close:hover {
      background: #f8f9fa;
      color: #495057;
    }

    @media (max-width: 480px) {
      .toast-container {
        right: 10px;
        left: 10px;
        max-width: none;
      }
      
      .toast-content {
        padding: 12px;
      }
      
      .toast-title {
        font-size: 13px;
      }
      
      .toast-message {
        font-size: 12px;
      }
    }
  `]
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: ToastMessage[] = [];
  private subscription?: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.subscription = this.notificationService.toasts$.subscribe(
      (toasts: ToastMessage[]) => this.toasts = toasts
    );
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  removeToast(id: string): void {
    this.notificationService.removeToast(id);
  }
}
