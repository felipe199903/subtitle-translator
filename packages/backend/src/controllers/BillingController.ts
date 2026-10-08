import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { User, UserRepository } from '../db/users';
import { currentUser } from '../auth/session';
import { OFFERS, hasLiveSubscription, isOfferKey, planOf } from '../auth/plans';
import { PriceCatalog } from '../billing/stripe';
import { appUrl } from '../config';
import { safe } from './safe';

const NOT_CONFIGURED = 'Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde.';
/** Up to 22 characters together with the account's short descriptor; Latin letters only. */
const STATEMENT_SUFFIX = 'SUBTITLE TRANSL';

const isMissingCustomer = (e: unknown) => {
  const err = e as { code?: string; param?: string; message?: string };
  return err?.code === 'resource_missing' && (err.param === 'customer' || /customer/i.test(err.message ?? ''));
};

/** Stripe Checkout (subscription or one-off Pro pass), the Customer Portal and the webhook. */
export class BillingController {
  private catalog: PriceCatalog | null;

  constructor(
    private users: UserRepository,
    private stripe: Stripe | null,
    private webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  ) {
    this.catalog = stripe ? new PriceCatalog(stripe) : null;
  }

  /** Current prices, so the pricing page always shows what Stripe will charge. */
  prices = safe(async (_req, res) => {
    if (!this.catalog) {
      res.json({ data: null });
      return;
    }
    const [all, promo, pix] = await Promise.all([
      this.catalog.all(),
      this.catalog.promo().catch(() => null),
      this.catalog.pixAvailable().catch(() => false),
    ]);
    const data = Object.fromEntries(
      Object.entries(all).map(([k, p]) => [k, { amount: p!.amount, currency: p!.currency, interval: p!.interval }])
    );
    res.json({ data, promo, pix });
  });

  checkout = safe(async (req, res) => {
    if (!this.stripe || !this.catalog) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }
    const offer = req.body?.plan;
    if (!isOfferKey(offer)) {
      res.status(400).json({ error: 'Plano inválido.' });
      return;
    }
    const user = currentUser(res);
    if (hasLiveSubscription(user)) {
      res.status(409).json({ error: 'Você já tem uma assinatura Pro ativa. Gerencie-a em Minha conta.', code: 'SUBSCRIBED' });
      return;
    }
    if (OFFERS[offer].mode === 'subscription' && planOf(user) === 'pro') {
      res.status(409).json({
        error: 'Seu acesso Pro avulso ainda está ativo. Assine quando ele terminar, ou compre mais dias.',
        code: 'PASS_ACTIVE',
      });
      return;
    }
    const price = await this.catalog.get(offer);
    if (!price) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }

