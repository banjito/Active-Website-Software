export type ThemeMode = "light" | "dark";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

const MAX_CANVAS_SIDE = 180;
const MAX_PALETTE_COLORS = 3;

export function normalizeHexColor(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }

  return null;
}

export function isValidHexColor(value: string | null | undefined): boolean {
  return normalizeHexColor(value) !== null;
}

export function hexToRgb(hex: string): RgbColor | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b]
    .map((channel) =>
      clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

export function hexToHslParts(hex: string): HslColor | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hexToHslCss(hex: string): string | null {
  const hsl = hexToHslParts(hex);
  if (!hsl) return null;
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

export function getContrastingForegroundHsl(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 100%";

  const luminance = relativeLuminance(rgb);
  return luminance > 0.56 ? "24 10% 10%" : "0 0% 100%";
}

export async function extractLogoColors(file: File): Promise<string[]> {
  const colors =
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
      ? await extractSvgLogoColors(file)
      : [];

  if (colors.length >= MAX_PALETTE_COLORS)
    return colors.slice(0, MAX_PALETTE_COLORS);

  try {
    const sampled = await extractCanvasLogoColors(file);
    return mergeDistinctColors([...colors, ...sampled]);
  } catch {
    return mergeDistinctColors(colors);
  }
}

async function extractSvgLogoColors(file: File): Promise<string[]> {
  const svg = await file.text();
  const candidates: string[] = [];

  for (const match of svg.matchAll(
    /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi,
  )) {
    const normalized = normalizeSvgHex(match[0]);
    if (normalized) candidates.push(normalized);
  }

  for (const match of svg.matchAll(
    /rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/gi,
  )) {
    candidates.push(
      rgbToHex({
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
      }),
    );
  }

  for (const match of svg.matchAll(
    /hsla?\(\s*([\d.]+)(?:deg)?(?:\s*,\s*|\s+)([\d.]+)%(?:\s*,\s*|\s+)([\d.]+)%/gi,
  )) {
    candidates.push(
      hslToHex({
        h: Number(match[1]),
        s: Number(match[2]),
        l: Number(match[3]),
      }),
    );
  }

  return rankColors(candidates);
}

async function extractCanvasLogoColors(file: File): Promise<string[]> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const naturalWidth = image.naturalWidth || image.width || MAX_CANVAS_SIDE;
    const naturalHeight =
      image.naturalHeight || image.height || MAX_CANVAS_SIDE;
    const scale = Math.min(
      1,
      MAX_CANVAS_SIDE / naturalWidth,
      MAX_CANVAS_SIDE / naturalHeight,
    );
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const counts = new Map<string, number>();
    const sampleEvery = Math.max(1, Math.floor((width * height) / 18_000));

    for (let pixel = 0; pixel < width * height; pixel += sampleEvery) {
      const i = pixel * 4;
      const alpha = pixels[i + 3];
      if (alpha < 128) continue;

      const hex = rgbToHex({
        r: quantizeChannel(pixels[i]),
        g: quantizeChannel(pixels[i + 1]),
        b: quantizeChannel(pixels[i + 2]),
      });

      if (!isLogoPaletteCandidate(hex)) continue;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    return selectDistinctColors(
      [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex),
    );
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read logo image."));
    image.src = src;
  });
}

function normalizeSvgHex(value: string): string | null {
  const hex = value.replace("#", "");

  if (hex.length === 4) {
    const alpha = Number.parseInt(`${hex[3]}${hex[3]}`, 16);
    if (alpha < 128) return null;
    return normalizeHexColor(hex.slice(0, 3));
  }

  if (hex.length === 8) {
    const alpha = Number.parseInt(hex.slice(6, 8), 16);
    if (alpha < 128) return null;
    return normalizeHexColor(hex.slice(0, 6));
  }

  return normalizeHexColor(hex);
}

function rankColors(colors: string[]): string[] {
  const counts = new Map<string, number>();

  for (const color of colors) {
    const normalized = normalizeHexColor(color);
    if (!normalized || !isLogoPaletteCandidate(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return selectDistinctColors(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex),
  );
}

function mergeDistinctColors(colors: string[]): string[] {
  return selectDistinctColors(
    colors
      .map((color) => normalizeHexColor(color))
      .filter((color): color is string => Boolean(color)),
  );
}

function selectDistinctColors(colors: string[]): string[] {
  const selected: string[] = [];
  const normalizedColors = colors
    .map((color) => normalizeHexColor(color))
    .filter((color): color is string => Boolean(color));

  // Prefer saturated brand hues first, then fill with neutrals like gray when the
  // logo uses them as real brand colors.
  addDistinctColors(normalizedColors, selected, isCoreLogoColor);
  if (selected.length < MAX_PALETTE_COLORS) {
    addDistinctColors(normalizedColors, selected, isLogoPaletteCandidate);
  }

  return selected;
}

function addDistinctColors(
  colors: string[],
  selected: string[],
  predicate: (color: string) => boolean,
) {
  for (const color of colors) {
    if (selected.length === MAX_PALETTE_COLORS) break;
    if (!predicate(color)) continue;

    const rgb = hexToRgb(color);
    if (!rgb) continue;

    const isDistinct = selected.every((selectedColor) => {
      const selectedRgb = hexToRgb(selectedColor);
      return selectedRgb ? colorDistance(rgb, selectedRgb) > 48 : true;
    });

    if (isDistinct) selected.push(color);
  }
}

function isCoreLogoColor(hex: string): boolean {
  const hsl = hexToHslParts(hex);
  if (!hsl) return false;
  if (hsl.l > 94 || hsl.l < 7) return false;
  return hsl.s >= 12;
}

function isLogoPaletteCandidate(hex: string): boolean {
  const hsl = hexToHslParts(hex);
  if (!hsl) return false;

  // Ignore near-white/near-black background/support shapes, but keep mid-tone
  // neutrals so single-color gray/black-ish logos still produce a palette.
  if (hsl.l > 96 || hsl.l < 5) return false;
  if (hsl.s < 12) return hsl.l >= 12 && hsl.l <= 88;
  return true;
}

function quantizeChannel(value: number): number {
  return clamp(Math.round(value / 24) * 24, 0, 255);
}

function hslToHex({ h, s, l }: HslColor): string {
  const normalizedHue = (((h % 360) + 360) % 360) / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return rgbToHex({ r: channel, g: channel, b: channel });
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return rgbToHex({
    r: hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    g: hueToRgb(p, q, normalizedHue) * 255,
    b: hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
  });
}

function hueToRgb(p: number, q: number, t: number): number {
  let localT = t;
  if (localT < 0) localT += 1;
  if (localT > 1) localT -= 1;
  if (localT < 1 / 6) return p + (q - p) * 6 * localT;
  if (localT < 1 / 2) return q;
  if (localT < 2 / 3) return p + (q - p) * (2 / 3 - localT) * 6;
  return p;
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
