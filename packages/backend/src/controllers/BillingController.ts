import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { UserRepository } from '../db/users';
import { currentUser } from '../auth/session';
import { OFFERS, hasLiveSubscription, isOfferKey, planOf } from '../auth/plans';
import { PriceCatalog } from '../billing/stripe';
import { appUrl } from '../config';
import { safe } from './safe';

const NOT_CONFIGURED = 'Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde.';

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
    const [all, promo] = await Promise.all([this.catalog.all(), this.catalog.promo().catch(() => null)]);
    const data = Object.fromEntries(
      Object.entries(all).map(([k, p]) => [k, { amount: p!.amount, currency: p!.currency, interval: p!.interval }])
    );
    res.json({ data, promo });
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

    let customer = user.stripeCustomerId;
    if (!customer) {
      customer = (await this.stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
        preferred_locales: ['pt-BR'],
      })).id;
      await this.users.setStripeCustomer(user.id, customer);
    }

    const base = appUrl(req);
    const mode = OFFERS[offer].mode;
    // Payment methods come from the Dashboard (card + Pix); Stripe only offers recurring-capable
    // ones for subscriptions, so Pix shows up for the one-off passes.
    const session = await this.stripe.checkout.sessions.create({
      mode,
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      locale: 'pt-BR',
      allow_promotion_codes: true,
      metadata: { userId: user.id, plan: offer },
      success_url: `${base}/conta?checkout=ok`,
      cancel_url: `${base}/precos`,
      custom_text: {
        submit: { message: `Ao continuar, você concorda com os Termos de Uso (${base}/termos) e a Política de Privacidade (${base}/privacidade).` },
      },
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { userId: user.id } } }
        : { payment_intent_data: { metadata: { userId: user.id, plan: offer } } }),
    });
    res.json({ data: { url: session.url } });
  });

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
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl(req)}/conta`,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
    });
    res.json({ data: { url: session.url } });
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
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
          periodEnd: sub.items?.data?.[0]?.current_period_end ?? null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          eventAt: event.created,
        });
        return;
      }
      case 'invoice.payment_failed':
        console.warn(`Cobrança recusada: fatura ${event.data.object.id}`);
        return;
    }
  }

  private async grantPass(s: Stripe.Checkout.Session): Promise<void> {
    const offer = s.metadata?.plan;
    const userId = s.client_reference_id ?? s.metadata?.userId;
    const pass = isOfferKey(offer) ? OFFERS[offer] : null;
    if (!pass || pass.mode !== 'payment' || !userId) throw new Error(`Sessão ${s.id} sem plano ou usuário válido.`);
    if (!(await this.users.get(userId))) {
      console.warn(`Pagamento da sessão ${s.id} para um usuário que não existe mais (${userId}).`);
      return;
    }
    await this.users.extendPro(userId, pass.days);
  }
}
