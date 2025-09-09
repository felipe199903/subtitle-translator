import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingStates = new Map<string, BehaviorSubject<LoadingState>>();

  // Loading global
  private globalLoading = new BehaviorSubject<LoadingState>({ isLoading: false });
  public globalLoading$ = this.globalLoading.asObservable();

  // Exibir loading global
  showGlobal(message?: string, progress?: number): void {
    this.globalLoading.next({ 
      isLoading: true, 
      message: message || 'Carregando...', 
      progress 
    });
  }

  // Esconder loading global
  hideGlobal(): void {
    this.globalLoading.next({ isLoading: false });
  }

  // Loading por contexto/componente
  getLoadingState(context: string): BehaviorSubject<LoadingState> {
    if (!this.loadingStates.has(context)) {
      this.loadingStates.set(context, new BehaviorSubject<LoadingState>({ isLoading: false }));
    }
    return this.loadingStates.get(context)!;
  }

  // Exibir loading para contexto específico
  show(context: string, message?: string, progress?: number): void {
    const state = this.getLoadingState(context);
    state.next({ 
      isLoading: true, 
      message: message || 'Carregando...', 
      progress 
    });
  }

  // Esconder loading para contexto específico
  hide(context: string): void {
    const state = this.getLoadingState(context);
    state.next({ isLoading: false });
  }

  // Atualizar progresso
  updateProgress(context: string, progress: number, message?: string): void {
    const state = this.getLoadingState(context);
    const currentState = state.value;
    state.next({
      ...currentState,
      progress,
      message: message || currentState.message
    });
  }

  // Verificar se está carregando
  isLoading(context?: string): boolean {
    if (context) {
      return this.getLoadingState(context).value.isLoading;
    }
    return this.globalLoading.value.isLoading;
  }

  // Limpar todos os loadings
  clearAll(): void {
    this.hideGlobal();
    this.loadingStates.forEach(state => {
      state.next({ isLoading: false });
    });
  }
}
