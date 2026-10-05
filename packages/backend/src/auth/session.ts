import { createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { User, UserRepository } from '../db/users';

export const SESSION_COOKIE = 'st_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  // A missing secret in production would make every session forgeable.
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET não definida. Gere uma com `openssl rand -hex 32` e cadastre na Vercel.');
  }
  return 'dev-only-insecure-secret';
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

/** A compact signed token: base64url(JSON payload) + "." + HMAC-SHA256. */
export function signSession(userId: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

/** The user id inside a valid, unexpired token; otherwise null. */
export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof uid === 'string' && typeof exp === 'number' && exp * 1000 > now ? uid : null;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

const secureCookies = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production';

export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/' });
}

/** Loads the signed-in user (if any) into res.locals.user. */
export function loadUser(users: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = verifySession(readCookie(req, SESSION_COOKIE));
      res.locals.user = uid ? await users.get(uid) : null;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireUser(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.user) return next();
  res.status(401).json({ error: 'Entre na sua conta para continuar.', code: 'AUTH' });
}

export const currentUser = (res: Response): User => res.locals.user as User;
