import { mkdirSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler } from './lib/http';
import { activityRouter } from './routes/activity';
import { authRouter } from './routes/auth';
import { entriesRouter } from './routes/entries';
import { eventsRouter } from './routes/events';
import { meRouter } from './routes/me';
import { membersRouter } from './routes/members';
import { proofsRouter } from './routes/proofs';
import { simulatorRouter } from './routes/simulator';
import { mockScreenshotParser, type ScreenshotParser } from './bot/parser';

export interface AppOptions {
  uploadDir: string;
  sessionSecret: string;
  /** Dev-only tools: pick-a-member login and the chat simulator. Off in production. */
  devLogin: boolean;
  secureCookies?: boolean;
  /** Reads payment screenshots sent to the bot; the mock until the AI adapter (v0.5). */
  screenshotParser?: ScreenshotParser;
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
  app.use('/api/entries', entriesRouter(opts));
  app.use('/api/members', membersRouter());
  app.use('/api/me', meRouter());
  app.use('/api/activity', activityRouter());
  app.use('/api/proofs', proofsRouter(opts));
  if (opts.devLogin) {
    app.use(
      '/api/sim',
      simulatorRouter({
        uploadDir: opts.uploadDir,
        parser: opts.screenshotParser ?? mockScreenshotParser,
      }),
    );
  }
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}
