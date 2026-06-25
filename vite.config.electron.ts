import { defineConfig, mergeConfig, type Plugin } from "vite";
import path from "path";
import baseConfigFactory from "./vite.config";

const REAL_SUPABASE = path.resolve(__dirname, "src/lib/supabase.ts");
const OFFLINE_ADAPTER = path.resolve(
  __dirname,
  "electron/renderer/offlineSupabaseAdapter.ts"
);

/**
 * Redirect every import of src/lib/supabase.ts to the offline adapter, no
 * matter the specifier (`@/lib/supabase` or relative `../../lib/supabase`).
 * Resolving to the real file first means we match by resolved path, so all
 * import forms are covered without enumerating them.
 */
function offlineSupabasePlugin(): Plugin {
  return {
    name: "offline-supabase-adapter",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer === OFFLINE_ADAPTER) return null;
      if (!source.includes("lib/supabase")) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved && path.normalize(resolved.id) === REAL_SUPABASE) {
        return OFFLINE_ADAPTER;
      }
      return null;
    },
  };
}

/**
 * Renderer build for the Electron offline-reports app.
 *
 * Extends the existing web Vite config so the SAME React app and report
 * components are reused. Two electron-specific differences:
 *   1. base "./" so assets resolve over the file:// protocol in a packaged app.
 *   2. output to electron/renderer-dist (loaded by main via loadFile).
 *
 * Phase 1 adds a `resolveId` plugin here that redirects every import of
 * src/lib/supabase.ts to the offline adapter (electron/renderer/
 * offlineSupabaseAdapter.ts). Phase 0 intentionally keeps the REAL Supabase
 * client so we can confirm the components render against live data first.
 */
// Vite 8's rolldown bundler requires manualChunks as a function (the base web
// config uses the legacy object form). Express the same vendor groupings as a
// function so the Electron renderer build succeeds.
const VENDOR_GROUPS: Record<string, string[]> = {
  pdfjs: ["pdfjs-dist"],
  "vendor-mui": ["@mui/material", "@mui/icons-material", "@mui/x-date-pickers"],
  "vendor-charts": ["recharts", "chart.js", "react-chartjs-2"],
  "vendor-bootstrap": ["react-bootstrap", "bootstrap"],
  "vendor-calendar": ["@fullcalendar/"],
  "vendor-supabase": ["@supabase/"],
  "vendor-pdf": ["@react-pdf/renderer", "jspdf", "jspdf-autotable", "pdf-lib"],
  "vendor-react-core": ["react", "react-dom", "react-router-dom"],
};

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  for (const [chunk, pkgs] of Object.entries(VENDOR_GROUPS)) {
    if (pkgs.some((p) => id.includes(`node_modules/${p}`))) return chunk;
  }
  return undefined;
}

export default defineConfig((env) => {
  const base = baseConfigFactory(env);
  return mergeConfig(base, {
    base: "./",
    plugins: [offlineSupabasePlugin()],
    build: {
      outDir: path.resolve(__dirname, "electron/renderer-dist"),
      emptyOutDir: true,
      rollupOptions: {
        output: { manualChunks },
      },
    },
  });
});
