import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// @ts-ignore
import eslint from 'vite-plugin-eslint';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Parallels / LAN: set VITE_DEV_HMR_HOST to the host the browser uses (e.g. VM IP).
  // Hardcoding breaks localhost because the WS client would target the wrong host.
  const hmrHost = env.VITE_DEV_HMR_HOST;

  return {
  plugins: [
    react(),
    eslint({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules/**', 'dist/**'],
      failOnWarning: false,
      failOnError: false,
      emitWarning: false,
      emitError: false
    })
  ],
  server: {
    host: '0.0.0.0', // Allow connections from other machines (like Windows VM)
    port: 5175,
    strictPort: true, // Don't try other ports
    ...(hmrHost
      ? {
          hmr: {
            protocol: 'ws' as const,
            host: hmrHost,
            ...(env.VITE_DEV_HMR_CLIENT_PORT
              ? { clientPort: Number(env.VITE_DEV_HMR_CLIENT_PORT) }
              : {}),
          },
        }
      : {}),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pdfjs-dist": path.resolve(__dirname, "./node_modules/pdfjs-dist/legacy/build/pdf.mjs")
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) only accepts the function form of manualChunks.
        // Same groupings as the previous object form.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          const pkg = (id.split('node_modules/').pop() || '')
            .split('/')
            .slice(0, id.includes('node_modules/@') ? 2 : 1)
            .join('/');
          const groups: Record<string, string[]> = {
            pdfjs: ['pdfjs-dist'],
            'vendor-mui': ['@mui/material', '@mui/icons-material', '@mui/x-date-pickers'],
            'vendor-charts': ['recharts', 'chart.js', 'react-chartjs-2'],
            'vendor-bootstrap': ['react-bootstrap', 'bootstrap'],
            'vendor-calendar': ['@fullcalendar/core', '@fullcalendar/daygrid', '@fullcalendar/react', '@fullcalendar/timegrid', '@fullcalendar/interaction'],
            'vendor-supabase': ['@supabase/supabase-js', '@supabase/auth-helpers-react'],
            'vendor-pdf': ['@react-pdf/renderer', 'jspdf', 'jspdf-autotable', 'pdf-lib'],
            'vendor-react-core': ['react', 'react-dom', 'react-router-dom'],
          };
          for (const [chunk, pkgs] of Object.entries(groups)) {
            if (pkgs.includes(pkg)) return chunk;
          }
          return undefined;
        }
      }
    }
  }
  };
});
