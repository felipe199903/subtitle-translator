import request from 'supertest';
import Stripe from 'stripe';
import { createApp } from '../app';
import { FakeProvider, signIn, useTestDb } from '../__tests__/fixtures';
import { UserRepository } from '../db/users';

const t = useTestDb();
const SECRET = 'whsec_test_secret';
// Only used offline: webhook signatures are verified locally.
const realStripe = new Stripe('sk_test_offline');

const DAY = 24 * 3600 * 1000;

/** A stand-in for the few Stripe calls checkout makes, recording what was sent. */
function fakeStripe() {
  const calls: Record<string, any[]> = { sessions: [], customers: [], portal: [] };
  const prices = [
    { id: 'price_m', lookup_key: 'pro_monthly', unit_amount: 1990, currency: 'brl', recurring: { interval: 'month' } },
    { id: 'price_30', lookup_key: 'pro_30d', unit_amount: 1990, currency: 'brl', recurring: null },
    { id: 'price_365', lookup_key: 'pro_365d', unit_amount: 17900, currency: 'brl', recurring: null },
  ];
  const stripe = {
    prices: { list: async () => ({ data: prices }) },
    promotionCodes: {
      list: async () => ({
        data: [{ code: 'LANCAMENTO', expires_at: null, promotion: { coupon: { percent_off: 30, duration: 'repeating', duration_in_months: 3 } } }],
      }),
    },
    customers: { create: async (p: any) => (calls.customers.push(p), { id: 'cus_123' }) },
    checkout: {
      sessions: {
        create: async (p: any) => (calls.sessions.push(p), { url: 'https://checkout.stripe.com/c/pay/x' }),
        retrieve: async (id: string) => {
          const s = checkoutSessions.get(id);
          if (!s) throw new Error('No such checkout session');
          return s;
        },
      },
    },
    billingPortal: { sessions: { create: async (p: any) => (calls.portal.push(p), { url: 'https://billing.stripe.com/p/x' }) } },
    webhooks: realStripe.webhooks,
    subscriptions: {
      cancel: async () => ({}),
      retrieve: async (id: string) => {
        const s = subscriptions.get(id);
        if (!s) throw new Error('No such subscription');
        return s;
      },
    },
  };
  const checkoutSessions = new Map<string, any>();
  const subscriptions = new Map<string, any>();
  return { stripe: stripe as unknown as Stripe, calls, checkoutSessions, subscriptions };
}

const makeApp = (stripe: Stripe | null = fakeStripe().stripe) =>
  createApp({ db: t.db, primary: new FakeProvider(), fallback: null, stripe, stripeWebhookSecret: SECRET });

let seq = 0;
function send(app: any, type: string, object: any, opts: { id?: string; created?: number } = {}) {
  const payload = JSON.stringify({
    id: opts.id ?? `evt_${++seq}`,
    object: 'event',
    type,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    data: { object },
  });
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
}

const me = async (app: any, cookie: string) => (await request(app).get('/api/auth/me').set('Cookie', cookie)).body.data;

