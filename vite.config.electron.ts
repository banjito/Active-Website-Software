import { defineConfig, mergeConfig, type Plugin } from "vite";
import fs from "fs";
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
    // When src/lib/supabase.ts gains an export the adapter lacks, any module
    // importing it fails at load and the offline app shows a blank window.
    // Fail the build/dev server here instead, naming what to add.
    buildStart() {
      const exportsOf = (file: string) =>
        new Set(
          Array.from(
            fs
              .readFileSync(file, "utf8")
              .matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm),
            (m) => m[1],
          ),
        );
      const offline = exportsOf(OFFLINE_ADAPTER);
      const missing = [...exportsOf(REAL_SUPABASE)].filter((n) => !offline.has(n));
      if (missing.length) {
        this.error(
          `electron/renderer/offlineSupabaseAdapter.ts is missing exports that ` +
            `src/lib/supabase.ts now has: ${missing.join(", ")}. Add offline ` +
            `versions there, or the offline app loads as a blank window.`,
        );
      }
    },
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
 * Reports load the company logo from a Vercel blob URL, which is a broken image
 * with no internet. Point every copy of that URL at the bundled file in
 * electron/renderer/public instead. A relative path works in all three places
 * the URL appears (JSX src, JS strings, HTML inside template strings) and
 * resolves next to index.html in both dev and the packaged app.
 */
const REMOTE_REPORT_LOGO =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png";

function offlineLogoPlugin(): Plugin {
  return {
    name: "offline-report-logo",
    enforce: "pre",
    transform(code) {
      if (!code.includes(REMOTE_REPORT_LOGO)) return null;
      return {
        code: code.split(REMOTE_REPORT_LOGO).join("./amp-logo.png"),
        map: null,
      };
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
    plugins: [offlineSupabasePlugin(), offlineLogoPlugin()],
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
