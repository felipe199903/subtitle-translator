import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../components/icon.component';
import { BillingService, Promo } from '../services/billing.service';

/** Launch coupon banner; shown only while the code is active in Stripe (see stripe-setup.ts). */
@Component({
  selector: 'app-promo',
  standalone: true,
  imports: [IconComponent, DatePipe],
  template: `
    @if (promo(); as p) {
      <div class="promo" role="note">
        <app-icon name="sparkle" [size]="16" />
        <span>
          <strong>Lançamento:</strong> {{ p.percentOff }}% de desconto no Pro com o cupom <code>{{ p.code }}</code>
          @if (p.months) { (nos {{ p.months }} primeiros meses da assinatura) }
          @if (p.expiresAt) { · até {{ p.expiresAt | date: 'dd/MM' }} }
        </span>
      </div>
    }
  `,
  styles: [
    `
      .promo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.7rem 1rem;
        border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
        border-radius: var(--radius-md);
        background: var(--accent-soft);
        color: var(--accent-text);
        font-size: 0.9rem;
        text-align: center;
      }
      code {
        padding: 0.1em 0.4em;
        border-radius: 4px;
        background: var(--accent);
        color: var(--accent-fg);
        font-family: var(--mono);
        font-weight: 600;
      }
    `,
  ],
})
export class PromoComponent implements OnInit {
  private billing = inject(BillingService);
  protected promo = signal<Promo | null>(null);

  async ngOnInit(): Promise<void> {
    this.promo.set((await this.billing.catalog()).promo);
  }
}
