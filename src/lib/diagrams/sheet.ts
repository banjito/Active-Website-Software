/**
 * Lays out one printed sheet as a list of drawing steps, in points from the top left corner.
 *
 * Nothing here touches a PDF, so where everything lands can be checked without making one.
 * It also lets the export dialog estimate text size before anything is generated.
 */

import { toFlowElements, type DiagramNode, type MissingReason } from "@/lib/diagrams/flowElements";
import type { DiagramLinkTarget } from "@/lib/diagrams/links";
import { STATUS_STYLES, statusStyleFor } from "@/lib/diagrams/reportStatus";
import { findPort, getSymbolGeometry, type SymbolShape } from "@/lib/diagrams/symbols";
import {
  formatVoltage,
  levelsInUse,
  lineColor,
  linesToLabel,
  type VoltageColors,
} from "@/lib/diagrams/voltage";
import type { DiagramContents, DiagramLineRow } from "@/lib/types/siteDiagrams";

const POINTS_PER_INCH = 72;

export const ARCH_SIZES = {
  B: { label: "ARCH B (12 x 18 in)", short: 12, long: 18 },
  C: { label: "ARCH C (18 x 24 in)", short: 18, long: 24 },
  D: { label: "ARCH D (24 x 36 in)", short: 24, long: 36 },
  E: { label: "ARCH E (36 x 48 in)", short: 36, long: 48 },
} as const;

export type ArchSize = keyof typeof ARCH_SIZES;
export type SheetColoring = "voltage" | "status" | "none";

export interface SheetOptions {
  size: ArchSize;
  orientation: "landscape" | "portrait";
  coloring: SheetColoring;
}

export interface Logo {
  key: string;
  width: number;
  height: number;
}

export interface SheetInput {
  contents: DiagramContents;
  options: SheetOptions;
  siteId: string;
  siteName: string;
  diagramId: string;
  diagramName: string;
  /** Null when the database can't track revisions yet. */
  revision: number | null;
  printedAt: string;
  archived: boolean;
  /** Each diagram's sheet number. A sheet not in here is printed without one. */
  sheetNumbers: Map<string, number>;
  sheetCount: number;
  links: Map<string, DiagramLinkTarget[]>;
  voltageColors: VoltageColors;
  statuses: Map<string, string>;
  /** Assets not on the job this was exported from, which print faded. */
  fadedAssetIds: Set<string>;
  logos: Logo[];
  measure: (text: string, size: number, bold?: boolean) => number;
}

export type Rgb = [number, number, number];

export type DrawStep =
  | { kind: "path"; d: string; x: number; y: number; scale: number; stroke?: Rgb; fill?: Rgb; width?: number; dash?: number[] }
  | { kind: "rect"; x: number; y: number; width: number; height: number; stroke?: Rgb; fill?: Rgb; lineWidth?: number }
  | { kind: "text"; text: string; x: number; y: number; size: number; color: Rgb; bold?: boolean }
  | { kind: "image"; href: string; x: number; y: number; width: number; height: number }
  | { kind: "logo"; key: string; x: number; y: number; width: number; height: number };

export interface Sheet {
  width: number;
  height: number;
  steps: DrawStep[];
  /** Label size on paper, for the too-small warning. */
  textSize: number;
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];
const AMBER: Rgb = [0.72, 0.42, 0.02];
const GRAY: Rgb = [0.4, 0.4, 0.4];

const MARGIN = 0.5 * POINTS_PER_INCH;
const PADDING = 0.25 * POINTS_PER_INCH;
const TITLE_BLOCK_WIDTH = 4.5 * POINTS_PER_INCH;
const TITLE_BLOCK_HEIGHT = 2 * POINTS_PER_INCH;
const LOGO_HEIGHT = 0.55 * POINTS_PER_INCH;

/** So a small diagram on a big sheet doesn't come out cartoonishly large. */
const MAX_SCALE = 2;

