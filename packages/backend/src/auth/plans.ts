import { User } from '../db/users';

export type Plan = 'free' | 'pro';

/** Files per calendar month and cues per file. Pro is "unlimited" with a fair-use cap. */
export const LIMITS: Record<Plan, { filesPerMonth: number; maxCues: number }> = {
  free: { filesPerMonth: 3, maxCues: 1500 },
  pro: { filesPerMonth: 200, maxCues: 10000 },
};

/** What each Stripe price (by lookup_key) sells. */
export const OFFERS = {
  pro_monthly: { mode: 'subscription' as const },
  pro_30d: { mode: 'payment' as const, days: 30 },
  pro_365d: { mode: 'payment' as const, days: 365 },
};
export type OfferKey = keyof typeof OFFERS;
export const isOfferKey = (k: unknown): k is OfferKey => typeof k === 'string' && k in OFFERS;

/** Subscription states that still grant Pro (past_due: Stripe is retrying the card). */
const LIVE_SUBSCRIPTION = new Set(['active', 'trialing', 'past_due']);

export const hasLiveSubscription = (u: User) => !!u.subStatus && LIVE_SUBSCRIPTION.has(u.subStatus);

export function planOf(u: User, now = Date.now()): Plan {
  if (hasLiveSubscription(u)) return 'pro';
  return u.proUntil != null && u.proUntil > now ? 'pro' : 'free';
}