describe('checkout', () => {
  it('needs Stripe, a session and a valid plan', async () => {
    const { cookie } = await signIn(t.db);
    await request(makeApp(null)).post('/api/billing/checkout').set('Cookie', cookie).send({ plan: 'pro_30d' }).expect(503);
    await request(makeApp()).post('/api/billing/checkout').send({ plan: 'pro_30d' }).expect(401);
    await request(makeApp()).post('/api/billing/checkout').set('Cookie', cookie).send({ plan: 'gold' }).expect(400);
  });

  it('creates a customer once and opens Checkout for a pass or a subscription', async () => {
    const { stripe, calls } = fakeStripe();
    const app = makeApp(stripe);
    const { user, cookie } = await signIn(t.db);

    const res = await request(app).post('/api/billing/checkout').set('Cookie', cookie).send({ plan: 'pro_30d' }).expect(200);
    expect(res.body.data.url).toMatch(/checkout\.stripe\.com/);
    expect(calls.customers).toHaveLength(1);
    expect(calls.sessions[0]).toMatchObject({
      mode: 'payment',
      customer: 'cus_123',
      client_reference_id: user.id,
      line_items: [{ price: 'price_30', quantity: 1 }],
      locale: 'pt-BR',
      metadata: { plan: 'pro_30d', userId: user.id },
      payment_intent_data: { receipt_email: 'ana@example.com' },
    });

    await request(app).post('/api/billing/checkout').set('Cookie', cookie).send({ plan: 'pro_monthly' }).expect(200);
    expect(calls.customers).toHaveLength(1);
    expect(calls.sessions[1]).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_m', quantity: 1 }],
      subscription_data: { billing_mode: { type: 'flexible' } },
    });
    // /conta receives the session id to confirm the purchase without waiting for the webhook.
    expect(calls.sessions[1].success_url).toMatch(/\/conta\?checkout=ok&session_id=\{CHECKOUT_SESSION_ID\}$/);

    const body = (await request(app).get('/api/billing/prices').expect(200)).body;
    expect(body.data.pro_365d).toEqual({ amount: 17900, currency: 'brl', interval: null });
    expect(body.promo).toEqual({ code: 'LANCAMENTO', percentOff: 30, months: 3, expiresAt: null });
  });

  it('does not sell a second subscription, and opens the portal for customers', async () => {
    const { stripe, calls } = fakeStripe();
    const app = makeApp(stripe);
    const { user, cookie } = await signIn(t.db);
    await request(app).post('/api/billing/portal').set('Cookie', cookie).expect(400);

    const users = new UserRepository(t.db);
    await users.setStripeCustomer(user.id, 'cus_123');
    await users.applySubscription(user.id, { id: 'sub_1', status: 'active', periodEnd: null, cancelAtPeriodEnd: false, eventAt: 1 });
    const res = await request(app).post('/api/billing/checkout').set('Cookie', cookie).send({ plan: 'pro_monthly' }).expect(409);
    expect(res.body.code).toBe('SUBSCRIBED');

    await request(app).post('/api/billing/portal').set('Cookie', cookie).expect(200);
    expect(calls.portal[0]).toMatchObject({ customer: 'cus_123' });
  });
});

describe('webhook', () => {
  it('rejects bad signatures', async () => {
    const app = makeApp();
    await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', 't=1,v1=bad').send('{}').expect(400);
  });

  it('grants a paid pass once, even if the event is delivered twice', async () => {
    const app = makeApp();
    const { user, cookie } = await signIn(t.db);
    const session = { id: 'cs_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', client_reference_id: user.id, metadata: { plan: 'pro_30d', userId: user.id } };

    await send(app, 'checkout.session.completed', session, { id: 'evt_dup' }).expect(200);
    const first = await me(app, cookie);
    expect(first.plan).toBe('pro');
    expect(first.proUntil).toBeGreaterThan(Date.now() + 29 * DAY);

    expect((await send(app, 'checkout.session.completed', session, { id: 'evt_dup' }).expect(200)).body.duplicate).toBe(true);
    expect((await me(app, cookie)).proUntil).toBe(first.proUntil);
  });

  it('waits for Pix to be confirmed, and stacks passes', async () => {
    const app = makeApp();
    const { user, cookie } = await signIn(t.db);
    const session = { id: 'cs_pix', object: 'checkout.session', mode: 'payment', payment_status: 'unpaid', client_reference_id: user.id, metadata: { plan: 'pro_365d' } };

    await send(app, 'checkout.session.completed', session).expect(200);
    expect((await me(app, cookie)).plan).toBe('free');

    await send(app, 'checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' }).expect(200);
    await send(app, 'checkout.session.completed', { ...session, id: 'cs_more', payment_status: 'paid', metadata: { plan: 'pro_30d' } }).expect(200);
    const after = await me(app, cookie);
    expect(after.plan).toBe('pro');
    expect(after.proUntil).toBeGreaterThan(Date.now() + 394 * DAY);
  });

  it('follows the subscription lifecycle and ignores stale events', async () => {
    const app = makeApp();
    const { user, cookie } = await signIn(t.db);
    await new UserRepository(t.db).setStripeCustomer(user.id, 'cus_abc');
    const periodEnd = Math.floor((Date.now() + 30 * DAY) / 1000);
    const sub = (status: string, extra: any = {}) => ({
      id: 'sub_1', object: 'subscription', customer: 'cus_abc', status, cancel_at_period_end: false,
      items: { data: [{ current_period_end: periodEnd }] }, metadata: {}, ...extra,
    });

    await send(app, 'customer.subscription.created', sub('active'), { created: 100 }).expect(200);
    expect(await me(app, cookie)).toMatchObject({ plan: 'pro', subscription: { status: 'active', cancelAtPeriodEnd: false, periodEnd: periodEnd * 1000 } });

    await send(app, 'customer.subscription.updated', sub('active', { cancel_at_period_end: true }), { created: 200 }).expect(200);
    expect((await me(app, cookie)).subscription.cancelAtPeriodEnd).toBe(true);

    // A late, older event must not undo the newer state.
    await send(app, 'customer.subscription.updated', sub('incomplete'), { created: 150 }).expect(200);
    expect((await me(app, cookie)).subscription.status).toBe('active');

    await send(app, 'customer.subscription.deleted', sub('canceled'), { created: 300 }).expect(200);
    expect(await me(app, cookie)).toMatchObject({ plan: 'free', subscription: { status: 'canceled' } });
  });

  it('acknowledges events for unknown customers without retry loops', async () => {
    const app = makeApp();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await send(app, 'customer.subscription.created', { id: 'sub_x', customer: 'cus_gone', status: 'active', items: { data: [] }, metadata: {} }).expect(200);
    warn.mockRestore();
  });
});

