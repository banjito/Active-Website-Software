/**
 * Component variants.
 *
 * One library component can carry named variants, e.g. an insulation
 * resistance table with "3-wire" and "4-wire". A variant is the base component
 * minus some of its parts (columns, rows, fields, checklist items), so a
 * change to the base reaches every variant and new parts show up in all of
 * them until a variant hides them.
 *
 * Variants are library-only: when a component is added to a form the chosen
 * variant is applied and the section gets a plain copy, with no variant data.
 * The runtime and print never see variants.
 */

import type { SectionConfig } from '@/lib/types/customForms';
import { removeColumn } from '@/lib/customForms/v2/authoring';
import { resolveRowCount } from '@/lib/customForms/runtime/layout';
import { resolveDeviation } from '@/lib/customForms/deviation';

export interface ComponentVariant {
  id: string;
  name: string;
  /** Column ids left out of this variant. */
  hiddenColumnIds?: string[];
  /**
   * Rows left out. Conditional and V2 rows by id; plain numbered rows as
   * `index:N` (0-based), since they have no id of their own.
   */
  hiddenRowIds?: string[];
  /** Grouped-field ids left out. */
  hiddenFieldIds?: string[];
  /** Checklist item ids left out. */
  hiddenItemIds?: string[];
  /** Contact resistance Value Deviation lines (Neutral, Ground, ...) left out. */
  hiddenLineIds?: string[];
}

/** Library-only keys stored in a component's config. */
export interface LibraryMeta {
  variants?: ComponentVariant[];
  /** Category shown in the component list for a custom component. */
  libraryCategory?: string;
  /**
   * Set on a form section made from a variant. Such a section is trimmed, so
   * it must never be saved back over the full component or its default.
   */
  appliedVariant?: string;
}

export type LibraryConfig = SectionConfig & LibraryMeta;

export type VariantPartKind = 'column' | 'row' | 'field' | 'item' | 'line';

export interface VariantPart {
  kind: VariantPartKind;
  id: string;
  label: string;
}

const ROW_INDEX_PREFIX = 'index:';

