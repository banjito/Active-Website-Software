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
      // Cheap pre-filter; the resolved-path equality below is the real gate.
      // Must be broad enough to catch relative forms ("./supabase",
      // "../supabase") used by AuthContext and lib/supabase/client.ts.
      if (!source.includes("supabase")) return null;
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
// The base web config uses the legacy object form of manualChunks (which Vite
// 8's rolldown rejects) to hand-group vendors for CDN caching. A desktop app
// loaded from disk gains nothing from vendor-splitting, and that manual
// grouping produced cross-chunk circular references that crashed some reports
// at runtime ("Cannot access 'X' before initialization", e.g. recharts in
// TanDeltaChart). So we OVERRIDE it with a function that opts out of manual
// grouping entirely (returns undefined for every module), letting rolldown do
// its own cycle-safe automatic chunking.
function manualChunks(): undefined {
  return undefined;
}

export default defineConfig((env) => {
  const base = baseConfigFactory(env) as Record<string, any>;

  // The base config pre-bundles `pdfjs-dist/build/pdf.mjs` while also aliasing
  // bare `pdfjs-dist` to that same file — in this (electron) root that yields a
  // bogus ".../pdf.mjs/build/pdf.mjs" path and crashes the dev optimizer. The
  // offline shell doesn't need the pdfjs pre-bundle, so drop the include.
  base.optimizeDeps = { ...(base.optimizeDeps ?? {}), include: [] };

  return mergeConfig(base, {
    // Serve/build the standalone offline shell (electron/renderer/index.html),
    // NOT the full ampOS app at the repo-root index.html.
    root: path.resolve(__dirname, "electron/renderer"),
    base: "./",
    // Dedicated port so the offline app never collides with the main ampOS dev
    // server (which holds 5175). You can run both at once.
    server: { port: 5180, strictPort: true },
    plugins: [offlineSupabasePlugin()],
    build: {
      outDir: path.resolve(__dirname, "electron/renderer-dist"),
      emptyOutDir: true,
      minify: process.env.ELECTRON_NO_MINIFY ? false : undefined,
      rollupOptions: {
        output: { manualChunks },
      },
    },
  });
});
