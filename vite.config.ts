import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// @ts-ignore
import eslint from 'vite-plugin-eslint';

// https://vitejs.dev/config/
export default defineConfig({
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
    port: 5175,
    strictPort: true, // Don't try other ports
    hmr: {
      protocol: 'ws',
      host: 'localhost'
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['pdfjs-dist/build/pdf', 'pdfjs-dist/web/pdf_viewer']
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pdfjs-dist": path.resolve(__dirname, "./node_modules/pdfjs-dist/legacy/build/pdf.js")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist']
        }
      }
    }
  }
});
