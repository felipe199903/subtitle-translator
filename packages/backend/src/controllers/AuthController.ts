import { createHash, randomBytes } from 'crypto';
import type Stripe from 'stripe';
import { User, UserRepository, normalizeEmail } from '../db/users';
import { clearSessionCookie, currentUser, setSessionCookie } from '../auth/session';
import { LIMITS, hasLiveSubscription, planOf } from '../auth/plans';
import { Mailer, magicLinkEmail } from '../auth/mailer';
import { appUrl } from '../config';
import { safe } from './safe';

const TOKEN_TTL_MINUTES = 15;
const MAX_LINKS_PER_HOUR = 3;

/** Verifies a Google Identity Services credential (ID token) and returns its verified e-mail. */
export type GoogleVerifier = (credential: string) => Promise<{ email: string; name: string | null; sub: string } | null>;

export const googleVerifierFromEnv = (): GoogleVerifier | null => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  return async credential => {
    const { OAuth2Client } = await import('google-auth-library');
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) return null;
    return { email: p.email, name: p.name ?? null, sub: p.sub };
  };
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class AuthController {
  constructor(
    private users: UserRepository,
    private mailer: Mailer,
    private verifyGoogle: GoogleVerifier | null,
    private stripe: Stripe | null
  ) {}

  /** Public settings the login page needs. */
  config = safe(async (_req, res) => {
    res.json({
      data: {
        googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
        // The site only advertises AI translation on Pro when it is actually configured.
        aiEngine: !!process.env.GEMINI_API_KEY?.trim(),
      },
    });
  });

  me = safe(async (_req, res) => {
    const user = res.locals.user as User | null;
    if (!user) {
      res.json({ data: null });
      return;
    }
    res.json({ data: await this.view(user) });
  });

  google = safe(async (req, res) => {
    const credential = req.body?.credential;
    if (!this.verifyGoogle) {
      res.status(503).json({ error: 'Login com Google ainda não está configurado.' });
      return;
    }
    if (typeof credential !== 'string' || !credential) {
      res.status(400).json({ error: 'Credencial do Google ausente.' });
      return;
    }
    const profile = await this.verifyGoogle(credential).catch(() => null);
    if (!profile) {
      res.status(401).json({ error: 'Não foi possível confirmar sua conta Google. Tente novamente.' });
      return;
    }
    const user = await this.users.findOrCreateByEmail(profile.email, profile.name);
    await this.users.linkGoogle(user.id, profile.sub, profile.name);
    setSessionCookie(res, user.id);
    res.json({ data: await this.view((await this.users.get(user.id))!) });
  });

  magicLink = safe(async (req, res) => {
    const raw = req.body?.email;
    const email = typeof raw === 'string' ? normalizeEmail(raw) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if ((await this.users.loginTokensSince(email, 60)) >= MAX_LINKS_PER_HOUR) {
      res.status(429).json({ error: 'Já enviamos alguns links para este e-mail. Aguarde um pouco e verifique sua caixa de entrada.' });
      return;
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    await this.users.createLoginToken(email, tokenHash, TOKEN_TTL_MINUTES);
    // The link opens a page that confirms with a POST, so e-mail scanners that prefetch links don't burn it.
    const { subject, html, text } = magicLinkEmail(`${appUrl(req)}/entrar/confirmar?token=${token}`);
    try {
      await this.mailer(email, subject, html, text);
    } catch (e) {
      console.error('Falha ao enviar o link de acesso:', e);
      // A link that never left must not use up one of the person's tries for the hour.
      await this.users.deleteLoginToken(tokenHash).catch(() => {});
      res.status(503).json({ error: 'Não conseguimos enviar o e-mail agora. Tente entrar com o Google ou tente de novo em alguns minutos.' });
      return;
    }
    res.json({ data: { sent: true } });
  });

  verify = safe(async (req, res) => {
    const token = req.body?.token;
    const email = typeof token === 'string' && token ? await this.users.consumeLoginToken(hashToken(token)) : null;
    if (!email) {
      res.status(400).json({ error: 'Este link é inválido, expirou ou já foi usado. Peça um novo.' });
      return;
    }
    const user = await this.users.findOrCreateByEmail(email);
    setSessionCookie(res, user.id);
    res.json({ data: await this.view(user) });
  });

  logout = safe(async (_req, res) => {
    clearSessionCookie(res);
    res.json({ data: { ok: true } });
  });

  /** Cancels any subscription and erases the account (LGPD). Stripe keeps its own payment records. */
  deleteAccount = safe(async (_req, res) => {
    const user = currentUser(res);
    if (user.subId && hasLiveSubscription(user) && this.stripe) {
      await this.stripe.subscriptions.cancel(user.subId);
    }
    await this.users.delete(user.id);
    clearSessionCookie(res);
    res.json({ data: { deleted: true } });
  });

  private async view(user: User) {
    const plan = planOf(user);
    return {
      email: user.email,
      name: user.name,
      plan,
      limits: LIMITS[plan],
      usage: { files: await this.users.usageThisMonth(user.id) },
      proUntil: user.proUntil,
      subscription: user.subStatus
        ? { status: user.subStatus, periodEnd: user.subPeriodEnd, cancelAtPeriodEnd: user.subCancelAtEnd }
        : null,
      hasBillingAccount: !!user.stripeCustomerId,
    };
  }
}
