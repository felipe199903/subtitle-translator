import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { AuthService } from '../services/auth.service';
import { BillingService, DEFAULT_PRICES, OfferKey, formatPrice } from '../services/billing.service';
import { apiErrorMessage } from '../services/subtitle.service';

/** The three plans side by side, with buttons that go straight to Stripe Checkout. */
@Component({
  selector: 'app-pricing-cards',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="plans">
      <article class="card plan">
        <h3>Grátis</h3>
        <p class="price"><strong>R$ 0</strong></p>
        <p class="desc">Para experimentar com calma.</p>
        <ul>
          <li><app-icon name="check" [size]="16" /> 3 legendas por mês</li>
          <li><app-icon name="check" [size]="16" /> Arquivos de até 1.500 falas</li>
          <li><app-icon name="check" [size]="16" /> Revisão e download do .srt</li>
        </ul>
        <a class="btn" [routerLink]="auth.me() ? '/app' : '/entrar'">{{ auth.me() ? 'Traduzir agora' : 'Criar conta grátis' }}</a>
      </article>

      <article class="card plan featured">
        <span class="badge accent tag">Mais escolhido</span>
        <h3>Pro Mensal</h3>
        <p class="price"><strong>{{ fmt('pro_monthly') }}</strong><span>/mês</span></p>
        <p class="desc">Assinatura no cartão. Cancele quando quiser.</p>
        <ul>
          @if (auth.aiEngine()) {
            <li><app-icon name="sparkle" [size]="16" /> <span><strong>Tradução por IA</strong> que entende o contexto: gênero, tratamento e gírias</span></li>
          }
          <li><app-icon name="check" [size]="16" /> Legendas sem limite apertado (uso justo: 200/mês)</li>
          <li><app-icon name="check" [size]="16" /> Arquivos de até 10.000 falas</li>
          <li><app-icon name="check" [size]="16" /> Renovação automática, sem fidelidade</li>
        </ul>
        <button type="button" class="btn primary" (click)="buy('pro_monthly')" [disabled]="busy() !== null">
          @if (busy() === 'pro_monthly') { <span class="spinner"></span> } Assinar o Pro
        </button>
      </article>

      <article class="card plan">
        <h3>Pro avulso</h3>
        <p class="price"><strong>{{ fmt('pro_30d') }}</strong><span>/30 dias</span></p>
        <p class="desc">Pague uma vez, com Pix ou cartão. Sem renovação automática.</p>
        <ul>
          <li><app-icon name="check" [size]="16" /> Tudo do Pro Mensal</li>
          <li><app-icon name="check" [size]="16" /> Ou 12 meses por {{ fmt('pro_365d') }} (economize 25%)</li>
          <li><app-icon name="check" [size]="16" /> Os dias se somam se você comprar de novo</li>
        </ul>
        <div class="pair">
          <button type="button" class="btn" (click)="buy('pro_30d')" [disabled]="busy() !== null">
            @if (busy() === 'pro_30d') { <span class="spinner"></span> } 30 dias
          </button>
          <button type="button" class="btn" (click)="buy('pro_365d')" [disabled]="busy() !== null">
            @if (busy() === 'pro_365d') { <span class="spinner"></span> } 12 meses
          </button>
        </div>
      </article>
    </div>
    @if (error()) {
      <div class="alert danger" role="alert"><app-icon name="alert" /><div class="alert-body">{{ error() }}</div></div>
    }
    <p class="fine">
      Pagamento processado com segurança pelo Stripe. Ao assinar ou comprar você concorda com os
      <a routerLink="/termos">Termos de Uso</a> e a <a routerLink="/privacidade">Política de Privacidade</a>.
      Direito de arrependimento em até 7 dias.
    </p>
  `,
  styles: [
    `
      .plans {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        align-items: stretch;
      }
      .plan {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 1.5rem;
      }
      .plan.featured {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent), var(--shadow-md);
      }
      .tag {
        position: absolute;
        top: -0.7rem;
        left: 1.5rem;
        background: var(--accent);
        color: var(--accent-fg);
      }
      h3 {
        font-size: 1.05rem;
        font-weight: 600;
      }
      .price strong {
        font-size: 1.9rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .price span {
        margin-left: 0.2rem;
        color: var(--text-subtle);
      }
      .desc {
        color: var(--text-muted);
        font-size: 0.9rem;
      }
      ul {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        margin: 0.4rem 0 0.8rem;
        padding: 0;
        list-style: none;
        font-size: 0.9rem;
      }
      li {
        display: flex;
        gap: 0.45rem;
        align-items: flex-start;
      }
      li app-icon {
        margin-top: 0.15rem;
        color: var(--success);
      }
      .btn {
        justify-content: center;
        width: 100%;
      }
      .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
      }
      .alert {
        margin-top: 1rem;
      }
      .fine {
        margin-top: 1.25rem;
        color: var(--text-subtle);
        font-size: 0.8rem;
        text-align: center;
      }
      @media (max-width: 820px) {
        .plans {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class PricingCardsComponent implements OnInit {
  protected auth = inject(AuthService);
  private billing = inject(BillingService);
  private router = inject(Router);

  prices = signal(DEFAULT_PRICES);
  busy = signal<OfferKey | null>(null);
  error = signal<string | null>(null);

  async ngOnInit() {
    this.auth.config();
    this.prices.set(await this.billing.prices());
  }

  fmt(key: OfferKey): string {
    return formatPrice(this.prices()[key]);
  }

  async buy(plan: OfferKey): Promise<void> {
    this.error.set(null);
    if (!(await this.auth.ensure())) {
      // Come back to the pricing page and continue the purchase after signing in.
      this.auth.rememberReturn(`/precos?plano=${plan}`);
      this.router.navigate(['/entrar']);
      return;
    }
    this.busy.set(plan);
    try {
      await this.billing.checkout(plan);
    } catch (err) {
      this.busy.set(null);
      this.error.set(apiErrorMessage(err, 'Não foi possível abrir o pagamento. Tente novamente.'));
    }
  }
}
