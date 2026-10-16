/**
 * Layout groups: arranging sections side by side, in a grid, in a boxed strip
 * or callout, or keeping them on one page.
 *
 * The template stays a flat list of sections. Groups and page breaks sit in
 * `structure.layout` and name sections by id, so grouping never moves a
 * value, and ungrouping is deleting an entry.
 *
 * A group is always a run of consecutive sections. Every edit here keeps it
 * that way, and `normalizeLayout` repairs anything else (a deleted section, a
 * reorder made elsewhere) by keeping each group's longest run.
 *
 * Everything here is pure: structure in, structure out.
 */

import type {
  CustomFormLayout,
  CustomFormStructure,
  LayoutGroupConfig,
  LayoutGroupKind,
  SectionConfig,
} from "@/lib/types/customForms";
import { sortedSections } from "./runtime/layout";
import type { SectionBlockV2 } from "./v2/schema";

export const LAYOUT_KIND_LABELS: Record<LayoutGroupKind, string> = {
  "side-by-side": "Side by side",
  grid: "Grid",
  strip: "Boxed strip",
  callout: "Callout",
  "keep-together": "Keep on one page",
};

export const MAX_GRID_COLUMNS = 4;

export type LayoutUnit =
  | { type: "section"; id: string; section: SectionConfig }
  | {
      type: "group";
      id: string;
      group: LayoutGroupConfig;
      sections: SectionConfig[];
    };

function clampColumns(columns: number | undefined): number {
  const n = Math.round(columns ?? 2);
  return Math.min(MAX_GRID_COLUMNS, Math.max(1, Number.isFinite(n) ? n : 2));
}

/** Indices `[start, end)` of the longest run of consecutive positions. */
function longestRun(positions: number[]): [number, number] {
  let best: [number, number] = [0, 0];
  let start = 0;
  for (let i = 1; i <= positions.length; i += 1) {
    if (i === positions.length || positions[i] !== positions[i - 1] + 1) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = i;
    }
  }
  return best;
}

/**
 * The layout with every group made a valid run and every stale id dropped.
 * Returns `undefined` when nothing is left, so the key can be removed.
 */
export function normalizeLayout(
  structure: CustomFormStructure,
): CustomFormLayout | undefined {
  const layout = structure.layout;
  if (!layout) return undefined;
  const sorted = sortedSections(structure.sections ?? []);
  const position = new Map(sorted.map((section, index) => [section.id, index]));
  const claimed = new Set<string>();
  const groups: LayoutGroupConfig[] = [];

  for (const group of layout.groups ?? []) {
    const members = [...new Set(group.sectionIds)]
      .filter((id) => position.has(id) && !claimed.has(id))
      .sort((a, b) => position.get(a)! - position.get(b)!);
    const [start, end] = longestRun(members.map((id) => position.get(id)!));
    const run = members.slice(start, end);
    if (run.length === 0) continue;
    run.forEach((id) => claimed.add(id));

    const next: LayoutGroupConfig = { ...group, sectionIds: run };
    if (next.kind === "grid") next.columns = clampColumns(next.columns);
    else delete next.columns;
    if (
      next.kind !== "side-by-side" ||
      !next.widths ||
      next.widths.length !== run.length ||
      next.widths.every((w) => w === next.widths![0])
    ) {
      delete next.widths;
    }
    if (next.kind !== "callout") delete next.tone;
    if (!next.title?.trim()) delete next.title;
    groups.push(next);
  }

  const unitIds = new Set<string>();
  const firstUnitId = (() => {
    const first = sorted[0];
    if (!first) return null;
    return groups.find((g) => g.sectionIds[0] === first.id)?.id ?? first.id;
  })();
  for (const section of sorted) if (!claimed.has(section.id)) unitIds.add(section.id);
  for (const group of groups) unitIds.add(group.id);
  const pageBreaksBefore = [...new Set(layout.pageBreaksBefore ?? [])].filter(
    (id) => unitIds.has(id) && id !== firstUnitId,
  );

  if (groups.length === 0 && pageBreaksBefore.length === 0) return undefined;
  return {
    ...(groups.length ? { groups } : {}),
    ...(pageBreaksBefore.length ? { pageBreaksBefore } : {}),
  };
}

