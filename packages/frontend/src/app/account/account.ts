import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { apiErrorMessage } from '../services/subtitle.service';

const STATUS: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  unpaid: 'Não paga',
  incomplete: 'Incompleta',
  incomplete_expired: 'Expirada',
  paused: 'Pausada',
};

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [RouterLink, IconComponent, DatePipe],
  template: `
    @if (me(); as me) {
      <h1>Minha conta</h1>

      @if (checkout() === 'waiting') {
        <div class="alert info" role="status">
          <span class="spinner"></span>
          <div class="alert-body">Pagamento recebido pelo Stripe. Estamos ativando seu plano… (no Pix, a confirmação pode levar alguns instantes)</div>
        </div>
      } @else if (checkout() === 'done') {
        <div class="alert success" role="status"><app-icon name="check" /><div class="alert-body">Pronto! Seu plano Pro está ativo. Obrigado pela compra.</div></div>
      } @else if (checkout() === 'slow') {
        <div class="alert warning" role="status">
          <app-icon name="clock" />
          <div class="alert-body">Ainda não recebemos a confirmação do pagamento. Se você pagou com Pix, ela chega assim que o banco confirmar; atualize esta página em alguns minutos.</div>
        </div>
      }

      <section class="card block">
        <div class="row">
          <div>
            <span class="label">Conta</span>
            <strong>{{ me.name || me.email }}</strong>
            @if (me.name) { <span class="muted">{{ me.email }}</span> }
          </div>
          <button type="button" class="btn ghost sm" (click)="logout()">Sair</button>
        </div>
      </section>

      <section class="card block">
        <div class="row">
          <div>
            <span class="label">Plano</span>
            <strong>
              {{ me.plan === 'pro' ? 'Pro' : 'Grátis' }}
              @if (me.plan === 'pro') { <span class="badge accent">ativo</span> }
            </strong>
            @if (me.subscription; as sub) {
              <span class="muted">
                Assinatura mensal · {{ status(sub.status) }}
                @if (sub.periodEnd) {
                  · {{ sub.cancelAtPeriodEnd || sub.status === 'canceled' ? 'termina em' : 'renova em' }} {{ sub.periodEnd | date: 'dd/MM/yyyy' }}
                }
              </span>
            }
            @if (passActive()) {
              <span class="muted">Pro avulso válido até {{ me.proUntil | date: 'dd/MM/yyyy' }}</span>
            }
          </div>
          <div class="actions">
            @if (me.hasBillingAccount) {
              <button type="button" class="btn sm" (click)="portal()" [disabled]="busy()">Gerenciar pagamentos</button>
            }
            @if (me.plan === 'free' || (passActive() && !me.subscription)) {
              <a class="btn primary sm" routerLink="/precos">{{ me.plan === 'free' ? 'Assinar o Pro' : 'Comprar mais dias' }}</a>
            }
          </div>
        </div>

        <div class="usage">
          <div class="usage-text">
            <span>Traduções neste mês</span>
            <span class="tabular">{{ me.usage.files }} de {{ me.limits.filesPerMonth }}</span>
          </div>
          <div class="progress"><div class="fill" [style.width.%]="usagePct()"></div></div>
          <span class="muted small">Arquivos de até {{ me.limits.maxCues.toLocaleString('pt-BR') }} falas. A contagem reinicia todo dia 1º.</span>
        </div>
      </section>

      @if (error()) {
        <div class="alert danger" role="alert"><app-icon name="alert" /><div class="alert-body">{{ error() }}</div></div>
      }

      <section class="card block danger-zone">
        <span class="label">Privacidade</span>
        <p class="muted">
          Excluir a conta apaga seus dados e legendas deste site e cancela a assinatura, se houver. Os registros de
          pagamento continuam no Stripe pelo prazo exigido por lei.
        </p>
        @if (confirmDelete()) {
          <div class="actions">
            <button type="button" class="btn danger sm" (click)="deleteAccount()" [disabled]="busy()">Sim, excluir minha conta</button>
            <button type="button" class="btn ghost sm" (click)="confirmDelete.set(false)">Cancelar</button>
          </div>
        } @else {
          <button type="button" class="btn ghost sm" (click)="confirmDelete.set(true)">Excluir minha conta</button>
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 720px;
        margin: 0 auto;
      }
      h1 {
        font-size: 1.6rem;
        margin: 0.5rem 0;
      }
      .block {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem 1.4rem;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }
      .row > div:first-child {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .label {
        color: var(--text-subtle);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      strong {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.05rem;
      }
      .muted {
        color: var(--text-muted);
        font-size: 0.9rem;
      }
      .small {
        font-size: 0.8rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .usage {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .usage-text {
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
      }
      .btn.danger {
        background: var(--danger);
        border-color: var(--danger);
        color: #fff;
      }
      .danger-zone {
        gap: 0.6rem;
      }
      .danger-zone > .btn {
        align-self: flex-start;
      }
    `,
  ],
})
export class AccountComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private billing = inject(BillingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private timer: ReturnType<typeof setTimeout> | undefined;

  me = this.auth.me;
  busy = signal(false);
  error = signal<string | null>(null);
  confirmDelete = signal(false);
  checkout = signal<'waiting' | 'done' | 'slow' | null>(null);

  passActive = computed(() => {
    const until = this.me()?.proUntil;
    return until != null && until > Date.now();
  });
  usagePct = computed(() => {
    const me = this.me();
    return me ? Math.min(100, (me.usage.files / me.limits.filesPerMonth) * 100) : 0;
  });

  async ngOnInit(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;
    const fromCheckout = query.get('checkout') === 'ok';
    const sessionId = query.get('session_id');
    if (fromCheckout) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.checkout.set('waiting');
      // Apply the purchase now; if it fails (or Pix is still pending), the polling below waits for the webhook.
      if (sessionId) await this.billing.sync(sessionId).catch(() => {});
    }
    await this.auth.refresh();
    if (fromCheckout) this.waitForPlan();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  status(s: string): string {
    return STATUS[s] ?? s;
  }

  /** The webhook usually lands within seconds of the redirect; poll briefly until the plan flips. */
  private waitForPlan(attempt = 0): void {
    if (this.auth.isPro()) {
      this.checkout.set('done');
      return;
    }
    if (attempt >= 10) {
      this.checkout.set('slow');
      return;
    }
    this.checkout.set('waiting');
    this.timer = setTimeout(async () => {
      await this.auth.refresh();
      this.waitForPlan(attempt + 1);
    }, 2000);
  }

  async portal(): Promise<void> {
    await this.run(() => this.billing.portal());
  }

  async logout(): Promise<void> {
    await this.run(async () => {
      await this.auth.logout();
      this.router.navigate(['/']);
    });
  }

  async deleteAccount(): Promise<void> {
    await this.run(async () => {
      await this.auth.deleteAccount();
      this.router.navigate(['/']);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await fn();
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
