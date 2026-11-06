/**
 * Turns planned sheets into a PDF. Lines and text stay as lines and text, so they're sharp at
 * any zoom and the text can be searched.
 */

import { LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { planSheet, type DrawStep, type Rgb, type SheetInput } from "@/lib/diagrams/sheet";

export interface LogoSource {
  key: string;
  src: string;
}

type SheetRequest = Omit<SheetInput, "measure" | "logos">;

/** How much bigger than its printed size an SVG upload is rendered, since PDFs can't embed one. */
const SVG_RENDER_SCALE = 8;
const SVG_RENDER_SIZE = 240 * SVG_RENDER_SCALE;

const color = ([r, g, b]: Rgb) => rgb(r, g, b);

/**
 * The built-in PDF fonts only cover Western characters, and fail on anything else. A symbol
 * like an ohm sign shouldn't stop a whole sheet from printing.
 */
function printable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text]
    .map((character) => (supported.has(character.codePointAt(0) as number) ? character : "?"))
    .join("");
}

const isPng = (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50;
const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;

async function readBytes(src: string): Promise<Uint8Array> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Couldn't load ${src.slice(0, 60)}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Anything a PDF can't embed directly, such as an SVG, is drawn to an image first. */
async function renderToPng(src: string): Promise<Uint8Array> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Couldn't read an image."));
    image.src = src;
  });

  const ratio = (image.naturalHeight || 1) / (image.naturalWidth || 1);
  const canvas = document.createElement("canvas");
  canvas.width = SVG_RENDER_SIZE;
  canvas.height = Math.round(SVG_RENDER_SIZE * ratio);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't convert an image.");
  return new Uint8Array(await blob.arrayBuffer());
}

async function embed(doc: PDFDocument, src: string): Promise<PDFImage> {
  const bytes = await readBytes(src);
  if (isPng(bytes)) return doc.embedPng(bytes);
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  return doc.embedPng(await renderToPng(src));
}

/** Makes one PDF from any number of sheets. Logos that fail to load are listed, not fatal. */
export async function buildDiagramPdf(
  sheets: SheetRequest[],
  logoSources: LogoSource[],
): Promise<{ bytes: Uint8Array; failedLogos: string[] }> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const measure = (text: string, size: number, isBold?: boolean) => {
    const font = isBold ? bold : regular;
    return font.widthOfTextAtSize(printable(font, text), size);
  };

  const logos = new Map<string, PDFImage>();
  const failedLogos: string[] = [];
  for (const { key, src } of logoSources) {
    try {
      logos.set(key, await embed(doc, src));
    } catch (error) {
      console.error(`Failed to load the ${key} logo:`, error);
      failedLogos.push(key);
    }
  }
  const logoSizes = [...logos.entries()].map(([key, image]) => ({
    key,
    width: image.width,
    height: image.height,
  }));

  const images = new Map<string, PDFImage>();

  for (const request of sheets) {
    const sheet = planSheet({ ...request, measure, logos: logoSizes });
    const page = doc.addPage([sheet.width, sheet.height]);
    const flip = (y: number) => sheet.height - y;

    const draw = async (step: DrawStep) => {
      switch (step.kind) {
        case "path":
          page.drawSvgPath(step.d, {
            x: step.x,
            y: flip(step.y),
            scale: step.scale,
            ...(step.fill ? { color: color(step.fill) } : {}),
            ...(step.stroke
              ? {
                  borderColor: color(step.stroke),
                  borderWidth: step.width ?? 1,
                  borderLineCap: LineCapStyle.Projecting,
                }
              : {}),
          });
          break;
        case "rect":
          page.drawRectangle({
            x: step.x,
            y: flip(step.y + step.height),
            width: step.width,
            height: step.height,
            ...(step.fill ? { color: color(step.fill) } : {}),
            ...(step.stroke ? { borderColor: color(step.stroke), borderWidth: step.lineWidth ?? 1 } : {}),
          });
          break;
        case "text": {
          const font = step.bold ? bold : regular;
          page.drawText(printable(font, step.text), {
            x: step.x,
            y: flip(step.y),
            size: step.size,
            font,
            color: color(step.color),
          });
          break;
        }
        case "image": {
          if (!images.has(step.href)) images.set(step.href, await embed(doc, step.href));
          page.drawImage(images.get(step.href) as PDFImage, {
            x: step.x,
            y: flip(step.y + step.height),
            width: step.width,
            height: step.height,
          });
          break;
        }
        case "logo": {
          const logo = logos.get(step.key);
          if (logo) {
            page.drawImage(logo, {
              x: step.x,
              y: flip(step.y + step.height),
              width: step.width,
              height: step.height,
            });
          }
          break;
        }
      }
    };

    for (const step of sheet.steps) await draw(step);
  }

  return { bytes: await doc.save(), failedLogos };
}
