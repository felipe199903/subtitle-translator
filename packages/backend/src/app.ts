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

export interface AppDeps {
  db?: Db;
  primary?: TranslationProvider;
  fallback?: TranslationProvider | null;
}

export function createApp({ db = getDb(), primary, fallback }: AppDeps = {}) {
  const memory = new MemoryRepository(db);
  const pipeline = new TranslationPipeline(
    memory,
    primary ?? new GoogleFreeProvider(),
    fallback === null ? undefined : (fallback ?? new MyMemoryProvider())
  );
  const controller = new JobController(new JobRepository(db), memory, pipeline);

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
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/subtitles', createSubtitleRoutes(controller));
  // Also checks the database, so it doubles as a post-deploy check.
  app.get(['/health', '/api/health'], async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'OK', database: 'ok' });
    } catch (e) {
      res.status(503).json({ status: 'ERROR', database: e instanceof Error ? e.message : 'indisponível' });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });
  app.use(errorHandler);

  return app;
}
