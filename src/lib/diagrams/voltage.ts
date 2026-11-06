/**
 * Voltage levels and their colors.
 *
 * The levels are fixed. Colors are per site: a site copies the default when its first diagram
 * is created, so changing the default never alters existing work.
 */

import { symbolKeyFor } from "@/lib/diagrams/flowElements";
import type { DiagramContents, DiagramLineRow, DiagramSymbolRow } from "@/lib/types/siteDiagrams";

export const VOLTAGE_LEVELS = [
  { key: "above_69kv", label: "Above 69 kV", color: "#6A1B9A" },
  { key: "above_15kv", label: "Above 15 kV to 69 kV", color: "#C62828" },
  { key: "above_1kv", label: "Above 1 kV to 15 kV", color: "#E65100" },
  { key: "above_240v", label: "Above 240 V to 1 kV", color: "#1565C0" },
  { key: "240v_and_below", label: "240 V and below", color: "#2E7D32" },
  { key: "dc", label: "DC", color: "#00796B" },
  { key: "not_set", label: "Not set", color: "#616161" },
] as const;

export type VoltageLevelKey = (typeof VOLTAGE_LEVELS)[number]["key"];
export type VoltageColors = Record<VoltageLevelKey, string>;

export const BUILT_IN_VOLTAGE_COLORS = Object.fromEntries(
  VOLTAGE_LEVELS.map((level) => [level.key, level.color]),
) as VoltageColors;

const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** Saved colors, with the built-in color standing in for anything missing or malformed. */
export function cleanVoltageColors(saved: unknown): VoltageColors {
  const source = (saved ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    VOLTAGE_LEVELS.map((level) => {
      const value = source[level.key];
      return [level.key, isColor(value) ? value : level.color];
    }),
  ) as VoltageColors;
}

export function voltageLevel(volts: number | null, kind: "ac" | "dc"): VoltageLevelKey {
  if (!volts) return "not_set";
  if (kind === "dc") return "dc";
  if (volts > 69000) return "above_69kv";
  if (volts > 15000) return "above_15kv";
  if (volts > 1000) return "above_1kv";
  if (volts > 240) return "above_240v";
  return "240v_and_below";
}

/**
 * What a person typed, in volts. Blank clears it, and something unreadable comes back as
 * undefined so the field can say so rather than saving a wrong number.
 */
export function parseVoltage(text: string): number | null | undefined {
  const typed = text.trim().toLowerCase().replace(/,/g, "");
  if (!typed) return null;
  const match = /^(\d*\.?\d+)\s*(kv|v)?$/.exec(typed);
  if (!match) return undefined;
  const value = Number(match[1]) * (match[2] === "kv" ? 1000 : 1);
  return value > 0 ? value : undefined;
}

export function formatVoltage(volts: number | null, kind: "ac" | "dc" = "ac"): string {
  if (!volts) return "";
  const text = volts >= 1000 ? `${Number((volts / 1000).toFixed(3))} kV` : `${volts} V`;
  return kind === "dc" ? `${text} DC` : text;
}

/**
 * A saved color as drawn on screen. Dark colors disappear on a dark background, so dark mode
 * lightens them through a value set on the page. PDFs always use the color as saved.
 */
export const voltageCss = (color: string) =>
  `color-mix(in srgb, ${color} var(--diagram-tint, 100%), white)`;

/** Voltage changes at these. Everything else carries one voltage straight through. */
const SECTION_BREAKS = new Set(["transformer", "ups"]);

const breaksSection = (symbol: DiagramSymbolRow | undefined) =>
  !symbol || SECTION_BREAKS.has(symbolKeyFor(symbol));

