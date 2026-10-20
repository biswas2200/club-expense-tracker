import { mkdirSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { entriesRouter } from './routes/entries';
import { eventsRouter } from './routes/events';
import { proofsRouter } from './routes/proofs';

export interface AppOptions {
  uploadDir: string;
  sessionSecret: string;
  devLogin: boolean;
  secureCookies?: boolean;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(opts: AppOptions) {
  mkdirSync(opts.uploadDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser(opts.sessionSecret));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(
    '/api/auth',
    authRouter({ devLogin: opts.devLogin, secureCookies: opts.secureCookies ?? false }),
  );
  app.use('/api/events', eventsRouter(opts));
  app.use('/api/entries', entriesRouter());
  app.use('/api/proofs', proofsRouter(opts));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}
