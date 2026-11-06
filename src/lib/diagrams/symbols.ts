/**
 * Built-in single-line diagram symbols.
 *
 * Symbols are plain shape data, not components, so the screen and the PDF export draw
 * from one source and cannot drift apart. Nothing here sets a color: shapes are drawn in
 * the surrounding text color, which is what gives dark mode for free.
 *
 * Power flows top to bottom, so a symbol's upstream side is its top. Sources connect only
 * at the bottom and loads only at the top. Breakers also connect at the sides, for ties.
 *
 * Port ids are stored on neta_ops.diagram_lines, so renaming one breaks saved lines.
 */

type BaseShape =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; x: number; y: number; width: number; height: number; filled?: boolean }
  | { type: "circle"; cx: number; cy: number; r: number; filled?: boolean }
  | { type: "path"; d: string; filled?: boolean }
  | { type: "text"; x: number; y: number; text: string; size: number }
  | { type: "image"; x: number; y: number; width: number; height: number; href: string };

/** `part` marks the downstream half of a symbol that changes voltage, so it can color apart. */
export type SymbolShape = BaseShape & { part?: "bottom" };

/** A point where a line attaches, measured from the symbol's top left corner. */
export interface SymbolPort {
  id: string;
  x: number;
  y: number;
}

export interface SymbolGeometry {
  key: string;
  label: string;
  width: number;
  height: number;
  shapes: SymbolShape[];
  ports: SymbolPort[];
  /** A deleted custom symbol, which keeps drawing where it's used. */
  retired?: boolean;
}

export const BUILT_IN_SYMBOL_KEYS = [
  "utility",
  "generator",
  "transformer",
  "breaker",
  "switch",
  "fuse",
  "cable",
  "link",
  "bus",
  "ats",
  "ups",
  "panel",
  "mcc",
  "motor",
  "load",
  "generic",
] as const;

export type BuiltInSymbolKey = (typeof BUILT_IN_SYMBOL_KEYS)[number];

export const GENERIC_SYMBOL_KEY: BuiltInSymbolKey = "generic";

/** Taps along a bus sit this far apart, measured from its left end. */
export const BUS_TAP_SPACING = 40;
export const BUS_DEFAULT_WIDTH = 240;
export const BUS_HEIGHT = 6;

const SIZE = 60;
const MID = SIZE / 2;

const stem = (y1: number, y2: number, x = MID): SymbolShape => ({ type: "line", x1: x, y1, x2: x, y2 });
const box = (x: number, y: number, width: number, height: number): SymbolShape => ({ type: "rect", x, y, width, height });
const ring = (cy: number, r: number): SymbolShape => ({ type: "circle", cx: MID, cy, r });
const letters = (text: string, cy: number, size: number, x = MID): SymbolShape => ({
  type: "text",
  x,
  // Set by baseline, not dominant-baseline, which the PDF export doesn't honor.
  y: cy + size * 0.35,
  text,
  size,
});

const portTop: SymbolPort = { id: "top", x: MID, y: 0 };
const portBottom: SymbolPort = { id: "bottom", x: MID, y: SIZE };

/** A labelled box on a straight run, such as a UPS. */
const labelledBox = (key: string, label: string, text: string, size: number): SymbolGeometry => ({
  key,
  label,
  width: SIZE,
  height: SIZE,
  shapes: [stem(0, 15), box(8, 15, 44, 30), letters(text, MID, size), stem(45, SIZE)],
  ports: [portTop, portBottom],
});

