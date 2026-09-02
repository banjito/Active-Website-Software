/**
 * Browser-side PDF text extraction shared by report ingestion workflows.
 *
 * PDFs with selectable text can be read directly with pdf.js. Scanned PDFs and
 * files whose glyphs are only vector outlines must instead be rasterized and
 * passed through OCR. Both paths run in the browser; only the resulting text is
 * sent to the server for structuring.
 *
 * Everything here is dynamically imported so pdf.js and the Tesseract wasm
 * bundle stay out of the main chunk.
 */

/** Scale to render at. 2.0 ≈ 144 DPI, enough for the dense 6pt table text. */
const RENDER_SCALE = 2.0;

export interface OcrProgress {
  stage: "loading" | "rendering" | "recognizing" | "done";
  /** 1-based page currently being worked on. */
  page: number;
  pageCount: number;
  /** 0..1 within the current stage, when the underlying step reports it. */
  ratio?: number;
}

export interface OcrResult {
  /** One entry per page, in document order. */
  pages: string[];
  /** All pages joined with page markers, ready to hand to the model. */
  text: string;
}

/**
 * One text run, placed on the page.
 *
 * pdf.js reports each run's position in the 6-element transform it would draw
 * with: [4] is x and [5] is the baseline y, which grows upward.
 */
interface PlacedRun {
  x: number;
  y: number;
  height: number;
  str: string;
}

/** Rows within this many points of each other are one visual line. */
const MIN_LINE_TOLERANCE = 2;

/**
 * Rebuild a page's reading order from where its text was actually drawn.
 *
 * pdf.js hands back runs in content-stream order, which is the order the
 * generator happened to emit them, not the order a person reads them. Form
 * exports are the worst case: a label and the box it belongs to are written in
 * separate passes, so joining the runs as they arrive yields "PAGE <date> DATE
 * 1" for what prints as "DATE <date>  PAGE 1". Structuring that text lands
 * values on the wrong fields, so the runs are sorted by position first.
 *
 * Runs are grouped into lines by baseline, then ordered left to right within
 * each line — the same reconstruction `pdftotext` performs.
 */
function readingOrder(items: unknown[]): string {
  const runs: PlacedRun[] = [];
  for (const item of items) {
    // items are TextItem | TextMarkedContent; only the former has text.
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const run = item as { str: string; height?: number; transform?: number[] };
    if (!run.str.trim()) continue;
    const transform = run.transform ?? [];
    runs.push({
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      height: run.height ?? 0,
      str: run.str,
    });
  }

  if (runs.length === 0) return "";

  // Top-down, then left-to-right. The x tiebreak keeps the grouping pass below
  // from depending on the order pdf.js emitted overlapping runs in.
  runs.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PlacedRun[][] = [];
  let baseline = runs[0].y;
  let current: PlacedRun[] = [];

  for (const run of runs) {
    // Superscripts and mixed type sizes shift a baseline slightly without
    // starting a new row, so the tolerance follows the run's own height.
    const tolerance = Math.max(MIN_LINE_TOLERANCE, run.height / 2);
    if (current.length > 0 && baseline - run.y > tolerance) {
      lines.push(current);
      current = [];
    }
    if (current.length === 0) baseline = run.y;
    current.push(run);
  }
  lines.push(current);

  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((run) => run.str)
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * Pull the embedded text layer, or null when there isn't a usable one.
 *
 * Today's MVA oil-report exports return null, but PDFs from other report
 * workflows commonly land here and skip OCR entirely — seconds instead of
 * minutes, with no OCR misreads to correct.
 */
export async function extractTextLayer(file: File): Promise<OcrResult | null> {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;

  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(readingOrder(content.items));
      page.cleanup();
    }

    // A handful of stray characters is not a text layer; these files decode to
    // roughly one byte, so anything under a few hundred chars is noise.
    const total = pages.reduce((n, t) => n + t.length, 0);
    if (total < 200) return null;

    return {
      pages,
      text: pages.map((t, i) => `--- PAGE ${i + 1} ---\n${t}`).join("\n\n"),
    };
  } finally {
    await doc.destroy();
  }
}

/**
 * Rasterize every page and OCR it.
 *
 * `signal` aborts between pages; Tesseract itself is not interruptible
 * mid-page, so a cancel takes effect at the next page boundary.
 */
export async function ocrPdf(
  file: File,
  onProgress?: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const pdfjsLib = await loadPdfJs();
  const { createWorker } = await import("tesseract.js");

  onProgress?.({ stage: "loading", page: 0, pageCount: 0 });

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = doc.numPages;

  const worker = await createWorker("eng");
  const pages: string[] = [];

  try {
    for (let i = 1; i <= pageCount; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      onProgress?.({ stage: "rendering", page: i, pageCount });
      const canvas = await renderPage(doc, i);

      onProgress?.({ stage: "recognizing", page: i, pageCount });
      const { data: result } = await worker.recognize(canvas);
      pages.push(result.text);

      // Free the backing store; these canvases are ~1200x1600 each.
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }

  onProgress?.({ stage: "done", page: pageCount, pageCount });

  return {
    pages,
    text: pages
      .map((t, i) => `--- PAGE ${i + 1} ---\n${t}`)
      .join("\n\n"),
  };
}

/** Render one page to an offscreen canvas at RENDER_SCALE. */
async function renderPage(
  doc: { getPage: (n: number) => Promise<any> },
  pageNumber: number,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context");

  // OCR is markedly more accurate on a white ground than on transparency.
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();

  return canvas;
}

/** Load pdf.js with a worker whose version matches the bundled library. */
async function loadPdfJs() {
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
