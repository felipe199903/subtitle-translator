import { randomUUID } from 'crypto';
import { Db } from './client';

export interface User {
  id: string;
  email: string;
  name: string | null;
  googleSub: string | null;
  stripeCustomerId: string | null;
  subId: string | null;
  subStatus: string | null;
  subPeriodEnd: number | null;
  subCancelAtEnd: boolean;
  proUntil: number | null;
  createdAt: number;
}

/** A Stripe subscription reduced to what decides the plan. */
export interface SubscriptionSnapshot {
  id: string;
  status: string;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** Stripe's event timestamp (seconds); older snapshots never overwrite newer ones. */
  eventAt: number;
}

const COLUMNS = `id, email, name, google_sub, stripe_customer_id, sub_id, sub_status, sub_period_end,
  sub_cancel_at_end, pro_until, created_at`;

/** The current month for quotas, e.g. "2026-10" (UTC). */
export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);

/** Accounts, magic-link tokens, monthly usage and processed Stripe events. */
export class UserRepository {
  constructor(private db: Db) {}

  async get(id: string): Promise<User | null> {
    if (!isUuid(id)) return null;
    const [r] = await this.db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return r ? rowToUser(r) : null;
  }

  async findByCustomer(customerId: string): Promise<User | null> {
    const [r] = await this.db.query(`SELECT ${COLUMNS} FROM users WHERE stripe_customer_id = $1`, [customerId]);
    return r ? rowToUser(r) : null;
  }

  /** Signs in or signs up: the e-mail is the account. */
  async findOrCreateByEmail(email: string, name: string | null = null): Promise<User> {
    const [r] = await this.db.query(
      `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name)
       RETURNING ${COLUMNS}`,
      [randomUUID(), normalizeEmail(email), name]
    );
    return rowToUser(r);
  }

  async linkGoogle(id: string, googleSub: string, name: string | null): Promise<void> {
    await this.db.query(`UPDATE users SET google_sub = $2, name = COALESCE($3, name) WHERE id = $1`, [id, googleSub, name]);
  }

  async setStripeCustomer(id: string, customerId: string): Promise<void> {
    await this.db.query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [id, customerId]);
  }

  /** Stores the subscription state unless a newer event already did. */
  async applySubscription(userId: string, s: SubscriptionSnapshot): Promise<void> {
    await this.db.query(
      `UPDATE users SET sub_id = $2, sub_status = $3, sub_period_end = to_timestamp($4), sub_cancel_at_end = $5,
         sub_event_at = $6
       WHERE id = $1 AND sub_event_at <= $6`,
      [userId, s.id, s.status, s.periodEnd, s.cancelAtPeriodEnd, s.eventAt]
    );
  }

  /** Adds days of Pro, counting from the current expiry when it is still in the future. */
  async extendPro(userId: string, days: number): Promise<void> {
    await this.db.query(
      `UPDATE users SET pro_until = GREATEST(COALESCE(pro_until, now()), now()) + make_interval(days => $2)
       WHERE id = $1`,
      [userId, days]
    );
  }

  async usageThisMonth(userId: string): Promise<number> {
    const [r] = await this.db.query(`SELECT files FROM usage WHERE user_id = $1 AND month = $2`, [userId, monthKey()]);
    return r?.files ?? 0;
  }

  async incrementUsage(userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO usage (user_id, month, files) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, month) DO UPDATE SET files = usage.files + 1`,
      [userId, monthKey()]
    );
  }

  /** Deletes the account, its jobs and usage (LGPD: right to erasure). */
  async delete(id: string): Promise<void> {
    const [u] = await this.db.query(`DELETE FROM users WHERE id = $1 RETURNING email`, [id]);
    if (u) await this.db.query(`DELETE FROM login_tokens WHERE email = $1`, [u.email]);
  }

  async createLoginToken(email: string, tokenHash: string, ttlMinutes: number): Promise<void> {
    await this.db.query(
      `INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [tokenHash, normalizeEmail(email), ttlMinutes]
    );
  }

  /** Removes a token whose e-mail could not be sent, so it does not count against the hourly limit. */
  async deleteLoginToken(tokenHash: string): Promise<void> {
    await this.db.query(`DELETE FROM login_tokens WHERE token_hash = $1`, [tokenHash]);
  }

  async loginTokensSince(email: string, minutes: number): Promise<number> {
    const [r] = await this.db.query(
      `SELECT COUNT(*)::int AS n FROM login_tokens WHERE email = $1 AND created_at > now() - make_interval(mins => $2)`,
      [normalizeEmail(email), minutes]
    );
    return r?.n ?? 0;
  }

  /** Marks a magic-link token as used and returns its e-mail, or null when invalid, used or expired. */
  async consumeLoginToken(tokenHash: string): Promise<string | null> {
    const [r] = await this.db.query(
      `UPDATE login_tokens SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING email`,
      [tokenHash]
    );
    // Old tokens are useless after a day; clean them up opportunistically.
    await this.db.query(`DELETE FROM login_tokens WHERE created_at < now() - interval '1 day'`);
    return r?.email ?? null;
  }

  /** Records a Stripe event id; false when it was already recorded (a retry or duplicate delivery). */
  async recordEvent(id: string, type: string): Promise<boolean> {
    const rows = await this.db.query(
      `INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, type]
    );
    return rows.length > 0;
  }

  async forgetEvent(id: string): Promise<void> {
    await this.db.query(`DELETE FROM stripe_events WHERE id = $1`, [id]);
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const time = (v: unknown) => (v == null ? null : new Date(v as string).getTime());

function rowToUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? null,
    googleSub: r.google_sub ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    subId: r.sub_id ?? null,
    subStatus: r.sub_status ?? null,
    subPeriodEnd: time(r.sub_period_end),
    subCancelAtEnd: !!r.sub_cancel_at_end,
    proUntil: time(r.pro_until),
    createdAt: new Date(r.created_at).getTime(),
  };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