const FIXED_SYMBOLS: Record<Exclude<BuiltInSymbolKey, "bus">, SymbolGeometry> = {
  utility: {
    key: "utility",
    label: "Utility",
    width: SIZE,
    height: SIZE,
    shapes: [{ type: "path", d: "M10 6 H50 L30 36 Z" }, stem(36, SIZE)],
    ports: [portBottom],
  },
  generator: {
    key: "generator",
    label: "Generator",
    width: SIZE,
    height: SIZE,
    shapes: [ring(24, 22), letters("G", 24, 22), stem(46, SIZE)],
    ports: [portBottom],
  },
  transformer: {
    key: "transformer",
    label: "Transformer",
    width: SIZE,
    height: 80,
    // Two facing coils, one winding each, so each half takes its own voltage color.
    shapes: [
      stem(0, 32),
      { type: "path", d: "M6 26 V32 a6 6 0 0 0 12 0 a6 6 0 0 0 12 0 a6 6 0 0 0 12 0 a6 6 0 0 0 12 0 V26" },
      {
        type: "path",
        d: "M6 54 V48 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 V54",
        part: "bottom",
      },
      { ...stem(48, 80), part: "bottom" },
    ],
    ports: [portTop, { id: "bottom", x: MID, y: 80 }],
  },
  breaker: {
    key: "breaker",
    label: "Breaker",
    width: SIZE,
    height: SIZE,
    shapes: [
      stem(0, 15),
      { type: "circle", cx: MID, cy: 18, r: 3 },
      { type: "circle", cx: MID, cy: 42, r: 3 },
      { type: "path", d: "M39 15 Q53 30 39 45" },
      stem(45, SIZE),
    ],
    // A tie enters at the upstream contact and leaves at the downstream one.
    ports: [portTop, portBottom, { id: "left", x: 27, y: 18 }, { id: "right", x: 33, y: 42 }],
  },
  switch: {
    key: "switch",
    label: "Switch",
    width: SIZE,
    height: SIZE,
    shapes: [
      stem(0, 13),
      { type: "circle", cx: MID, cy: 16, r: 3 },
      { type: "line", x1: 28, y1: 42, x2: 14, y2: 20 },
      { type: "circle", cx: MID, cy: 44, r: 3 },
      stem(47, SIZE),
    ],
    ports: [portTop, portBottom],
  },
  fuse: {
    key: "fuse",
    label: "Fuse",
    width: SIZE,
    height: SIZE,
    shapes: [stem(0, SIZE), box(21, 15, 18, 30)],
    ports: [portTop, portBottom],
  },
  cable: {
    key: "cable",
    label: "Cable",
    width: SIZE,
    height: SIZE,
    // The line running off to the right leads to the cable's callout box.
    shapes: [
      stem(0, 16),
      { type: "path", d: "M30 16 C16 24 44 36 30 44" },
      stem(44, SIZE),
      { type: "line", x1: 34, y1: MID, x2: SIZE, y2: MID },
    ],
    ports: [portTop, portBottom],
  },
  link: {
    key: "link",
    label: "Link",
    width: SIZE,
    height: SIZE,
    // An off-page connector. It pairs with a link of the same name on another diagram.
    shapes: [stem(0, 12), { type: "path", d: "M12 12 H48 V36 L30 48 L12 36 Z" }, stem(48, SIZE)],
    ports: [portTop, portBottom],
  },
  ats: {
    key: "ats",
    label: "Automatic Transfer Switch",
    width: 80,
    height: SIZE,
    shapes: [stem(0, 15, 20), stem(0, 15, 60), box(8, 15, 64, 30), letters("ATS", MID, 14, 40), stem(45, SIZE, 40)],
    // Two sources feed an ATS. "top" is the normal source.
    ports: [
      { id: "top", x: 20, y: 0 },
      { id: "top-emergency", x: 60, y: 0 },
      { id: "bottom", x: 40, y: SIZE },
    ],
  },
  ups: labelledBox("ups", "UPS", "UPS", 14),
  panel: {
    key: "panel",
    label: "Panelboard",
    width: SIZE,
    height: SIZE,
    shapes: [
      stem(0, 12),
      box(8, 12, 44, 36),
      { type: "line", x1: 14, y1: 22, x2: 46, y2: 22 },
      stem(22, 38, 18),
      stem(22, 38),
      stem(22, 38, 42),
      stem(48, SIZE),
    ],
    ports: [portTop, portBottom],
  },
  mcc: labelledBox("mcc", "Motor Control Center", "MCC", 14),
  motor: {
    key: "motor",
    label: "Motor",
    width: SIZE,
    height: SIZE,
    shapes: [stem(0, 14), ring(36, 22), letters("M", 36, 22)],
    ports: [portTop],
  },
  load: {
    key: "load",
    label: "Load",
    width: SIZE,
    height: SIZE,
    shapes: [stem(0, 36), { type: "path", d: "M16 36 H44 L30 58 Z", filled: true }],
    ports: [portTop],
  },
  generic: {
    key: "generic",
    label: "Equipment",
    width: SIZE,
    height: SIZE,
    shapes: [stem(0, 15), box(10, 15, 40, 30), stem(45, SIZE)],
    ports: [portTop, portBottom],
  },
};

/**
 * A bus stretches, and every feeder needs its own point along it. Taps are numbered from
 * the left end and keep their position when the right end is dragged, so saved lines stay
 * where they were.
 */
function busGeometry(width: number): SymbolGeometry {
  const ports: SymbolPort[] = [
    { id: "left", x: 0, y: BUS_HEIGHT / 2 },
    { id: "right", x: width, y: BUS_HEIGHT / 2 },
  ];
  for (let tap = 1; tap * BUS_TAP_SPACING < width; tap += 1) {
    ports.push({ id: `top-${tap}`, x: tap * BUS_TAP_SPACING, y: 0 });
    ports.push({ id: `bottom-${tap}`, x: tap * BUS_TAP_SPACING, y: BUS_HEIGHT });
  }
  return {
    key: "bus",
    label: "Bus",
    width,
    height: BUS_HEIGHT,
    shapes: [{ type: "rect", x: 0, y: 0, width, height: BUS_HEIGHT, filled: true }],
    ports,
  };
}

