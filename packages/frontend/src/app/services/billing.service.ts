import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type OfferKey = 'pro_monthly' | 'pro_30d' | 'pro_365d';
export interface Price {
  amount: number;
  currency: string;
  interval: string | null;
}

/** Shown until (or if) the API returns the live Stripe prices. */
export const DEFAULT_PRICES: Record<OfferKey, Price> = {
  pro_monthly: { amount: 1990, currency: 'brl', interval: 'month' },
  pro_30d: { amount: 1990, currency: 'brl', interval: null },
  pro_365d: { amount: 17900, currency: 'brl', interval: null },
};

export interface Promo {
  code: string;
  percentOff: number;
  months: number | null;
  expiresAt: number | null;
}

export const formatPrice = (p: Price) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency.toUpperCase() }).format(p.amount / 100);

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private loading: Promise<{ prices: Record<OfferKey, Price>; promo: Promo | null }> | null = null;

  /** Live Stripe prices and the active launch coupon (fetched once per page load). */
  catalog(): Promise<{ prices: Record<OfferKey, Price>; promo: Promo | null }> {
    return (this.loading ??= firstValueFrom(
      this.http.get<{ data: Partial<Record<OfferKey, Price>> | null; promo?: Promo | null }>('/api/billing/prices')
    ).then(
      res => ({ prices: { ...DEFAULT_PRICES, ...(res.data ?? {}) }, promo: res.promo ?? null }),
      () => {
        this.loading = null;
        return { prices: DEFAULT_PRICES, promo: null };
      }
    ));
  }

  async prices(): Promise<Record<OfferKey, Price>> {
    return (await this.catalog()).prices;
  }

  /** Opens Stripe Checkout. */
  async checkout(plan: OfferKey): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ data: { url: string } }>('/api/billing/checkout', { plan }));
    window.location.href = res.data.url;
  }

  /** Opens the Stripe Customer Portal (cancel, card, invoices). */
  async portal(): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ data: { url: string } }>('/api/billing/portal', {}));
    window.location.href = res.data.url;
  }
}