export function newVariantId(): string {
  return `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The parts of a component a variant can leave out, in display order. */
export function variantParts(section: SectionConfig): VariantPart[] {
  const parts: VariantPart[] = [];

  (section.columns ?? []).forEach((c, i) =>
    parts.push({ kind: 'column', id: c.id, label: c.label || `Column ${i + 1}` })
  );

  const fixedV2Rows = (section.v2?.body ?? []).filter((r) => r.kind === 'fixed');
  if (section.conditionalRows?.length) {
    section.conditionalRows.forEach((r, i) =>
      parts.push({ kind: 'row', id: r.id, label: r.label || `Row ${i + 1}` })
    );
  } else if (fixedV2Rows.length) {
    fixedV2Rows.forEach((r, i) =>
      parts.push({
        kind: 'row',
        id: r.id,
        label: ('label' in r && r.label) || `Row ${i + 1}`,
      })
    );
  } else if (section.columns?.length) {
    // Plain numbered rows: label each by its first static cell, if any.
    const firstCol = section.columns[0]?.id;
    const count = resolveRowCount(section);
    for (let i = 0; i < count; i++) {
      const text = firstCol ? section.staticCells?.[`row${i}_${firstCol}`] : undefined;
      parts.push({
        kind: 'row',
        id: `${ROW_INDEX_PREFIX}${i}`,
        label: text ? `Row ${i + 1}: ${text}` : `Row ${i + 1}`,
      });
    }
  }

  (section.fields ?? []).forEach((f, i) =>
    parts.push({ kind: 'field', id: f.id, label: f.label || `Field ${i + 1}` })
  );

  (section.checklistItems ?? []).forEach((item, i) =>
    parts.push({
      kind: 'item',
      id: item.id,
      label: [item.netaSection, item.description].filter(Boolean).join(' ') || `Item ${i + 1}`,
    })
  );

  if (section.componentType === 'contact-resistance' && section.showDeviation !== false) {
    resolveDeviation(section).extraRows.forEach((line) =>
      parts.push({ kind: 'line', id: line.id, label: line.label })
    );
  }

  return parts;
}

/** Which hidden-id list a part kind lives in. */
export function hiddenKey(kind: VariantPartKind): keyof ComponentVariant {
  return kind === 'column'
    ? 'hiddenColumnIds'
    : kind === 'row'
      ? 'hiddenRowIds'
      : kind === 'field'
        ? 'hiddenFieldIds'
        : kind === 'line'
          ? 'hiddenLineIds'
          : 'hiddenItemIds';
}

export function isPartHidden(variant: ComponentVariant, part: VariantPart): boolean {
  return ((variant[hiddenKey(part.kind)] as string[] | undefined) ?? []).includes(part.id);
}

export function togglePart(variant: ComponentVariant, part: VariantPart): ComponentVariant {
  const key = hiddenKey(part.kind);
  const current = (variant[key] as string[] | undefined) ?? [];
  const next = current.includes(part.id)
    ? current.filter((id) => id !== part.id)
    : [...current, part.id];
  return { ...variant, [key]: next };
}

/**
 * Drop rows by index and renumber the per-cell maps (static text, formulas),
 * which are keyed `row{N}_{columnId}`; otherwise every later row would pick up
 * the text of the row above it.
 */
function removeRowIndexes(section: SectionConfig, remove: Set<number>): SectionConfig {
  if (!remove.size) return section;
  const conditional = !!section.conditionalRows?.length;
  const total = conditional ? section.conditionalRows!.length : resolveRowCount(section);
  const newIndex = new Map<number, number>();
  for (let i = 0, n = 0; i < total; i++) {
    if (!remove.has(i)) newIndex.set(i, n++);
  }
  const remap = (map?: Record<string, string>) => {
    if (!map) return map;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
      const m = key.match(/^row(\d+)_(.*)$/);
      if (!m) {
        out[key] = value;
        continue;
      }
      const to = newIndex.get(Number(m[1]));
      if (to !== undefined) out[`row${to}_${m[2]}`] = value;
    }
    return out;
  };
  const next: SectionConfig = {
    ...section,
    staticCells: remap(section.staticCells),
    cellFormulas: remap(section.cellFormulas),
  };
  if (conditional) {
    next.conditionalRows = section.conditionalRows!.filter((_, i) => !remove.has(i));
  } else {
    next.rows = Math.max(1, newIndex.size);
  }
  return next;
}

/** The config without library-only keys, ready to drop into a form. */
export function stripLibraryMeta(config: Partial<SectionConfig>): Partial<SectionConfig> {
  const { variants: _v, libraryCategory: _c, appliedVariant: _a, ...rest } = config as Partial<LibraryConfig>;
  return rest as Partial<SectionConfig>;
}

/** Apply a variant (or none, for the base) and return a plain section config. */
export function applyVariant<T extends Partial<SectionConfig>>(
  config: T,
  variant?: ComponentVariant | null
): T {
  let s = stripLibraryMeta(config) as SectionConfig;
  if (!variant) return s as unknown as T;

  for (const columnId of variant.hiddenColumnIds ?? []) {
    if (s.columns?.some((c) => c.id === columnId)) s = { ...s, ...removeColumn(s, columnId) };
  }

  const hiddenRows = new Set(variant.hiddenRowIds ?? []);
  if (hiddenRows.size) {
    if (s.conditionalRows?.length) {
      const indexes = new Set<number>();
      s.conditionalRows.forEach((r, i) => hiddenRows.has(r.id) && indexes.add(i));
      s = removeRowIndexes(s, indexes);
    } else if (s.v2?.body?.some((r) => r.kind === 'fixed')) {
      s = { ...s, v2: { ...s.v2, body: s.v2.body!.filter((r) => !hiddenRows.has(r.id)) } };
    } else {
      const indexes = new Set<number>();
      hiddenRows.forEach((id) => {
        if (id.startsWith(ROW_INDEX_PREFIX)) indexes.add(Number(id.slice(ROW_INDEX_PREFIX.length)));
      });
      s = removeRowIndexes(s, indexes);
    }
  }

  const hiddenFields = new Set(variant.hiddenFieldIds ?? []);
  if (hiddenFields.size && s.fields) s = { ...s, fields: s.fields.filter((f) => !hiddenFields.has(f.id)) };

  const hiddenItems = new Set(variant.hiddenItemIds ?? []);
  if (hiddenItems.size && s.checklistItems) {
    s = { ...s, checklistItems: s.checklistItems.filter((it) => !hiddenItems.has(it.id)) };
  }

  const hiddenLines = new Set(variant.hiddenLineIds ?? []);
  if (hiddenLines.size) {
    const dev = resolveDeviation(s);
    s = {
      ...s,
      deviation: { ...(s.deviation ?? {}), extraRows: dev.extraRows.filter((l) => !hiddenLines.has(l.id)) },
    };
  }

  return { ...s, appliedVariant: variant.name } as unknown as T;
}

/** The variant name a form section was made from, if any. */
export function appliedVariantOf(section: Partial<SectionConfig>): string | undefined {
  return (section as Partial<LibraryConfig>).appliedVariant;
}

/** A component's variants, if it has any. */
export function variantsOf(config: Partial<SectionConfig> | undefined): ComponentVariant[] {
  return ((config as Partial<LibraryConfig> | undefined)?.variants ?? []).filter(Boolean);
}

/**
 * Keep a component's variants and category when its config is overwritten
 * from a form section (which never carries them), e.g. "Update saved
 * component" or "Save as default" in the builder.
 */
export function keepLibraryMeta(
  next: SectionConfig,
  previous: Partial<SectionConfig> | undefined
): SectionConfig {
  const prev = (previous ?? {}) as Partial<LibraryConfig>;
  const out = { ...next } as LibraryConfig;
  if (out.variants === undefined && prev.variants) out.variants = prev.variants;
  if (out.libraryCategory === undefined && prev.libraryCategory) out.libraryCategory = prev.libraryCategory;
  return out;
}