/** Below this, labels are hard to read on paper. */
export const MIN_TEXT_SIZE = 6;

const LABEL_SIZE = 12;
const LABEL_LINE = 14;
const TAG_SIZE = 10;
const LABEL_GAP = 4;
const LINE_WIDTH = 2;

const MISSING_TAGS: Record<MissingReason, string> = {
  deleted: "Asset deleted",
  moved: "Moved to another site",
  retired: "Retired",
};

export const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const fade = (color: Rgb): Rgb => color.map((value) => value + (1 - value) * 0.6) as Rgb;

/** Breaks text to a width. A word longer than the width gets its own line, as on screen. */
export function wrapText(
  text: string,
  width: number | null,
  measure: (text: string) => number,
): string[] {
  if (!width) return [text];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Every shape as an SVG path, which is all the PDF needs to know how to draw. */
export function shapePath(shape: SymbolShape): string | null {
  switch (shape.type) {
    case "line":
      return `M${shape.x1} ${shape.y1} L${shape.x2} ${shape.y2}`;
    case "rect":
      return `M${shape.x} ${shape.y} h${shape.width} v${shape.height} h${-shape.width} Z`;
    case "circle": {
      const { cx, cy, r } = shape;
      return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
    }
    case "path":
      return shape.d;
    default:
      return null;
  }
}

/** The same route as on screen: straight when aligned, otherwise a bend halfway. */
export function linePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  sideways: boolean,
): string {
  if (sideways) {
    const midX = (from.x + to.x) / 2;
    return `M${from.x} ${from.y} H${midX} V${to.y} H${to.x}`;
  }
  if (from.x === to.x) return `M${from.x} ${from.y} V${to.y}`;
  const midY = (from.y + to.y) / 2;
  return `M${from.x} ${from.y} V${midY} H${to.x} V${to.y}`;
}

