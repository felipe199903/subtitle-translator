/**
 * Creates (or updates) everything the app needs in a Stripe account. Safe to run again.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup                          # shows the account, changes nothing
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- --confirm acct_123     # applies to that account
 *   ... --url https://subtitle-translator.com.br                                 # site address (default: APP_URL)
 *
 * - Product "Subtitle Translator Pro" with prices (BRL) found by lookup_key:
 *   pro_monthly (R$ 19,90/mês), pro_30d (R$ 19,90 avulso), pro_365d (R$ 179,00 avulso).
 *   Changing an amount below creates a new price and moves the lookup_key to it.
 * - Customer Portal: cancel at period end, update card, invoices, links to terms and privacy.
 * - Webhook endpoint at <url>/api/billing/webhook (prints the signing secret when created).
 * - Launch coupon: 30% off (first 3 months of the subscription, or once on a pass) with the
 *   promotion code LANCAMENTO, 100 uses, valid for 60 days. The site shows it while it is active.
 *
 * Requires --confirm with the account id so it never touches the wrong Stripe account.
 */
import Stripe from 'stripe';

const PRODUCT_ID = 'subtitle_translator_pro';
const PRICES = [
  { lookup_key: 'pro_monthly', unit_amount: 1990, nickname: 'Pro Mensal', recurring: { interval: 'month' as const } },
  { lookup_key: 'pro_30d', unit_amount: 1990, nickname: 'Pro 30 dias (avulso)' },
  { lookup_key: 'pro_365d', unit_amount: 17900, nickname: 'Pro 12 meses (avulso)' },
];
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
];

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Defina STRIPE_SECRET_KEY com a chave da conta Stripe NOVA deste projeto.');
  const site = (arg('url') || process.env.APP_URL || 'https://subtitle-translator.com.br').replace(/\/+$/, '');
  const stripe = new Stripe(key);

  const account = await stripe.accounts.retrieveCurrent();
  const name = account.settings?.dashboard?.display_name || account.business_profile?.name || '(sem nome)';
  console.log(`Conta Stripe: ${account.id} · ${name} · ${key.startsWith('sk_live') ? 'PRODUÇÃO' : 'teste'} · país ${account.country}`);
  if (arg('confirm') !== account.id) {
    console.log(`\nNada foi alterado. Confira se esta é a conta nova do Subtitle Translator e rode de novo com:\n  --confirm ${account.id}`);
    return;
  }
  if (account.country !== 'BR') console.warn('⚠️  A conta não é do Brasil: Pix e BRL podem não estar disponíveis.');

  // Product
  let product = await stripe.products.retrieve(PRODUCT_ID).catch(() => null);
  if (!product) {
    product = await stripe.products.create({
      id: PRODUCT_ID,
      name: 'Subtitle Translator Pro',
      description: 'Tradução de legendas .srt para português (BR) sem limites mensais apertados e com arquivos maiores.',
      url: site,
      statement_descriptor: 'SUBTITLE TRANSLATOR',
    });
    console.log(`✓ Produto criado: ${product.id}`);
  } else {
    console.log(`• Produto já existe: ${product.id}`);
  }

  // Prices
  const existing = await stripe.prices.list({ lookup_keys: PRICES.map(p => p.lookup_key), active: true, limit: 10 });
  for (const p of PRICES) {
    const current = existing.data.find(e => e.lookup_key === p.lookup_key);
    const same =
      current &&
      current.unit_amount === p.unit_amount &&
      current.currency === 'brl' &&
      (current.recurring?.interval ?? null) === (p.recurring?.interval ?? null);
    if (same) {
      console.log(`• Preço ${p.lookup_key} ok (${current!.id})`);
      continue;
    }
    const created = await stripe.prices.create({
      product: PRODUCT_ID,
      currency: 'brl',
      unit_amount: p.unit_amount,
      nickname: p.nickname,
      lookup_key: p.lookup_key,
      transfer_lookup_key: true,
      ...(p.recurring ? { recurring: p.recurring } : {}),
    });
    if (current) await stripe.prices.update(current.id, { active: false });
    console.log(`✓ Preço ${p.lookup_key}: ${created.id} (R$ ${(p.unit_amount / 100).toFixed(2).replace('.', ',')})`);
  }

  // Customer Portal
  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: {
      headline: 'Subtitle Translator — gerencie sua assinatura',
      privacy_policy_url: `${site}/privacidade`,
      terms_of_service_url: `${site}/termos`,
    },
    default_return_url: `${site}/conta`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'unused', 'low_quality', 'switched_service', 'other'],
        },
      },
    },
  };
  const [defaultPortal] = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data;
  if (defaultPortal) {
    await stripe.billingPortal.configurations.update(defaultPortal.id, portal);
    console.log(`✓ Portal do cliente atualizado (${defaultPortal.id})`);
  } else {
    const created = await stripe.billingPortal.configurations.create(portal);
    console.log(`✓ Portal do cliente criado (${created.id}). Se ele não virar o padrão, defina STRIPE_PORTAL_CONFIGURATION=${created.id}`);
  }

  // Webhook
  const url = `${site}/api/billing/webhook`;
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const hook = hooks.data.find(h => h.url === url);
  if (hook) {
    await stripe.webhookEndpoints.update(hook.id, { enabled_events: EVENTS, disabled: false });
    console.log(`✓ Webhook atualizado: ${url} (${hook.id}). O segredo continua o mesmo (veja no Dashboard).`);
  } else {
    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: EVENTS,
      description: 'Subtitle Translator: planos e pagamentos',
    });
    console.log(`✓ Webhook criado: ${url}\n\n  STRIPE_WEBHOOK_SECRET=${created.secret}\n\n  Cadastre esse valor na Vercel (Production) e faça Redeploy.`);
  }

  // Launch coupon
  const COUPON_ID = 'lancamento-30';
  const coupon = await stripe.coupons.retrieve(COUPON_ID).catch(() => null);
  if (!coupon) {
    await stripe.coupons.create({
      id: COUPON_ID,
      name: 'Lançamento 30%',
      percent_off: 30,
      duration: 'repeating',
      duration_in_months: 3,
      applies_to: { products: [PRODUCT_ID] },
    });
    console.log(`✓ Cupom criado: ${COUPON_ID} (30% por 3 meses)`);
  } else {
    console.log(`• Cupom já existe: ${COUPON_ID}`);
  }
  const [promo] = (await stripe.promotionCodes.list({ code: 'LANCAMENTO', limit: 1 })).data;
  if (!promo) {
    const expires = Math.floor(Date.now() / 1000) + 60 * 24 * 3600;
    await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: COUPON_ID },
      code: 'LANCAMENTO',
      max_redemptions: 100,
      expires_at: expires,
    });
    console.log(`✓ Código promocional LANCAMENTO criado (100 usos, até ${new Date(expires * 1000).toLocaleDateString('pt-BR')})`);
  } else {
    console.log(`• Código LANCAMENTO já existe (${promo.active ? 'ativo' : 'inativo'}, ${promo.times_redeemed} usos)`);
  }

  console.log('\nFalta no Dashboard: ativar Pix em Settings → Payment methods e os recibos por e-mail em Settings → Emails.');
}

main().catch(e => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
