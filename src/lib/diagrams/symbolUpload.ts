/** Turning an uploaded file into a safe image. Needs a browser, unlike customSymbols.ts. */

import DOMPurify from "dompurify";
import { uploadProblem } from "@/lib/diagrams/customSymbols";

export interface PreparedImage {
  dataUrl: string;
  /** The image's own width in pixels, for the low resolution warning. Null for an SVG. */
  pixelWidth: number | null;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const pixelWidthOf = (dataUrl: string) =>
  new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => reject(new Error("That image couldn't be read."));
    image.src = dataUrl;
  });

/**
 * An SVG is a document, not a picture: it can carry scripts and links. It's rebuilt from an
 * allow-list of drawing elements, and drawn through an image tag, which won't run scripts
 * anyway. Two layers, because this file comes from outside the app.
 */
export function cleanSvg(text: string): string | null {
  const cleaned = DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["a", "foreignObject", "script", "style", "use", "image"],
  });
  return /<svg[\s>]/i.test(cleaned) ? cleaned : null;
}

/** Throws with a message fit to show the user. */
export async function prepareUpload(file: File): Promise<PreparedImage> {
  const problem = uploadProblem(file);
  if (problem) throw new Error(problem);

  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const cleaned = cleanSvg(await file.text());
    if (!cleaned) throw new Error("That SVG has nothing that can be drawn.");
    const dataUrl = await readAsDataUrl(new Blob([cleaned], { type: "image/svg+xml" }));
    return { dataUrl, pixelWidth: null };
  }

  const dataUrl = await readAsDataUrl(new Blob([file], { type: "image/png" }));
  return { dataUrl, pixelWidth: await pixelWidthOf(dataUrl) };
}
