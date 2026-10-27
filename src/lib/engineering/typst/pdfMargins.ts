import { loadPdfJs } from "@/lib/loadPdfJs";

// Anything darker than this counts as printed (light table fills included).
const INK = 230;
// Longest side of the test render, in pixels.
const RENDER_SIZE = 800;
// Left on each side, so a trim never shaves the edge of a line.
const SAFETY = 0.005;

/**
 * The blank border around an SKM PDF's pages as "left,right,top,bottom"
 * fractions of the page. Uses the smallest border across all pages, so the
 * report template can trim it off every page without cutting into any.
 */
export async function measurePdfMargins(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfJs();
  // pdf.js takes ownership of the bytes it is given, so hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const margins = [1, 1, 1, 1];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_SIZE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("No canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();

      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const k = (y * width + x) * 4;
          if (Math.min(data[k], data[k + 1], data[k + 2]) >= INK) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right < 0) continue; // blank page

      margins[0] = Math.min(margins[0], left / width);
      margins[1] = Math.min(margins[1], (width - 1 - right) / width);
      margins[2] = Math.min(margins[2], top / height);
      margins[3] = Math.min(margins[3], (height - 1 - bottom) / height);
    }
  } finally {
    doc.destroy();
  }
  if (margins[0] === 1) return "0,0,0,0"; // every page blank
  return margins.map((m) => Math.max(0, m - SAFETY).toFixed(4)).join(",");
}