interface PlacedLabel {
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

function placeLabel(node: DiagramNode, width: number, height: number, measure: SheetInput["measure"]): PlacedLabel | null {
  const { label, labelWidth, symbolKey, role } = node.data;
  if (!label) return null;

  const lines = wrapText(label, labelWidth, (text) => measure(text, LABEL_SIZE));
  const textWidth = Math.max(...lines.map((line) => measure(line, LABEL_SIZE)));
  const boxed = role === "cable";
  const boxWidth = labelWidth ?? textWidth + (boxed ? 12 : 0);
  const boxHeight = lines.length * LABEL_LINE + (boxed ? 6 : 0);

  if (symbolKey === "bus") {
    return {
      lines,
      x: node.position.x,
      y: node.position.y - LABEL_GAP - boxHeight,
      width: boxWidth,
      height: boxHeight,
    };
  }
  return {
    lines,
    x: node.position.x + width + (boxed ? 0 : LABEL_GAP),
    y: node.position.y + height / 2 - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
  };
}

function tagsFor(node: DiagramNode, input: SheetInput): string[] {
  const tags = (input.links.get(node.id) ?? []).flatMap((target) => {
    const sheet = input.sheetNumbers.get(target.diagramId);
    return sheet ? [`Continued on Sheet ${sheet}`] : [];
  });
  return node.data.missing ? [...tags, MISSING_TAGS[node.data.missing]] : tags;
}

function legendRows(input: SheetInput): Array<{ label: string; color: Rgb }> {
  const { contents, options, voltageColors, statuses } = input;
  if (options.coloring === "voltage") {
    return levelsInUse(contents).map((level) => ({
      label: level.label,
      color: hexToRgb(voltageColors[level.key]),
    }));
  }
  if (options.coloring === "status") {
    const assetIds = contents.symbols.flatMap((symbol) => (symbol.asset_id ? [symbol.asset_id] : []));
    const shown = new Set(assetIds.flatMap((id) => statuses.get(id) ?? []));
    const rows = STATUS_STYLES.filter((style) => shown.has(style.status)).map((style) => ({
      label: style.label,
      color: hexToRgb(style.hex),
    }));
    return assetIds.some((id) => !statuses.has(id)) ? [...rows, { label: "No report", color: BLACK }] : rows;
  }
  return [];
}

function sheetSize({ size, orientation }: SheetOptions) {
  const { short, long } = ARCH_SIZES[size];
  return orientation === "landscape"
    ? { width: long * POINTS_PER_INCH, height: short * POINTS_PER_INCH }
    : { width: short * POINTS_PER_INCH, height: long * POINTS_PER_INCH };
}

/** Lays out one sheet. */
export function planSheet(input: SheetInput): Sheet {
  const { contents, options, measure } = input;
  const { width: pageWidth, height: pageHeight } = sheetSize(options);
  const { nodes } = toFlowElements(contents, { siteId: input.siteId, archived: input.archived });

  const placed = nodes.map((node) => {
    const geometry = getSymbolGeometry(node.data.symbolKey, node.data.width);
    const label = placeLabel(node, geometry.width, geometry.height, measure);
    const tags = tagsFor(node, input);
    const tagWidth = Math.max(0, ...tags.map((tag) => measure(tag, TAG_SIZE)));
    return { node, geometry, label, tags, tagWidth };
  });
  const byId = new Map(placed.map((item) => [item.node.id, item]));

  // The drawing's extent, including labels and notes, since they have to fit on the sheet too.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number, right: number, bottom: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  };
  for (const { node, geometry, label, tagWidth } of placed) {
    const { x, y } = node.position;
    extend(x - (tagWidth ? tagWidth + LABEL_GAP : 0), y, x + geometry.width, y + geometry.height);
    if (label) extend(label.x, label.y, label.x + label.width, label.y + label.height);
  }
  if (placed.length === 0) extend(0, 0, 1, 1);

  // Inside the border, and above the strip that holds the title block and legend.
  const areaX = MARGIN + PADDING;
  const areaY = MARGIN + PADDING;
  const areaWidth = pageWidth - 2 * (MARGIN + PADDING);
  const areaHeight = pageHeight - 2 * (MARGIN + PADDING) - TITLE_BLOCK_HEIGHT;

  const drawingWidth = maxX - minX;
  const drawingHeight = maxY - minY;
  const scale = Math.min(areaWidth / drawingWidth, areaHeight / drawingHeight, MAX_SCALE);
  const originX = areaX + (areaWidth - drawingWidth * scale) / 2 - minX * scale;
  const originY = areaY + (areaHeight - drawingHeight * scale) / 2 - minY * scale;
  const px = (x: number) => originX + x * scale;
  const py = (y: number) => originY + y * scale;

  const steps: DrawStep[] = [];

  const lineRgb = (line: DiagramLineRow): Rgb =>
    options.coloring === "voltage" ? hexToRgb(lineColor(line, input.voltageColors)) : BLACK;

  for (const line of contents.lines) {
    const from = byId.get(line.from_symbol_id);
    const to = byId.get(line.to_symbol_id);
    if (!from || !to) continue;
    const start = findPort(from.geometry, line.from_port);
    const end = findPort(to.geometry, line.to_port);
    steps.push({
      kind: "path",
      d: linePath(
        { x: from.node.position.x + start.x, y: from.node.position.y + start.y },
        { x: to.node.position.x + end.x, y: to.node.position.y + end.y },
        !line.from_port.startsWith("bottom"),
      ),
      x: originX,
      y: originY,
      scale,
      stroke: lineRgb(line),
      width: LINE_WIDTH,
    });
  }

  for (const { node, geometry, label, tags } of placed) {
    const { x, y } = node.position;
    const symbol = contents.symbols.find((row) => row.id === node.id);
    const incoming = contents.lines.find((line) => line.to_symbol_id === node.id);
    const outgoing = contents.lines.find((line) => line.from_symbol_id === node.id);

    let top = BLACK;
    let bottom = BLACK;
    if (options.coloring === "voltage" && (incoming || outgoing)) {
      top = lineRgb((incoming ?? outgoing) as DiagramLineRow);
      bottom = lineRgb((outgoing ?? incoming) as DiagramLineRow);
    } else if (options.coloring === "status" && symbol?.asset_id) {
      const style = statusStyleFor(input.statuses.get(symbol.asset_id));
      if (style) top = bottom = hexToRgb(style.hex);
    }

    const faded =
      !input.archived &&
      (node.data.missing !== null ||
        symbol?.asset?.status === "not_in_use" ||
        (!!symbol?.asset_id && input.fadedAssetIds.has(symbol.asset_id)));

    for (const shape of geometry.shapes) {
      const base = shape.part === "bottom" ? bottom : top;
      const color = faded ? fade(base) : base;

      if (shape.type === "image") {
        steps.push({
          kind: "image",
          href: shape.href,
          x: px(x + shape.x),
          y: py(y + shape.y),
          width: shape.width * scale,
          height: shape.height * scale,
        });
      } else if (shape.type === "text") {
        const size = shape.size * scale;
        steps.push({
          kind: "text",
          text: shape.text,
          x: px(x + shape.x) - measure(shape.text, size, true) / 2,
          y: py(y + shape.y),
          size,
          color,
          bold: true,
        });
      } else {
        const d = shapePath(shape);
        if (!d) continue;
        const filled = "filled" in shape && shape.filled;
        steps.push({
          kind: "path",
          d,
          x: px(x),
          y: py(y),
          scale,
          ...(filled ? { fill: color } : { stroke: color, width: LINE_WIDTH }),
        });
      }
    }

    if (label) {
      const boxed = node.data.role === "cable";
      if (boxed) {
        steps.push({
          kind: "rect",
          x: px(label.x),
          y: py(label.y),
          width: label.width * scale,
          height: label.height * scale,
          fill: WHITE,
          stroke: BLACK,
          lineWidth: Math.max(0.5, scale),
        });
      }
      label.lines.forEach((text, index) => {
        steps.push({
          kind: "text",
          text,
          x: px(label.x + (boxed ? 6 : 0)),
          y: py(label.y + (boxed ? 3 : 0) + LABEL_LINE * index + LABEL_SIZE * 0.9),
          size: LABEL_SIZE * scale,
          color: faded ? fade(BLACK) : BLACK,
        });
      });
    }

    tags.forEach((tag, index) => {
      steps.push({
        kind: "text",
        text: tag,
        x: px(x - LABEL_GAP - measure(tag, TAG_SIZE)),
        y: py(y + geometry.height / 2 + (index - (tags.length - 1) / 2) * (TAG_SIZE + 2) + TAG_SIZE * 0.35),
        size: TAG_SIZE * scale,
        color: AMBER,
      });
    });
  }

  // Voltage labels print whatever the coloring, so color is never the only way to tell.
  for (const lineId of linesToLabel(contents)) {
    const line = contents.lines.find((row) => row.id === lineId);
    const from = line && byId.get(line.from_symbol_id);
    const to = line && byId.get(line.to_symbol_id);
    if (!line || !from || !to) continue;

    const start = findPort(from.geometry, line.from_port);
    const end = findPort(to.geometry, line.to_port);
    const x = (from.node.position.x + start.x + to.node.position.x + end.x) / 2;
    const y = (from.node.position.y + start.y + to.node.position.y + end.y) / 2;
    const text = formatVoltage(line.voltage_volts, line.voltage_kind);
    const textWidth = measure(text, 11, true);

    steps.push({
      kind: "rect",
      x: px(x - textWidth / 2 - 3),
      y: py(y - 8),
      width: (textWidth + 6) * scale,
      height: 16 * scale,
      fill: WHITE,
    });
    steps.push({
      kind: "text",
      text,
      x: px(x - textWidth / 2),
      y: py(y + 4),
      size: 11 * scale,
      color: BLACK,
      bold: true,
    });
  }

  // The border, then the strip along the bottom.
  steps.push({
    kind: "rect",
    x: MARGIN,
    y: MARGIN,
    width: pageWidth - MARGIN * 2,
    height: pageHeight - MARGIN * 2,
    stroke: BLACK,
    lineWidth: 1.5,
  });

  const blockX = pageWidth - MARGIN - TITLE_BLOCK_WIDTH;
  const blockY = pageHeight - MARGIN - TITLE_BLOCK_HEIGHT;
  steps.push({
    kind: "rect",
    x: blockX,
    y: blockY,
    width: TITLE_BLOCK_WIDTH,
    height: TITLE_BLOCK_HEIGHT,
    fill: WHITE,
    stroke: BLACK,
    lineWidth: 1,
  });

  // Logos side by side along the top of the title block.
  const slotWidth = (TITLE_BLOCK_WIDTH - 16) / Math.max(1, input.logos.length);
  input.logos.forEach((logo, index) => {
    const fit = Math.min((slotWidth - 8) / logo.width, LOGO_HEIGHT / logo.height);
    const width = logo.width * fit;
    const height = logo.height * fit;
    steps.push({
      kind: "logo",
      key: logo.key,
      x: blockX + 8 + slotWidth * index + (slotWidth - width) / 2,
      y: blockY + 8 + (LOGO_HEIGHT - height) / 2,
      width,
      height,
    });
  });

  const textX = blockX + 10;
  const textTop = blockY + 8 + LOGO_HEIGHT + 20;
  const sheetNumber = input.sheetNumbers.get(input.diagramId);
  steps.push({ kind: "text", text: input.diagramName, x: textX, y: textTop, size: 14, color: BLACK, bold: true });
  steps.push({ kind: "text", text: input.siteName, x: textX, y: textTop + 16, size: 10, color: GRAY });
  steps.push({
    kind: "text",
    text: `Printed ${input.printedAt}`,
    x: textX,
    y: textTop + 31,
    size: 10,
    color: BLACK,
  });
  steps.push({
    kind: "text",
    text: [
      input.archived ? "ARCHIVED" : null,
      input.revision !== null ? `Rev ${input.revision}` : null,
      sheetNumber ? `Sheet ${sheetNumber} of ${input.sheetCount}` : null,
    ]
      .filter(Boolean)
      .join("   "),
    x: textX,
    y: textTop + 46,
    size: 10,
    color: BLACK,
    bold: true,
  });

  // The key sits in the strip on the left, in columns if it needs them.
  legendRows(input).forEach((row, index) => {
    const perColumn = 7;
    const x = MARGIN + 12 + Math.floor(index / perColumn) * 150;
    const y = pageHeight - MARGIN - TITLE_BLOCK_HEIGHT + 10 + (index % perColumn) * 18;
    steps.push({ kind: "rect", x, y, width: 12, height: 12, fill: row.color });
    steps.push({ kind: "text", text: row.label, x: x + 18, y: y + 10, size: 10, color: BLACK });
  });

  return { width: pageWidth, height: pageHeight, steps, textSize: LABEL_SIZE * scale };
}

/** Near enough for a warning before the real fonts are loaded. */
export const estimateTextWidth = (text: string, size: number) => text.length * size * 0.5;

/** The smallest sheet that keeps labels readable, or null if none does. */
export function smallestReadableSize(input: SheetInput): ArchSize | null {
  const sizes = Object.keys(ARCH_SIZES) as ArchSize[];
  return (
    sizes.find(
      (size) => planSheet({ ...input, options: { ...input.options, size } }).textSize >= MIN_TEXT_SIZE,
    ) ?? null
  );
}
