import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

const serverRoot = path.resolve(import.meta.dirname, '..');
const envFile = path.resolve(serverRoot, '..', '.env');

// Values already set in the environment win over .env, so test runs can point at their own DB.
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    process.env[key] ??= value;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}

export const config = {
  isProduction,
  // API_PORT, not PORT: dev tools often set PORT for the front-end server, which would clash.
  port: Number(process.env.API_PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/nocap',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret',
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? 'uploads'),
  /** Pick-a-member login. Only for local development and tests; replaced by phone + PIN in v0.4. */
  devLogin: !isProduction,
};