describe('confirming a purchase right after Checkout', () => {
  it('grants a paid pass at once, only for its owner, and the webhook does not grant it again', async () => {
    const { stripe, checkoutSessions } = fakeStripe();
    const app = makeApp(stripe);
    const ana = await signIn(t.db, 'ana@example.com');
    const bia = await signIn(t.db, 'bia@example.com');
    const session = { id: 'cs_sync1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', client_reference_id: ana.user.id, metadata: { plan: 'pro_30d' } };
    checkoutSessions.set(session.id, session);

    await request(app).post('/api/billing/sync').send({ sessionId: 'cs_sync1' }).expect(401);
    await request(app).post('/api/billing/sync').set('Cookie', ana.cookie).send({ sessionId: 'not a session' }).expect(400);
    await request(app).post('/api/billing/sync').set('Cookie', bia.cookie).send({ sessionId: 'cs_sync1' }).expect(404);
    expect((await me(app, bia.cookie)).plan).toBe('free');

    await request(app).post('/api/billing/sync').set('Cookie', ana.cookie).send({ sessionId: 'cs_sync1' }).expect(200);
    const after = await me(app, ana.cookie);
    expect(after.plan).toBe('pro');

    // The webhook for the same session arrives later: no extra 30 days.
    await send(app, 'checkout.session.completed', session).expect(200);
    await request(app).post('/api/billing/sync').set('Cookie', ana.cookie).send({ sessionId: 'cs_sync1' }).expect(200);
    expect((await me(app, ana.cookie)).proUntil).toBe(after.proUntil);
  });

  it('activates a subscription from the session, without waiting for the webhook', async () => {
    const { stripe, checkoutSessions } = fakeStripe();
    const app = makeApp(stripe);
    const { user, cookie } = await signIn(t.db);
    await new UserRepository(t.db).setStripeCustomer(user.id, 'cus_sync');
    const periodEnd = Math.floor((Date.now() + 30 * DAY) / 1000);
    checkoutSessions.set('cs_sub', {
      id: 'cs_sub', mode: 'subscription', payment_status: 'paid', client_reference_id: user.id,
      subscription: { id: 'sub_9', customer: 'cus_sync', status: 'active', cancel_at_period_end: false, metadata: {}, items: { data: [{ current_period_end: periodEnd }] } },
    });
    expect((await request(app).post('/api/billing/sync').set('Cookie', cookie).send({ sessionId: 'cs_sub' }).expect(200)).body.data.status).toBe('paid');
    expect(await me(app, cookie)).toMatchObject({ plan: 'pro', subscription: { status: 'active', periodEnd: periodEnd * 1000 } });
  });
});

describe('renewals', () => {
  it('refreshes the period end on invoice.paid', async () => {
    const { stripe, subscriptions } = fakeStripe();
    const app = makeApp(stripe);
    const { user, cookie } = await signIn(t.db);
    await new UserRepository(t.db).setStripeCustomer(user.id, 'cus_r');
    const first = Math.floor((Date.now() + 30 * DAY) / 1000);
    const sub = { id: 'sub_r', object: 'subscription', customer: 'cus_r', status: 'active', cancel_at_period_end: false, metadata: {}, items: { data: [{ current_period_end: first }] } };
    await send(app, 'customer.subscription.created', sub, { created: 100 }).expect(200);

    const next = first + 30 * 24 * 3600;
    subscriptions.set('sub_r', { ...sub, items: { data: [{ current_period_end: next }] } });
    await send(app, 'invoice.paid', { id: 'in_1', object: 'invoice', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_r' } } }, { created: 200 }).expect(200);
    expect((await me(app, cookie)).subscription.periodEnd).toBe(next * 1000);

    // A one-off invoice (no subscription) is ignored.
    await send(app, 'invoice.paid', { id: 'in_2', object: 'invoice', parent: null }, { created: 300 }).expect(200);
  });
});