/** The structure with its layout normalized, or the key removed. */
function withLayout(
  structure: CustomFormStructure,
  layout: CustomFormLayout | undefined,
  // Sorted, never the raw array: a stored array need not be in `order`, and
  // renumbering it by position would silently reshuffle the form.
  sections: SectionConfig[] = sortedSections(structure.sections),
): CustomFormStructure {
  const ordered = sections.map((section, order) =>
    section.order === order ? section : { ...section, order },
  );
  const { layout: _old, ...rest } = structure;
  const draft: CustomFormStructure = { ...rest, sections: ordered, layout };
  const normalized = normalizeLayout(draft);
  if (!normalized) {
    const { layout: _drop, ...flat } = draft;
    return flat;
  }
  return { ...draft, layout: normalized };
}

/** Top-level units in document order: ungrouped sections and groups. */
export function layoutUnits(structure: CustomFormStructure): LayoutUnit[] {
  const layout = normalizeLayout(structure);
  const groupOf = new Map<string, LayoutGroupConfig>();
  for (const group of layout?.groups ?? []) {
    for (const id of group.sectionIds) groupOf.set(id, group);
  }
  const byId = new Map((structure.sections ?? []).map((s) => [s.id, s]));
  const units: LayoutUnit[] = [];
  for (const section of sortedSections(structure.sections ?? [])) {
    const group = groupOf.get(section.id);
    if (!group) {
      units.push({ type: "section", id: section.id, section });
    } else if (group.sectionIds[0] === section.id) {
      units.push({
        type: "group",
        id: group.id,
        group,
        sections: group.sectionIds.map((id) => byId.get(id)!),
      });
    }
  }
  return units;
}

/** The group a section belongs to, if any. */
export function groupOfSection(
  structure: CustomFormStructure,
  sectionId: string,
): LayoutGroupConfig | undefined {
  return normalizeLayout(structure)?.groups?.find((g) =>
    g.sectionIds.includes(sectionId),
  );
}

/** Ids of the units that start a new printed page. */
export function pageBreakIds(structure: CustomFormStructure): Set<string> {
  return new Set(normalizeLayout(structure)?.pageBreaksBefore ?? []);
}

/** True when `id` is this unit or one of its sections. */
function unitHolds(unit: LayoutUnit, id: string): boolean {
  return unit.id === id || (unit.type === "group" && unit.sections.some((s) => s.id === id));
}

function flatten(units: LayoutUnit[]): SectionConfig[] {
  return units.flatMap((unit) =>
    unit.type === "section" ? [unit.section] : unit.sections,
  );
}