/** Every line sharing a voltage with this one: outward until a transformer or UPS. */
export function voltageSection(contents: DiagramContents, lineId: string): Set<string> {
  const symbols = new Map(contents.symbols.map((symbol) => [symbol.id, symbol]));
  const section = new Set<string>([lineId]);
  const waiting = [lineId];

  while (waiting.length > 0) {
    const nextId = waiting.pop();
    const line = contents.lines.find((row) => row.id === nextId);
    if (!line) continue;
    for (const symbolId of [line.from_symbol_id, line.to_symbol_id]) {
      if (breaksSection(symbols.get(symbolId))) continue;
      for (const next of contents.lines) {
        const touches = next.from_symbol_id === symbolId || next.to_symbol_id === symbolId;
        if (touches && !section.has(next.id)) {
          section.add(next.id);
          waiting.push(next.id);
        }
      }
    }
  }
  return section;
}

/** Sets a voltage on a whole section at once. */
export function setLineVoltage(
  contents: DiagramContents,
  lineId: string,
  volts: number | null,
  kind: "ac" | "dc",
): DiagramContents {
  const section = voltageSection(contents, lineId);
  const unchanged = contents.lines
    .filter((line) => section.has(line.id))
    .every((line) => line.voltage_volts === volts && line.voltage_kind === kind);
  if (unchanged) return contents;

  return {
    ...contents,
    lines: contents.lines.map((line) =>
      section.has(line.id) ? { ...line, voltage_volts: volts, voltage_kind: kind } : line,
    ),
  };
}

/** The voltage a new line picks up from the section it joins, if either end is in one. */
export function inheritedVoltage(
  contents: DiagramContents,
  fromSymbolId: string,
  toSymbolId: string,
): Pick<DiagramLineRow, "voltage_volts" | "voltage_kind"> | null {
  for (const symbolId of [fromSymbolId, toSymbolId]) {
    const symbol = contents.symbols.find((row) => row.id === symbolId);
    if (breaksSection(symbol)) continue;
    const line = contents.lines.find(
      (row) =>
        row.voltage_volts && (row.from_symbol_id === symbolId || row.to_symbol_id === symbolId),
    );
    if (line) return { voltage_volts: line.voltage_volts, voltage_kind: line.voltage_kind };
  }
  return null;
}

export const lineColor = (line: DiagramLineRow, colors: VoltageColors) =>
  colors[voltageLevel(line.voltage_volts, line.voltage_kind)];

/** Colors for a symbol's upstream and downstream halves. They only differ on a transformer. */
export interface SymbolTint {
  top?: string;
  bottom?: string;
}

/** Each symbol takes the color of its lines, so a section reads as one run of color. */
export function symbolTints(contents: DiagramContents, colors: VoltageColors): Map<string, SymbolTint> {
  const tints = new Map<string, SymbolTint>();
  for (const symbol of contents.symbols) {
    const incoming = contents.lines.find((line) => line.to_symbol_id === symbol.id);
    const outgoing = contents.lines.find((line) => line.from_symbol_id === symbol.id);
    if (!incoming && !outgoing) continue;

    const top = incoming ? voltageCss(lineColor(incoming, colors)) : undefined;
    const bottom = outgoing ? voltageCss(lineColor(outgoing, colors)) : undefined;
    tints.set(symbol.id, { top: top ?? bottom, bottom: bottom ?? top });
  }
  return tints;
}

/** One line per section carries the voltage label, so a run isn't labelled over and over. */
export function linesToLabel(contents: DiagramContents): Set<string> {
  const labelled = new Set<string>();
  const covered = new Set<string>();
  for (const line of contents.lines) {
    if (covered.has(line.id) || !line.voltage_volts) continue;
    labelled.add(line.id);
    for (const id of voltageSection(contents, line.id)) covered.add(id);
  }
  return labelled;
}

/** The levels on a diagram, in key order. */
export function levelsInUse(contents: DiagramContents) {
  const used = new Set(contents.lines.map((line) => voltageLevel(line.voltage_volts, line.voltage_kind)));
  return VOLTAGE_LEVELS.filter((level) => used.has(level.key));
}
