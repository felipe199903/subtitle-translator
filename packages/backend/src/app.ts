import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createSubtitleRoutes } from './routes/subtitleRoutes';
import { errorHandler } from './middleware/errorHandler';
import { JobController } from './controllers/JobController';
import { Db, getDb } from './db/client';
import { JobRepository } from './db/jobs';
import { MemoryRepository } from './db/memory';
import { TranslationPipeline } from './translation/TranslationPipeline';
import { TranslationProvider } from './translation/TranslationProvider';
import { GoogleFreeProvider } from './translation/GoogleFreeProvider';
import { MyMemoryProvider } from './translation/MyMemoryProvider';
import { GeminiProvider } from './translation/GeminiProvider';
import { withDeadline } from './translation/TranslationProvider';
import type Stripe from 'stripe';
import { UserRepository } from './db/users';
import { loadUser } from './auth/session';
import { Mailer, resendMailer } from './auth/mailer';
import { AuthController, GoogleVerifier, googleVerifierFromEnv } from './controllers/AuthController';
import { BillingController } from './controllers/BillingController';
import { createAuthRoutes } from './routes/authRoutes';
import { createBillingRoutes } from './routes/billingRoutes';
import { stripeFromEnv } from './billing/stripe';

export interface AppDeps {
  db?: Db;
  primary?: TranslationProvider;
  fallback?: TranslationProvider | null;
  /** Pro plan's main engine; defaults to Gemini when GEMINI_API_KEY is set, null = same as free. */
  proPrimary?: TranslationProvider | null;
  /** Defaults to STRIPE_SECRET_KEY; null disables payments. */
  stripe?: Stripe | null;
  stripeWebhookSecret?: string;
  mailer?: Mailer;
  google?: GoogleVerifier | null;
}

export function createApp({
  db = getDb(),
  primary,
  fallback,
  proPrimary = geminiFromEnv(),
  stripe = stripeFromEnv(),
  stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  mailer = resendMailer,
  google = googleVerifierFromEnv(),
}: AppDeps = {}) {
  const memory = new MemoryRepository(db);
  const users = new UserRepository(db);
  const pipeline = new TranslationPipeline(
    memory,
    primary ?? new GoogleFreeProvider(),
    fallback === null ? undefined : (fallback ?? new MyMemoryProvider())
  );
  // Pro: AI translation with context, the free engine as its fallback; never served free-tier cache.
  const proPipeline = proPrimary
    ? new TranslationPipeline(memory, proPrimary, primary ?? new GoogleFreeProvider(), {
        memoryOrigin: 'ai',
        acceptMemory: ['user', 'ai'],
      })
    : pipeline;
  const controller = new JobController(new JobRepository(db), memory, pipeline, users, proPipeline, !!proPrimary);
  const auth = new AuthController(users, mailer, google, stripe);
  const billing = new BillingController(users, stripe, stripeWebhookSecret);

  const app = express();
  app.use(helmet());
  // In production the frontend is served from the same origin; CORS only matters in local dev.
  if (process.env.FRONTEND_URL) {
    app.use(
      cors({
        origin: process.env.FRONTEND_URL.split(',').map(s => s.trim()),
        exposedHeaders: ['Content-Disposition'],
      })
    );
  }
  // Before express.json: Stripe signs the raw body.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), billing.webhook);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', loadUser(users));

  app.use('/api/auth', createAuthRoutes(auth));
  app.use('/api/billing', createBillingRoutes(billing));
  app.use('/api/subtitles', createSubtitleRoutes(controller));
  // Also checks the database, so it doubles as a post-deploy check.
  app.get(['/health', '/api/health'], async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'OK', database: 'ok' });
    } catch (e) {
      // Driver errors may contain connection details, so only the known setup hint is shown.
      console.error('Health check: banco indisponível:', e);
      const msg = e instanceof Error ? e.message : '';
      res.status(503).json({ status: 'ERROR', database: msg.startsWith('DATABASE_URL não definida') ? msg : 'indisponível' });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });
  app.use(errorHandler);

  return app;
}

/** Gemini tuned for a 60 s function: short timeouts and no long waits for quota resets. */
function geminiFromEnv(): TranslationProvider | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const models = (process.env.GEMINI_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const gemini = new GeminiProvider({
    apiKey,
    // Flash-Lite keeps the heaviest Pro user profitable at R$ 19,90 (see the go-to-market doc).
    models: models.length ? models : ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    timeoutMs: 25_000,
    retries: 1,
    retryDelayMs: 1000,
    maxRetryWaitMs: 2000,
    log: (...args) => console.warn('[gemini]', ...args),
  });
  return withDeadline(gemini, 30_000);
}