/**
 * The custom symbols and choices for the site on screen. They're set once when a site loads
 * and read from here, because nearly everything that touches a diagram asks for a symbol's
 * size or ports, and passing the site's setup through all of it would add a lot for little.
 */
let activeCustomSymbols = new Map<string, SymbolGeometry>();
let activeChoices: Record<string, string> = {};

export function setActiveSymbols(custom: SymbolGeometry[], choices: Record<string, string>): void {
  activeCustomSymbols = new Map(custom.map((symbol) => [symbol.key, symbol]));
  activeChoices = choices;
}

/** Symbols that can be placed on their own. Deleted ones still draw, but aren't offered. */
export const placeableCustomSymbols = () =>
  [...activeCustomSymbols.values()].filter((symbol) => !symbol.retired);

/** Equipment type is free text, so spelling differences have to land on the same key. */
export const equipmentTypeKey = (type: string) =>
  type.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * What a symbol is drawn with at this site. Its role, meaning what it does on the diagram,
 * never changes: a transformer with custom artwork still ends a voltage section.
 *
 * An equipment type's own choice wins over the choice for its built-in symbol.
 */
export function drawnSymbolKey(role: string, equipmentType?: string | null): string {
  const byType = equipmentType ? activeChoices[`type:${equipmentTypeKey(equipmentType)}`] : undefined;
  return byType ?? activeChoices[`symbol:${role}`] ?? role;
}

/**
 * What to draw for a symbol key. An unknown key gets the generic box rather than an
 * error, so one bad symbol can't stop a whole diagram from opening.
 *
 * `width` only applies to symbols that stretch, which today means the bus.
 */
export function getSymbolGeometry(key: string | null | undefined, width?: number | null): SymbolGeometry {
  if (key === "bus") return busGeometry(width && width > 0 ? width : BUS_DEFAULT_WIDTH);
  const custom = key ? activeCustomSymbols.get(key) : undefined;
  if (custom) return custom;
  return key && Object.prototype.hasOwnProperty.call(FIXED_SYMBOLS, key)
    ? FIXED_SYMBOLS[key as keyof typeof FIXED_SYMBOLS]
    : FIXED_SYMBOLS.generic;
}

/**
 * Where a saved line attaches. A port can go missing, such as a tap past the end of a bus
 * that was shortened, so this falls back to the middle of the same side. Lines stay drawn
 * rather than disappearing.
 */
export function findPort(geometry: SymbolGeometry, portId: string): SymbolPort {
  const exact = geometry.ports.find((port) => port.id === portId);
  if (exact) return exact;

  const midX = geometry.width / 2;
  const midY = geometry.height / 2;
  if (portId.startsWith("top")) return { id: portId, x: midX, y: 0 };
  if (portId.startsWith("bottom")) return { id: portId, x: midX, y: geometry.height };
  if (portId.startsWith("left")) return { id: portId, x: 0, y: midY };
  if (portId.startsWith("right")) return { id: portId, x: geometry.width, y: midY };
  return { id: portId, x: midX, y: midY };
}

/**
 * Checked in order, because equipment type is free text and order is what keeps these
 * apart: "Current Transformer" before "transformer", "Transfer Switch" and "Switchgear"
 * before "switch", "Motor Control Center" before "motor".
 *
 * Instrument transformers fall to the generic box on purpose, because a CT must not look
 * like a power transformer.
 */
const EQUIPMENT_TYPE_RULES: Array<[RegExp, BuiltInSymbolKey]> = [
  [/\b(current|potential|voltage|instrument) transformers?\b|\b(ct|pt|vt)\b/, "generic"],
  [/\bcables?\b/, "cable"],
  [/\btransfer switch|\bats\b/, "ats"],
  [/transformer|\bxfmr\b/, "transformer"],
  [/breaker|\bmccb\b/, "breaker"],
  // Gear is drawn as its bus, with its breakers feeding off it. It's where a system has
  // the most connections, and a fixed-size box has no room for them.
  [/switchgear|switchboard/, "bus"],
  [/panel/, "panel"],
  [/motor control|\bmcc\b|starter/, "mcc"],
  [/switch|disconnect/, "switch"],
  [/fuse/, "fuse"],
  [/\bbus/, "bus"],
  [/generator|\bgenset\b/, "generator"],
  [/\bups\b|uninterruptible/, "ups"],
  [/motor/, "motor"],
  [/utility/, "utility"],
  [/\bload\b/, "load"],
];

/** The built-in symbol for an asset's equipment type, or the generic box. */
export function symbolKeyForEquipmentType(equipmentType: string | null | undefined): BuiltInSymbolKey {
  const type = (equipmentType ?? "").toLowerCase().replace(/[-_]+/g, " ").trim();
  if (!type) return GENERIC_SYMBOL_KEY;
  return EQUIPMENT_TYPE_RULES.find(([pattern]) => pattern.test(type))?.[1] ?? GENERIC_SYMBOL_KEY;
}
