import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private toasts = new BehaviorSubject<ToastMessage[]>([]);
  public toasts$ = this.toasts.asObservable();

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private addToast(type: ToastMessage['type'], message: string, title: string, duration = 5000): void {
    const toast: ToastMessage = {
      id: this.generateId(),
      type,
      title,
      message,
      duration
    };

    const currentToasts = this.toasts.value;
    this.toasts.next([...currentToasts, toast]);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(toast.id);
      }, duration);
    }
  }

  success(message: string, title = 'Sucesso'): void {
    this.addToast('success', message, title);
  }

  error(message: string, title = 'Erro'): void {
    this.addToast('error', message, title, 8000);
  }

  warning(message: string, title = 'Atenção'): void {
    this.addToast('warning', message, title, 6000);
  }

  info(message: string, title = 'Informação'): void {
    this.addToast('info', message, title);
  }

  customSuccess(message: string, title = 'Sucesso', duration = 5000): void {
    this.addToast('success', message, title, duration);
  }

  customError(message: string, title = 'Erro', duration = 8000): void {
    this.addToast('error', message, title, duration);
  }

  removeToast(id: string): void {
    const currentToasts = this.toasts.value;
    this.toasts.next(currentToasts.filter(toast => toast.id !== id));
  }

  clear(): void {
    this.toasts.next([]);
  }
}
