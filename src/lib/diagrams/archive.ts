/**
 * Archived diagrams. An archive has to keep looking the way it did, so it carries its own
 * copy of everything that lives at the site level and could change later.
 */

import { cleanSymbolChoices, type CustomSymbolRow, type SymbolChoices } from "@/lib/diagrams/customSymbols";
import { drawnKeyFor } from "@/lib/diagrams/flowElements";
import { cleanVoltageColors, type VoltageColors } from "@/lib/diagrams/voltage";
import type { DiagramContents } from "@/lib/types/siteDiagrams";

export interface ArchiveSnapshot {
  voltage_colors: VoltageColors;
  symbol_choices: SymbolChoices;
  /** Only the symbols this diagram draws, so an archive doesn't carry the whole library. */
  custom_symbols: CustomSymbolRow[];
}

export function buildArchiveSnapshot(
  contents: DiagramContents,
  voltageColors: VoltageColors,
  choices: SymbolChoices,
  library: CustomSymbolRow[],
): ArchiveSnapshot {
  const drawn = new Set(contents.symbols.map(drawnKeyFor));
  return {
    voltage_colors: voltageColors,
    symbol_choices: choices,
    custom_symbols: library.filter((symbol) => drawn.has(`custom:${symbol.id}`)),
  };
}

/** A snapshot from the database, safe to use even if it's incomplete. */
export function readArchiveSnapshot(saved: unknown): ArchiveSnapshot {
  const source = (saved ?? {}) as Partial<ArchiveSnapshot>;
  return {
    voltage_colors: cleanVoltageColors(source.voltage_colors),
    symbol_choices: cleanSymbolChoices(source.symbol_choices),
    custom_symbols: Array.isArray(source.custom_symbols) ? source.custom_symbols : [],
  };
}

/** A fresh copy for a new diagram, with new ids and every line still joining the same items. */
export function copyContents(
  contents: DiagramContents,
  diagramId: string,
  newId: () => string = () => crypto.randomUUID(),
): DiagramContents {
  const ids = new Map(contents.symbols.map((symbol) => [symbol.id, newId()]));
  const mapped = (id: string) => ids.get(id) ?? id;

  return {
    symbols: contents.symbols.map((symbol) => ({
      ...symbol,
      id: mapped(symbol.id),
      diagram_id: diagramId,
    })),
    lines: contents.lines.map((line) => ({
      ...line,
      id: newId(),
      diagram_id: diagramId,
      from_symbol_id: mapped(line.from_symbol_id),
      to_symbol_id: mapped(line.to_symbol_id),
    })),
  };
}

/** Assets a user can choose to retire when archiving, one per asset. */
export function archivableAssets(contents: DiagramContents) {
  const seen = new Map<string, { id: string; identifier: string }>();
  for (const { asset } of contents.symbols) {
    if (asset && !asset.deleted_at && asset.status !== "retired") {
      seen.set(asset.id, { id: asset.id, identifier: asset.identifier });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
  );
}
