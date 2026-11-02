/**
 * As Found / As Left columns.
 *
 * Splitting a column makes it two real columns: the original (now "As Found",
 * keeping its id, so readings, formulas and rules that pointed at it still
 * do) and a new "As Left" beside it. The pair is remembered on the section
 * (`asFoundAsLeft.pairs`) so the table can draw one heading over both with
 * "As Found" and "As Left" beneath, and so the form can copy As Found into
 * As Left in one click.
 */

import type { ColumnConfig, SectionConfig } from '@/lib/types/customForms';
import type { HeaderCellV2, HeaderRowV2 } from '@/lib/customForms/v2/schema';
import { removeColumn } from '@/lib/customForms/v2/authoring';
import { resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';

export interface AsFoundAsLeftPair {
  /** The original column, now As Found. */
  foundId: string;
  /** The added As Left column. */
  leftId: string;
  /** Heading over both (the column's name before it was split). */
  label: string;
}

export const AS_FOUND = 'As Found';
export const AS_LEFT = 'As Left';

export function pairsOf(section: SectionConfig): AsFoundAsLeftPair[] {
  return section.asFoundAsLeft?.pairs ?? [];
}

export function pairForColumn(section: SectionConfig, columnId: string): AsFoundAsLeftPair | undefined {
  return pairsOf(section).find((p) => p.foundId === columnId || p.leftId === columnId);
}

/** Halve a CSS width ("20%" → "10%"); anything else is left as it is. */
function half(width: string | undefined): string | undefined {
  const m = width?.match(/^([\d.]+)%$/);
  return m ? `${(parseFloat(m[1]) / 2).toFixed(1)}%` : width;
}

/** Split a column into As Found (the original) and As Left (new, beside it). */
export function splitAsFoundAsLeft(section: SectionConfig, columnId: string): Partial<SectionConfig> {
  const columns = section.columns ?? [];
  const index = columns.findIndex((c) => c.id === columnId);
  if (index < 0 || pairForColumn(section, columnId)) return {};
  const original = columns[index];
  const label = original.label;
  let leftId = `${original.id}_left`;
  while (columns.some((c) => c.id === leftId)) leftId += '_';
  let leftFieldId = `${original.field.id}_left`;
  while (columns.some((c) => c.field.id === leftFieldId)) leftFieldId += '_';

  const found: ColumnConfig = {
    ...original,
    label: `${label} – ${AS_FOUND}`,
    width: half(original.width),
    field: { ...original.field, label: `${original.field.label || label} (${AS_FOUND})` },
  };
  const left: ColumnConfig = {
    ...original,
    id: leftId,
    label: `${label} – ${AS_LEFT}`,
    width: half(original.width),
    field: {
      ...original.field,
      id: leftFieldId,
      label: `${original.field.label || label} (${AS_LEFT})`,
      // Its own entry: As Left is typed, not copied by a formula of As Found's.
      equipmentPicker: undefined,
    },
  };
  const next = [...columns];
  next.splice(index, 1, found, left);
  return {
    columns: next,
    asFoundAsLeft: { pairs: [...pairsOf(section), { foundId: original.id, leftId, label }] },
  };
}

/** Undo a split: drop the As Left column and give As Found its name back. */
export function combineAsFoundAsLeft(section: SectionConfig, columnId: string): Partial<SectionConfig> {
  const pair = pairForColumn(section, columnId);
  if (!pair) return {};
  const removed = { ...section, ...removeColumn(section, pair.leftId) };
  const leftWidth = section.columns?.find((c) => c.id === pair.leftId)?.width;
  const columns = (removed.columns ?? []).map((c) => {
    if (c.id !== pair.foundId) return c;
    const a = parseFloat(c.width ?? '');
    const b = parseFloat(leftWidth ?? '');
    return {
      ...c,
      label: pair.label,
      width: c.width?.endsWith('%') && leftWidth?.endsWith('%') ? `${(a + b).toFixed(1)}%` : c.width,
      field: { ...c.field, label: c.field.label.replace(` (${AS_FOUND})`, '') },
    };
  });
  const pairs = pairsOf(section).filter((p) => p !== pair);
  return {
    ...removed,
    columns,
    asFoundAsLeft: pairs.length ? { pairs } : undefined,
  };
}

/**
 * Two header rows: each pair under one heading with As Found / As Left
 * beneath, every other column spanning both rows. A pair whose columns are no
 * longer side by side (moved, or split into other table pieces) just shows
 * its own column names. Returns null when there is nothing to group.
 */
export function pairedHeaderRows(
  sectionId: string,
  columns: readonly { id: string; label?: string }[],
  pairs: readonly AsFoundAsLeftPair[],
): HeaderRowV2[] | null {
  const grouped = pairs.filter((p) => {
    const i = columns.findIndex((c) => c.id === p.foundId);
    return i >= 0 && columns[i + 1]?.id === p.leftId;
  });
  if (!grouped.length) return null;
  const top: HeaderCellV2[] = [];
  const bottom: HeaderCellV2[] = [];
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    const pair = grouped.find((p) => p.foundId === column.id);
    if (pair) {
      top.push({ id: `${sectionId}-hdr-${column.id}`, columnId: column.id, colSpan: 2, label: pair.label, align: 'center' });
      bottom.push({ id: `${sectionId}-hdr-${column.id}-found`, columnId: column.id, label: AS_FOUND, align: 'center' });
      bottom.push({ id: `${sectionId}-hdr-${pair.leftId}-left`, columnId: pair.leftId, label: AS_LEFT, align: 'center' });
      i += 1;
      continue;
    }
    top.push({ id: `${sectionId}-hdr-${column.id}`, columnId: column.id, rowSpan: 2, label: column.label ?? '' });
  }
  return [
    { id: `${sectionId}-hdr-top`, cells: top },
    { id: `${sectionId}-hdr-sub`, cells: bottom },
  ];
}

/**
 * Copy every As Found reading into its As Left cell. Only empty As Left cells
 * are filled unless `overwrite`, so nothing typed is lost by accident.
 */
export function copyAsFoundToAsLeft(
  section: SectionConfig,
  formData: Record<string, Record<string, any>>,
  overwrite = false,
): { formData: Record<string, Record<string, any>>; copied: number } {
  const columns = section.columns ?? [];
  const fieldOf = (id: string) => columns.find((c) => c.id === id)?.field.id;
  const pairs = pairsOf(section)
    .map((p) => ({ found: fieldOf(p.foundId), left: fieldOf(p.leftId) }))
    .filter((p): p is { found: string; left: string } => !!p.found && !!p.left);
  const rows = section.conditionalRows?.length ?? resolveRowCount(section);
  const next = { ...formData };
  let copied = 0;
  for (let r = 0; r < rows; r++) {
    const key = rowStateKey(section.id, r);
    const row = { ...(next[key] ?? {}) };
    let changed = false;
    for (const { found, left } of pairs) {
      const value = row[found];
      if (value === undefined || value === null || value === '') continue;
      const current = row[left];
      if (!overwrite && current !== undefined && current !== null && current !== '') continue;
      if (current === value) continue;
      row[left] = value;
      changed = true;
      copied += 1;
    }
    if (changed) next[key] = row;
  }
  return { formData: next, copied };
}
