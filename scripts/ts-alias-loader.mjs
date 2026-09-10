/**
 * Minimal module loader so plain `node` can run the repo's TypeScript and TSX
 * without a bundler or a test framework.
 *
 * Two jobs:
 *
 *  - resolve: Node resolves specifiers literally, so it will not add a `.ts`
 *    extension, find an `index.ts`, or understand the `@/` alias.
 *  - load: Node's built-in type stripping cannot handle JSX (or enums), so
 *    `.tsx` goes through sucrase instead. That is what lets the regression
 *    harness render components with `react-dom/server` and no DOM.
 *
 *   node --import ./scripts/ts-alias-loader.mjs scripts/<name>.ts
 */

import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { transform } from "sucrase";

const SRC = pathToFileURL(path.resolve(process.cwd(), "src") + "/").href;

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function firstExisting(baseUrl) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = baseUrl + suffix;
    try {
      // Must be a file: a bare specifier often names a directory that also has
      // an index beside it, and resolving to the directory fails at read time.
      if (statSync(new URL(candidate)).isFile()) return candidate;
    } catch {
      // Missing, or not a file URL; try the next candidate.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(SRC + specifier.slice(2));
    if (resolved) return { url: resolved, shortCircuit: true };
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL;
    if (parent?.startsWith("file:")) {
      const resolved = firstExisting(new URL(specifier, parent).href);
      if (resolved) return { url: resolved, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Stylesheets and assets are not loadable outside a bundler, and nothing in
  // a headless render needs them.
  if (/\.(css|scss|png|jpe?g|svg|webp|woff2?)$/.test(url)) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }

  if (url.endsWith(".tsx") || url.endsWith(".ts")) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, "utf8");
    const { code } = transform(source, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "automatic",
      filePath,
      preserveDynamicImport: true,
    });
    return { format: "module", source: code, shortCircuit: true };
  }

  return nextLoad(url, context);
}

register(import.meta.url, pathToFileURL("./"));
