import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API calls go to /api and are proxied to the Express server, so the browser sees one origin
// and the login cookie works without CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:4000',
    },
  },
});
