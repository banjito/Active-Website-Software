/** Deciding when an export is a new revision. */

import type { DiagramContents } from "@/lib/types/siteDiagrams";

const byId = <Row extends { id: string }>(a: Row, b: Row) => a.id.localeCompare(b.id);

/** A small, fast string hash. It only has to notice changes, not protect anything. */
function hash(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

/**
 * What printed, as a fingerprint. Only what shows on the sheet counts, and rows are sorted, so
 * the same drawing always gives the same fingerprint however it was reached.
 */
export function contentFingerprint(contents: DiagramContents, diagramName: string): string {
  const symbols = [...contents.symbols]
    .sort(byId)
    .map((row) => [row.id, row.asset_id, row.symbol_key, row.label, row.label_width, row.x, row.y, row.width, row.asset?.identifier ?? null]);
  const lines = [...contents.lines]
    .sort(byId)
    .map((row) => [row.id, row.from_symbol_id, row.to_symbol_id, row.from_port, row.to_port, row.voltage_volts, row.voltage_kind]);
  return hash(JSON.stringify([diagramName, symbols, lines]));
}

/** The first export is Rev 1. After that it only goes up if the drawing changed. */
export function nextRevision(
  state: { revision: number; export_hash: string | null } | undefined,
  fingerprint: string,
): { revision: number; changed: boolean } {
  if (!state) return { revision: 1, changed: true };
  if (state.export_hash === fingerprint) return { revision: state.revision, changed: false };
  return { revision: state.revision + 1, changed: true };
}
