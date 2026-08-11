/**
 * Turns a lab-issued oil report PDF into raw text.
 *
 * These PDFs carry no text layer at all — every glyph is drawn as filled
 * vector outlines, so pdf.js `getTextContent()` returns nothing. The only way
 * to read them is to rasterize each page and OCR the pixels. Both steps run in
 * the browser; only the resulting text is sent to the server for structuring.
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
 * Pull the embedded text layer, or null when there isn't a usable one.
 *
 * Today's MVA exports always return null, but a lab that switches to a real
 * PDF export would land here and skip OCR entirely — seconds instead of
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
      pages.push(
        content.items
          // items are TextItem | TextMarkedContent; only the former has text.
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .trim(),
      );
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