function newGroupId(): string {
  return `group-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Put the chosen sections in a new group of `kind`.
 *
 * The sections are gathered where the first of them sits. Any that were in
 * another group leave it; a group they leave keeps its other members.
 */
export function groupSections(
  structure: CustomFormStructure,
  sectionIds: string[],
  kind: LayoutGroupKind,
): { structure: CustomFormStructure; groupId: string | null } {
  const chosen = new Set(sectionIds);
  const sorted = sortedSections(structure.sections);
  const selected = sorted.filter((s) => chosen.has(s.id));
  if (selected.length === 0) return { structure, groupId: null };

  const layout = normalizeLayout(structure) ?? {};
  const breaks = new Set(layout.pageBreaksBefore ?? []);
  const units = layoutUnits(structure);
  const firstId = selected[0].id;
  // Regrouping a whole group (e.g. switching it to a grid this way) keeps its
  // id, heading and page break rather than starting from nothing.
  const previous = layout.groups?.find(
    (g) => g.sectionIds.includes(firstId) && g.sectionIds.every((id) => chosen.has(id)),
  );
  const groupId = previous?.id ?? newGroupId();

  const ordered: SectionConfig[] = [];
  let carriesBreak = false;
  for (const unit of units) {
    const members = unit.type === "section" ? [unit.section] : unit.sections;
    const remaining = members.filter((s) => !chosen.has(s.id));
    const holdsFirst = members.some((s) => s.id === firstId);
    // A break on the spot the group takes over moves to the group.
    if (holdsFirst && remaining.length === 0 && breaks.has(unit.id)) {
      carriesBreak = true;
    }
    ordered.push(...remaining);
    if (holdsFirst) ordered.push(...selected);
  }

  const groups = (layout.groups ?? [])
    .map((g) => ({
      ...g,
      sectionIds: g.sectionIds.filter((id) => !chosen.has(id)),
    }))
    .filter((g) => g.sectionIds.length > 0);
  groups.push({
    id: groupId,
    kind,
    sectionIds: selected.map((s) => s.id),
    ...(kind === "grid"
      ? {
          columns:
            previous?.columns ??
            Math.min(MAX_GRID_COLUMNS, Math.max(2, selected.length)),
        }
      : {}),
    ...(kind === "callout" ? { tone: previous?.tone ?? ("info" as const) } : {}),
    ...(previous?.title ? { title: previous.title } : {}),
  });

  const pageBreaksBefore = [...breaks].filter((id) => !chosen.has(id));
  if (carriesBreak) pageBreaksBefore.push(groupId);

  return {
    structure: withLayout(structure, { groups, pageBreaksBefore }, ordered),
    groupId,
  };
}

/** Dissolve a group. Its sections stay where they are, one under another. */
export function ungroup(
  structure: CustomFormStructure,
  groupId: string,
): CustomFormStructure {
  const layout = normalizeLayout(structure);
  const group = layout?.groups?.find((g) => g.id === groupId);
  if (!layout || !group) return structure;
  const pageBreaksBefore = (layout.pageBreaksBefore ?? []).map((id) =>
    id === groupId ? group.sectionIds[0] : id,
  );
  return withLayout(structure, {
    groups: (layout.groups ?? []).filter((g) => g.id !== groupId),
    pageBreaksBefore,
  });
}

/** Take one section out of its group. It lands just after the group. */
export function removeFromGroup(
  structure: CustomFormStructure,
  sectionId: string,
): CustomFormStructure {
  const layout = normalizeLayout(structure);
  const group = layout?.groups?.find((g) => g.sectionIds.includes(sectionId));
  if (!layout || !group) return structure;
  const remaining = group.sectionIds.filter((id) => id !== sectionId);

  const sorted = sortedSections(structure.sections);
  const moving = sorted.find((s) => s.id === sectionId)!;
  const rest = sorted.filter((s) => s.id !== sectionId);
  const lastRemaining = remaining[remaining.length - 1];
  // A group's only section stays where the box was, not at the end.
  const insertAt = lastRemaining
    ? rest.findIndex((s) => s.id === lastRemaining) + 1
    : sorted.indexOf(moving);
  rest.splice(insertAt, 0, moving);

  const groups = (layout.groups ?? []).map((g) =>
    g.id === group.id
      ? { ...g, sectionIds: remaining, widths: undefined }
      : g,
  );
  const pageBreaksBefore = (layout.pageBreaksBefore ?? []).map((id) =>
    id === group.id && remaining.length === 0 ? sectionId : id,
  );
  return withLayout(structure, { groups, pageBreaksBefore }, rest);
}

/** Move a section one place earlier (-1) or later (+1) inside its group. */
export function moveWithinGroup(
  structure: CustomFormStructure,
  sectionId: string,
  delta: -1 | 1,
): CustomFormStructure {
  const layout = normalizeLayout(structure);
  const group = layout?.groups?.find((g) => g.sectionIds.includes(sectionId));
  if (!layout || !group) return structure;
  const from = group.sectionIds.indexOf(sectionId);
  const to = from + delta;
  if (to < 0 || to >= group.sectionIds.length) return structure;

  const sorted = sortedSections(structure.sections);
  const a = sorted.findIndex((s) => s.id === sectionId);
  const b = sorted.findIndex((s) => s.id === group.sectionIds[to]);
  [sorted[a], sorted[b]] = [sorted[b], sorted[a]];

  const groups = (layout.groups ?? []).map((g) => {
    if (g.id !== group.id || !g.widths) return g;
    const widths = [...g.widths];
    [widths[from], widths[to]] = [widths[to], widths[from]];
    return { ...g, widths };
  });
  return withLayout(structure, { ...layout, groups }, sorted);
}

/** Change a group's kind or settings. */
export function updateGroup(
  structure: CustomFormStructure,
  groupId: string,
  patch: Partial<Omit<LayoutGroupConfig, "id" | "sectionIds">>,
): CustomFormStructure {
  const layout = normalizeLayout(structure);
  if (!layout?.groups?.some((g) => g.id === groupId)) return structure;
  const groups = layout.groups.map((g) => {
    if (g.id !== groupId) return g;
    const next = { ...g, ...patch };
    if (patch.kind === "grid" && next.columns == null) {
      next.columns = Math.min(MAX_GRID_COLUMNS, Math.max(2, g.sectionIds.length));
    }
    if (patch.kind === "callout" && !next.tone) next.tone = "info";
    return next;
  });
  return withLayout(structure, { ...layout, groups });
}

/** Start (or stop starting) a new printed page at a section or group. */
export function togglePageBreakBefore(
  structure: CustomFormStructure,
  unitId: string,
): CustomFormStructure {
  const layout = normalizeLayout(structure) ?? {};
  const breaks = new Set(layout.pageBreaksBefore ?? []);
  if (breaks.has(unitId)) breaks.delete(unitId);
  else breaks.add(unitId);
  return withLayout(structure, { ...layout, pageBreaksBefore: [...breaks] });
}

/**
 * Reorder top-level units by drag: `activeId` takes `overId`'s place. Either
 * may be a section or a group; a group moves with all its sections.
 */
export function moveUnit(
  structure: CustomFormStructure,
  activeId: string,
  overId: string,
): CustomFormStructure {
  const units = layoutUnits(structure);
  const from = units.findIndex((u) => unitHolds(u, activeId));
  const to = units.findIndex((u) => unitHolds(u, overId));
  if (from === -1 || to === -1 || from === to) return structure;
  const next = [...units];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return withLayout(structure, normalizeLayout(structure), flatten(next));
}

/**
 * Where a section dropped on `overId` is inserted, as an index into the
 * sorted section list: before it, or after it when dropped on its lower half.
 * A group counts as one block, so a drop never lands inside one.
 */
export function insertIndexForDrop(
  structure: CustomFormStructure,
  overId: string,
  after = false,
): number {
  const sorted = sortedSections(structure.sections);
  // A section inside a group stands for its whole group, so a drop can never
  // land between two members and split them.
  const group = normalizeLayout(structure)?.groups?.find(
    (g) => g.id === overId || g.sectionIds.includes(overId),
  );
  const ids = group ? group.sectionIds : [overId];
  const anchor = after ? ids[ids.length - 1] : ids[0];
  const index = sorted.findIndex((s) => s.id === anchor);
  if (index < 0) return sorted.length;
  return after ? index + 1 : index;
}

// ---------------------------------------------------------------------------
// Fitting sections into columns
// ---------------------------------------------------------------------------

/**
 * The narrowest a section can be drawn before its labels run into each other,
 * in rem. Sections go into columns only when each gets at least this much;
 * otherwise they wrap onto the next line, on screen and on paper alike.
 * Squeezing a five-column Job Details into a third of the page is what made
 * its headings print on top of each other.
 */
export function sectionMinWidthRem(section: SectionBlockV2): number {
  const content = section.content;
  switch (content.kind) {
    case "table":
      return Math.max(16, content.table.columns.length * 4.5);
    case "fields":
      return Math.max(14, content.columns * 8);
    case "checklist":
      return 26;
    case "signatures":
      return 16;
    case "field":
      return 14;
    default:
      return 12;
  }
}

/** Printable width of a portrait Letter page, roughly, in rem. */
export const PRINT_WIDTH_REM = 45;
const PRINT_GAP_REM = 0.5;

/**
 * Flex value for one side-by-side member. Basis 0 makes the widths follow the
 * weights exactly; the member's min-width is what makes the row wrap.
 */
export function sideBySideFlex(weight: number | undefined): string {
  return `${Math.max(1, weight ?? 1)} 1 0%`;
}

/** CSS min-width for a member that never overflows a phone. */
export function memberMinWidth(rem: number): string {
  return `min(100%, ${rem}rem)`;
}

/**
 * Grid columns: at most `columns` per row, fewer when a member would be
 * narrower than `minRem`. `min(100%, …)` keeps one column from overflowing.
 */
export function gridTemplate(columns: number | undefined, minRem: number): string {
  const n = clampColumns(columns);
  return `repeat(auto-fill, minmax(min(100%, max(${minRem}rem, calc((100% - ${n - 1}rem) / ${n}))), 1fr))`;
}

/**
 * Whether a group still sits in columns on a printed page. `false` means it
 * will wrap, which the builder warns about so nobody finds out from a PDF.
 */
export function fitsOnPaper(
  kind: LayoutGroupKind,
  minWidthsRem: number[],
  columns?: number,
): boolean {
  if (minWidthsRem.length < 2) return true;
  if (kind === "side-by-side") {
    const total = minWidthsRem.reduce((sum, w) => sum + w, 0);
    return total + PRINT_GAP_REM * (minWidthsRem.length - 1) <= PRINT_WIDTH_REM;
  }
  if (kind === "grid") {
    const n = Math.min(clampColumns(columns), minWidthsRem.length);
    return Math.max(...minWidthsRem) * n + PRINT_GAP_REM * (n - 1) <= PRINT_WIDTH_REM;
  }
  return true;
}

/** Width presets offered for a side-by-side group of `count` sections. */
export function widthPresets(
  count: number,
): Array<{ label: string; widths: number[] | undefined }> {
  const presets: Array<{ label: string; widths: number[] | undefined }> = [
    { label: "Equal widths", widths: undefined },
  ];
  if (count < 2) return presets;
  const names =
    count === 2
      ? ["Left", "Right"]
      : count === 3
        ? ["Left", "Middle", "Right"]
        : Array.from({ length: count }, (_, i) => `Section ${i + 1}`);
  names.forEach((name, i) => {
    presets.push({
      label: `${name} wider`,
      widths: Array.from({ length: count }, (_, j) => (j === i ? 2 : 1)),
    });
  });
  return presets;
}

/**
 * Point the layout at the sections that replaced `oldId`, e.g. after a section
 * is rebuilt from a prompt. `structure.sections` must already hold them.
 */
export function replaceSectionInLayout(
  structure: CustomFormStructure,
  oldId: string,
  newIds: string[],
): CustomFormStructure {
  const layout = structure.layout;
  if (!layout || newIds.length === 0) return structure;
  const swap = (ids: string[]) =>
    ids.flatMap((id) => (id === oldId ? newIds : [id]));
  return withLayout(structure, {
    groups: layout.groups?.map((g) => ({ ...g, sectionIds: swap(g.sectionIds) })),
    pageBreaksBefore: layout.pageBreaksBefore?.map((id) =>
      id === oldId ? newIds[0] : id,
    ),
  });
}

/** The structure with its layout tidied, e.g. after sections were deleted. */
export function tidyLayout(structure: CustomFormStructure): CustomFormStructure {
  if (!structure.layout) return structure;
  return withLayout(structure, structure.layout, sortedSections(structure.sections));
}

/**
 * Put `section` (a copy, say) straight after `afterId`. When `afterId` is in a
 * group the new section joins it, so duplicating one of a side-by-side pair
 * adds a third column instead of a section at the far end of the form.
 */
export function placeAfterSection(
  structure: CustomFormStructure,
  afterId: string,
  section: SectionConfig,
): CustomFormStructure {
  const sorted = sortedSections(structure.sections);
  const index = sorted.findIndex((s) => s.id === afterId);
  sorted.splice(index < 0 ? sorted.length : index + 1, 0, section);
  const layout = normalizeLayout(structure);
  if (!layout) return withLayout(structure, undefined, sorted);
  const groups = layout.groups?.map((g) => {
    const at = g.sectionIds.indexOf(afterId);
    if (at < 0) return g;
    const sectionIds = [...g.sectionIds];
    sectionIds.splice(at + 1, 0, section.id);
    return { ...g, sectionIds };
  });
  return withLayout(structure, { ...layout, groups }, sorted);
}
