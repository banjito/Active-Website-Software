import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// Standalone customer portal. Runs on its own port so it can run alongside the
// staff app during local dev. Talks to the same Supabase project via VITE_ env vars.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5174,
    },
});
