import Stripe from 'stripe';
import { OFFERS, OfferKey } from '../auth/plans';

/** The Stripe client, or null while STRIPE_SECRET_KEY is not configured. */
export function stripeFromEnv(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

export interface PriceInfo {
  id: string;
  amount: number;
  currency: string;
  interval: string | null;
}

/** The launch promotion code advertised on the site (created by scripts/stripe-setup.ts). */
export const LAUNCH_CODE = 'LANCAMENTO';

export interface PromoInfo {
  code: string;
  percentOff: number;
  /** Months of a subscription the discount lasts (null: once / forever). */
  months: number | null;
  /** Expiry in ms, if any. */
  expiresAt: number | null;
}

/**
 * Prices are found by lookup_key (created by scripts/stripe-setup.ts), so no price ids live in
 * env vars and a new price can replace an old one with transfer_lookup_key.
 */
export class PriceCatalog {
  private cache: { at: number; prices: Partial<Record<OfferKey, PriceInfo>> } | null = null;
  private promoCache: { at: number; promo: PromoInfo | null } | null = null;
  private pixCache: { at: number; value: boolean } | null = null;

  constructor(private stripe: Stripe, private ttlMs = 10 * 60 * 1000) {}

  async all(): Promise<Partial<Record<OfferKey, PriceInfo>>> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.prices;
    const list = await this.stripe.prices.list({ lookup_keys: Object.keys(OFFERS), active: true, limit: 10 });
    const prices: Partial<Record<OfferKey, PriceInfo>> = {};
    for (const p of list.data) {
      if (!p.lookup_key || p.unit_amount == null) continue;
      prices[p.lookup_key as OfferKey] = {
        id: p.id,
        amount: p.unit_amount,
        currency: p.currency,
        interval: p.recurring?.interval ?? null,
      };
    }
    this.cache = { at: Date.now(), prices };
    return prices;
  }

  async get(key: OfferKey): Promise<PriceInfo | null> {
    return (await this.all())[key] ?? null;
  }

  /** Whether Checkout can offer Pix right now (the account needs the Pix capability approved). */
  async pixAvailable(): Promise<boolean> {
    if (this.pixCache && Date.now() - this.pixCache.at < this.ttlMs) return this.pixCache.value;
    const configs = (await this.stripe.paymentMethodConfigurations.list({ limit: 20 })).data;
    const config = configs.find(c => c.is_default && !c.parent) ?? configs.find(c => c.is_default);
    const value = !!config?.pix?.available && config.pix.display_preference?.value === 'on';
    this.pixCache = { at: Date.now(), value };
    return value;
  }

  /** The launch code while it is active in Stripe, so the site never advertises a dead coupon. */
  async promo(): Promise<PromoInfo | null> {
    if (this.promoCache && Date.now() - this.promoCache.at < this.ttlMs) return this.promoCache.promo;
    const [code] = (
      await this.stripe.promotionCodes.list({ code: LAUNCH_CODE, active: true, limit: 1, expand: ['data.promotion.coupon'] })
    ).data;
    const coupon = code?.promotion?.coupon;
    const expiresAt = code?.expires_at ? code.expires_at * 1000 : null;
    const promo =
      code && coupon && typeof coupon === 'object' && coupon.percent_off && (!expiresAt || expiresAt > Date.now())
        ? {
            code: code.code,
            percentOff: coupon.percent_off,
            months: coupon.duration === 'repeating' ? (coupon.duration_in_months ?? null) : null,
            expiresAt,
          }
        : null;
    this.promoCache = { at: Date.now(), promo };
    return promo;
  }
}
