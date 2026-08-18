/**
 * Shared branding helpers for the generated-report PDFs.
 *
 * @react-pdf/renderer resolves styles without a DOM, so nothing downstream can
 * read the --brand CSS variable or hand react-pdf an SVG. Both report builders
 * need the same two things — the company block passed in rather than read from
 * import.meta.env, and a logo rasterized to something <Image> can decode.
 */

/** Company values are passed in so PDF modules stay free of import.meta.env. */
export interface PdfCompany {
  fullName: string;
  addressLine: string;
  phone: string;
  websiteDomain: string;
  logoPath: string;
}

/**
 * Normalize an SVG so a browser can decode it as an image.
 *
 * Illustrator/Serif exports often declare an enormous intrinsic size and no
 * viewBox — AMP-vector-filled.svg is 1929030px wide, past the ~65535px cap on
 * image dimensions, so it fails to decode untouched. Moving that size into a
 * viewBox and letting the caller set the real dimensions fixes it without
 * editing the source asset.
 */
function normalizeSvg(markup: string, width: number, height: number): string {
  const openTag = markup.match(/<svg\b[^>]*>/i)?.[0];
  if (!openTag) return markup;

  const declaredW = parseFloat(openTag.match(/\bwidth="([\d.]+)/i)?.[1] ?? "");
  const declaredH = parseFloat(openTag.match(/\bheight="([\d.]+)/i)?.[1] ?? "");

  let next = openTag
    .replace(/\swidth="[^"]*"/i, "")
    .replace(/\sheight="[^"]*"/i, "");

  if (!/\bviewBox=/i.test(next) && declaredW > 0 && declaredH > 0) {
    next = next.replace(
      /^<svg/i,
      `<svg viewBox="0 0 ${declaredW} ${declaredH}"`,
    );
  }

  next = next.replace(/^<svg/i, `<svg width="${width}" height="${height}"`);
  return markup.replace(openTag, next);
}

/**
 * Rasterize a vector logo to a PNG data URI.
 *
 * react-pdf's <Image> decodes PNG and JPEG only — an .svg src renders nothing.
 * Non-SVG sources pass straight through.
 */
export async function rasterizeLogo(src: string, height = 160): Promise<string> {
  if (!/\.svg(\?|#|$)/i.test(src)) return src;

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not load logo: ${src} (${res.status})`);
  const markup = await res.text();

  // Aspect ratio comes from the declared size or the viewBox, whichever exists.
  const openTag = markup.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const viewBox = openTag
    .match(/viewBox="([^"]+)"/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const w =
    parseFloat(openTag.match(/\bwidth="([\d.]+)/i)?.[1] ?? "") ||
    (viewBox?.[2] ?? 0);
  const h =
    parseFloat(openTag.match(/\bheight="([\d.]+)/i)?.[1] ?? "") ||
    (viewBox?.[3] ?? 0);
  const ratio = w > 0 && h > 0 ? w / h : 1;

  const width = Math.max(1, Math.round(height * ratio));
  const sized = normalizeSvg(markup, width, height);

  // A blob URL keeps the canvas untainted, so toDataURL stays allowed.
  const url = URL.createObjectURL(
    new Blob([sized], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not decode logo: ${src}`));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
