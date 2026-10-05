import { Request } from 'express';

/**
 * The public site address used in e-mails and Stripe redirects. Production sets
 * APP_URL=https://subtitle-translator.com.br; local dev falls back to FRONTEND_URL (the Angular dev server).
 */
export function appUrl(req: Request): string {
  const configured = process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0];
  return (configured?.trim() || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