    const base = appUrl(req);
    const mode = OFFERS[offer].mode;
    // Payment methods come from the Dashboard (card + Pix); Stripe only offers recurring-capable
    // ones for subscriptions, so Pix shows up for the one-off passes.
    const create = (customer: string) => this.stripe!.checkout.sessions.create({
      mode,
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      locale: 'pt-BR',
      allow_promotion_codes: true,
      metadata: { userId: user.id, plan: offer },
      // The session id lets /conta confirm the purchase at once (POST /sync) instead of waiting for the webhook.
      success_url: `${base}/conta?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/precos`,
      custom_text: {
        submit: { message: `Ao continuar, você concorda com os Termos de Uso (${base}/termos) e a Política de Privacidade (${base}/privacidade).` },
      },
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { userId: user.id }, billing_mode: { type: 'flexible' as const } } }
        : {
            payment_intent_data: {
              metadata: { userId: user.id, plan: offer },
              // Stripe e-mails the receipt for one-off passes without any Dashboard setting.
              receipt_email: user.email,
              // Card statements show the product next to the account's descriptor.
              statement_descriptor_suffix: STATEMENT_SUFFIX,
            },
          }),
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await create(user.stripeCustomerId ?? (await this.newCustomer(user)));
    } catch (e) {
      // A customer saved under another Stripe account or mode (e.g. test → live) does not exist here.
      if (!user.stripeCustomerId || !isMissingCustomer(e)) throw e;
      session = await create(await this.newCustomer(user));
    }
    res.json({ data: { url: session.url } });
  });

  private async newCustomer(user: User): Promise<string> {
    const customer = await this.stripe!.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
      preferred_locales: ['pt-BR'],
    });
    await this.users.setStripeCustomer(user.id, customer.id);
    return customer.id;
  }

  portal = safe(async (req, res) => {
    const user = currentUser(res);
    if (!this.stripe) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }
    if (!user.stripeCustomerId) {
      res.status(400).json({ error: 'Você ainda não tem compras para gerenciar.' });
      return;
    }
    const session = await this.stripe.billingPortal.sessions
      .create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl(req)}/conta`,
        ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
      })
      .catch(e => {
        if (isMissingCustomer(e)) return null;
        throw e;
      });
    if (!session) {
      res.status(400).json({ error: 'Você ainda não tem compras para gerenciar.' });
      return;
    }
    res.json({ data: { url: session.url } });
  });

  /**
   * Called by /conta right after Checkout returns: reads the session from Stripe and applies the
   * purchase now, so the customer sees Pro without waiting for the webhook. Both paths are idempotent.
   */
  sync = safe(async (req, res) => {
    const sessionId = req.body?.sessionId;
    if (!this.stripe) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }
    if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      res.status(400).json({ error: 'Sessão de pagamento inválida.' });
      return;
    }
    const user = currentUser(res);
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] }).catch(() => null);
    if (!session || session.client_reference_id !== user.id) {
      res.status(404).json({ error: 'Pagamento não encontrado.' });
      return;
    }
    if (session.mode === 'payment' && session.payment_status === 'paid') await this.grantPass(session);
    if (session.mode === 'subscription' && session.subscription && typeof session.subscription !== 'string') {
      await this.applySubscription(session.subscription, Math.floor(Date.now() / 1000));
    }
    // Pix may still be pending here: the webhook finishes it when the bank confirms.
    res.json({ data: { status: session.payment_status } });
  });

  /** Mounted with express.raw(): the signature is computed over the exact bytes Stripe sent. */
  webhook = async (req: Request, res: Response) => {
    if (!this.stripe || !this.webhookSecret) {
      res.status(503).json({ error: 'Webhook não configurado.' });
      return;
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, this.webhookSecret);
    } catch (e) {
      res.status(400).json({ error: `Assinatura inválida: ${e instanceof Error ? e.message : e}` });
      return;
    }

    try {
      if (!(await this.users.recordEvent(event.id, event.type))) {
        res.json({ received: true, duplicate: true });
        return;
      }
      await this.handle(event);
      res.json({ received: true });
    } catch (e) {
      // Forget the event so Stripe's retry processes it again.
      await this.users.forgetEvent(event.id).catch(() => {});
      console.error(`Webhook ${event.type} (${event.id}) falhou:`, e);
      res.status(500).json({ error: 'Falha ao processar o evento.' });
    }
  };

  private async handle(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        // Pix completes the session first as "unpaid" and confirms later with async_payment_succeeded.
        if (s.mode === 'payment' && s.payment_status === 'paid') await this.grantPass(s);
        return;
      }
      case 'checkout.session.async_payment_failed':
        console.warn(`Pagamento assíncrono falhou na sessão ${event.data.object.id}`);
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await this.applySubscription(
          event.type === 'customer.subscription.deleted' ? { ...sub, status: 'canceled' } : sub,
          event.created
        );
        return;
      }
      case 'invoice.paid': {
        // Each renewal: refresh the subscription (new period end) from Stripe.
        const ref = event.data.object.parent?.subscription_details?.subscription;
        if (!ref || !this.stripe) return;
        const sub = typeof ref === 'string' ? await this.stripe.subscriptions.retrieve(ref) : ref;
        await this.applySubscription(sub, event.created);
        return;
      }
      case 'invoice.payment_failed':
        // Stripe's Smart Retries and failed-payment e-mails handle recovery; status comes via subscription.updated.
        console.warn(`Cobrança recusada: fatura ${event.data.object.id}`);
        return;
    }
  }

  private async applySubscription(sub: Stripe.Subscription, eventAt: number): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const user =
      (await this.users.findByCustomer(customerId)) ??
      (sub.metadata?.userId ? await this.users.get(sub.metadata.userId) : null);
    if (!user) {
      // E.g. the account was deleted; nothing to update, and retrying would not help.
      console.warn(`Assinatura ${sub.id} de um cliente sem conta (${customerId}).`);
      return;
    }
    await this.users.applySubscription(user.id, {
      id: sub.id,
      status: sub.status,
      periodEnd: sub.items?.data?.[0]?.current_period_end ?? null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      eventAt,
    });
  }

  /** Adds the pass's days once per Checkout Session, whether the webhook or /sync gets there first. */
  private async grantPass(s: Stripe.Checkout.Session): Promise<void> {
    const offer = s.metadata?.plan;
    const userId = s.client_reference_id ?? s.metadata?.userId;
    const pass = isOfferKey(offer) ? OFFERS[offer] : null;
    if (!pass || pass.mode !== 'payment' || !userId) throw new Error(`Sessão ${s.id} sem plano ou usuário válido.`);
    if (!(await this.users.get(userId))) {
      console.warn(`Pagamento da sessão ${s.id} para um usuário que não existe mais (${userId}).`);
      return;
    }
    const key = `grant:${s.id}`;
    if (!(await this.users.recordEvent(key, 'pass_granted'))) return;
    try {
      await this.users.extendPro(userId, pass.days);
    } catch (e) {
      await this.users.forgetEvent(key).catch(() => {});
      throw e;
    }
  }
}
