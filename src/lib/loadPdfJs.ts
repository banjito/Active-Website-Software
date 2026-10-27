/** Load pdf.js with a worker whose version matches the bundled library. */
export async function loadPdfJs() {
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Resolved through Vite so it always tracks the installed version, rather
    // than the stale copy in public/pdfjs (a version skew here throws
    // "API version does not match Worker version"). Bare "pdfjs-dist" is
    // aliased to the legacy build, so the legacy worker is the matching one;
    // that alias is anchored in vite.config.ts to keep this subpath intact.
    const workerUrl = (
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")
    ).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjsLib;
}
