import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The app version lives in the root package.json; the bug report link carries it.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// API calls go to /api and are proxied to the Express server, so the browser sees one origin
// and the login cookie works without CORS.
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:4000',
    },
  },
});
