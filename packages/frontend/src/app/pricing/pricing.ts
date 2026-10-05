import { AfterViewInit, Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PricingCardsComponent } from './pricing-cards';
import { FaqComponent } from './faq';
import { PromoComponent } from './promo';
import { OfferKey } from '../services/billing.service';

const OFFERS: OfferKey[] = ['pro_monthly', 'pro_30d', 'pro_365d'];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [PricingCardsComponent, FaqComponent, PromoComponent],
  template: `
    <section class="head">
      <h1>Planos e preços</h1>
      <p class="lead">Comece grátis. Assine quando precisar de mais legendas ou de arquivos maiores.</p>
    </section>
    <app-promo class="promo" />
    <app-pricing-cards />
    <app-faq class="faq" />
  `,
  styles: [
    `
      .head {
        margin: 1rem 0 2.25rem;
        text-align: center;
      }
      h1 {
        font-size: clamp(1.7rem, 4vw, 2.2rem);
      }
      .lead {
        margin-top: 0.6rem;
        color: var(--text-muted);
      }
      .promo {
        display: block;
        margin-bottom: 1.75rem;
      }
      .faq {
        max-width: 720px;
        margin: 3rem auto 0;
      }
    `,
  ],
})
export class PricingComponent implements AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cards = viewChild.required(PricingCardsComponent);

  /** After signing in from a "buy" button, /precos?plano=… continues straight to checkout. */
  ngAfterViewInit(): void {
    const plan = this.route.snapshot.queryParamMap.get('plano') as OfferKey | null;
    if (plan && OFFERS.includes(plan)) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.cards().buy(plan);
    }
  }
}
