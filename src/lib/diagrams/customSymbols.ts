/**
 * Uploaded and drawn symbols, and the rules for making them.
 *
 * Choosing a symbol only changes the artwork. What a symbol does, such as a transformer
 * ending a voltage section, still comes from its equipment type.
 */

import {
  BUILT_IN_SYMBOL_KEYS,
  equipmentTypeKey,
  getSymbolGeometry,
  type SymbolGeometry,
  type SymbolPort,
  type SymbolShape,
} from "@/lib/diagrams/symbols";

/** Stored as a data URL, which runs about a third larger than the file itself. */
export const MAX_IMAGE_BYTES = 300_000;

export const SYMBOL_SIZES = [40, 60, 80, 100, 120];

/** Drawing snaps to this, so shapes line up with each other and with connection points. */
export const DRAW_GRID = 5;

export type SymbolChoices = Record<string, string>;

export interface CustomSymbolRow {
  id: string;
  name: string;
  shapes: SymbolShape[];
  image_data: string | null;
  width: number;
  height: number;
  ports: SymbolPort[];
  deleted_at?: string | null;
}

export const customSymbolKey = (id: string) => `custom:${id}`;

/** The same shape as a built-in symbol, so everything else draws it without knowing. */
export function toGeometry(row: CustomSymbolRow): SymbolGeometry {
  return {
    key: customSymbolKey(row.id),
    label: row.name,
    width: row.width,
    height: row.height,
    shapes: row.image_data
      ? [{ type: "image", x: 0, y: 0, width: row.width, height: row.height, href: row.image_data }]
      : row.shapes,
    ports: row.ports,
    retired: !!row.deleted_at,
  };
}

/** Lines attach at a symbol's edge, so a point lands on the nearest one. */
export function placePort(
  x: number,
  y: number,
  width: number,
  height: number,
  existing: SymbolPort[],
): SymbolPort {
  const distances = [
    { side: "top", distance: y },
    { side: "bottom", distance: height - y },
    { side: "left", distance: x },
    { side: "right", distance: width - x },
  ];
  const { side } = distances.reduce((best, next) => (next.distance < best.distance ? next : best));

  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  const onGrid = (value: number) => Math.round(value / 10) * 10;
  const point =
    side === "top" || side === "bottom"
      ? { x: clamp(onGrid(x), width), y: side === "top" ? 0 : height }
      : { x: side === "left" ? 0 : width, y: clamp(onGrid(y), height) };

  // Ids start with the side, because that's what decides which lines may connect here.
  const used = new Set(existing.map((port) => port.id));
  let id = side;
  for (let count = 2; used.has(id); count += 1) id = `${side}-${count}`;
  return { id, ...point };
}

/** New symbols start the way most equipment does: in at the top, out at the bottom. */
export const defaultPorts = (width: number, height: number): SymbolPort[] => [
  { id: "top", x: width / 2, y: 0 },
  { id: "bottom", x: width / 2, y: height },
];

/**
 * Connection points after a symbol changes size. They keep their ids, because saved lines
 * attach by id, and stay on the same edge at the same relative spot.
 */
export function resizePorts(
  ports: SymbolPort[],
  from: { width: number; height: number },
  to: { width: number; height: number },
): SymbolPort[] {
  const onGrid = (value: number) => Math.round(value / 10) * 10;
  return ports.map((port) => ({
    id: port.id,
    x: port.x === from.width ? to.width : onGrid((port.x / from.width) * to.width),
    y: port.y === from.height ? to.height : onGrid((port.y / from.height) * to.height),
  }));
}

export type DrawTool = "line" | "rect" | "circle" | "arc";

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

function distanceToShape(shape: SymbolShape, point: { x: number; y: number }): number {
  switch (shape.type) {
    case "line":
      return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
    case "rect": {
      const { x, y, width, height } = shape;
      const corners = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];
      return Math.min(...corners.map((corner, i) => distanceToSegment(point, corner, corners[(i + 1) % 4])));
    }
    case "circle":
      return Math.abs(Math.hypot(point.x - shape.cx, point.y - shape.cy) - shape.r);
    case "text":
      return Math.hypot(point.x - shape.x, point.y - (shape.y - shape.size / 2));
    case "path": {
      // Arcs are the only paths the drawing tool makes: a start, a control point and an end.
      const [x0, y0, cx, cy, x1, y1] = (shape.d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      let nearest = Infinity;
      for (let step = 0; step <= 20; step += 1) {
        const t = step / 20;
        const u = 1 - t;
        nearest = Math.min(
          nearest,
          Math.hypot(
            point.x - (u * u * x0 + 2 * u * t * cx + t * t * x1),
            point.y - (u * u * y0 + 2 * u * t * cy + t * t * y1),
          ),
        );
      }
      return nearest;
    }
    default:
      return Infinity;
  }
}

/** Which shape a click landed on, or -1. The topmost wins, as it does on screen. */
export function shapeIndexAt(shapes: SymbolShape[], point: { x: number; y: number }, reach = 4): number {
  let found = -1;
  let closest = reach;
  shapes.forEach((shape, index) => {
    const distance = distanceToShape(shape, point);
    if (distance <= closest) {
      closest = distance;
      found = index;
    }
  });
  return found;
}

/** A shape from a drag, or nothing if the drag was too small to mean anything. */
export function shapeFromDrag(
  tool: DrawTool,
  from: { x: number; y: number },
  to: { x: number; y: number },
): SymbolShape | null {
  if (from.x === to.x && from.y === to.y) return null;

  switch (tool) {
    case "line":
      return { type: "line", x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    case "rect": {
      const width = Math.abs(to.x - from.x);
      const height = Math.abs(to.y - from.y);
      if (!width || !height) return null;
      return { type: "rect", x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width, height };
    }
    case "circle": {
      const r = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
      return r > 0 ? { type: "circle", cx: from.x, cy: from.y, r } : null;
    }
    case "arc": {
      // Bows out to the right of the drag direction, by a quarter of its length.
      const midX = (from.x + to.x) / 2 + (to.y - from.y) / 2;
      const midY = (from.y + to.y) / 2 - (to.x - from.x) / 2;
      return { type: "path", d: `M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}` };
    }
  }
}

/** Why a file can't be used, or null if it can. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  if (!isSvg && !isPng) return "Upload an SVG or PNG file.";
  if (file.size > MAX_IMAGE_BYTES) return "That file is too large. The limit is 300 KB.";
  return null;
}

/** A PNG this small goes blurry on a large printed sheet. */
export const isLowResolution = (pixelWidth: number, symbolWidth: number) =>
  pixelWidth < symbolWidth * 4;

/** The rows a site or the default can set, each with the built-in symbol it starts from. */
export function choiceRows(
  equipmentTypes: string[],
  builtInFor: (type: string) => string,
): Array<{ choiceKey: string; label: string; builtIn: string }> {
  const symbols = BUILT_IN_SYMBOL_KEYS.map((key) => ({
    choiceKey: `symbol:${key}`,
    label: getSymbolGeometry(key).label,
    builtIn: key,
  }));
  const types = equipmentTypes.map((type) => ({
    choiceKey: `type:${equipmentTypeKey(type)}`,
    label: type,
    builtIn: builtInFor(type),
  }));
  return [...symbols, ...types];
}

/** Drops anything that isn't a symbol choice, so a bad saved value can't reach a diagram. */
export function cleanSymbolChoices(saved: unknown): SymbolChoices {
  const source = (saved ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        /^(symbol|type):/.test(entry[0]) && typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}
