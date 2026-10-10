import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone customer portal. Runs on its own port so it can run alongside the
// staff app during local dev. Talks to the same Supabase project via VITE_ env vars.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Root-relative on purpose: avoids Node's `path`/`__dirname`, which need
      // @types/node (not installed here, so the Netlify type-check fails).
      '@': '/src',
    },
  },
  server: {
    port: 5174,
  },
});
