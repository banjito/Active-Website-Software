/**
 * Moving a saved report onto a newer published version of its form.
 *
 * Reports are pinned to the form version they were created with (see
 * versioning.ts). When the form is improved, a report that is not finished yet
 * can be moved onto the new version. These are the pure pieces of that:
 *
 *   diffFormVersions     what the new version changes, in plain words, and
 *                        which filled-in values the new version no longer shows
 *   upgradeRuntimeData   the report's values laid onto the new version
 *   upgradedStatus       the overall PASS/FAIL after the move
 *
 * The compare screen and the report's own preview both use these, so the
 * preview shows exactly what the update will save.
 *
 * Nothing is deleted: values for fields the new version dropped stay in the
 * saved data, they just are not shown or printed.
 *
 * Approved and sent reports never move (isFormVersionLocked). They keep the
 * version they were issued with.
 */

import type {
  CustomFormStructure,
  CustomFormTemplate,
  SectionConfig,
} from "@/lib/types/customForms";
import { canonicalJson } from "./checksum";
import {
  seedCellDefaults,
  seedContactResistanceRows,
  type FormData,
} from "./runtime/rowMutations";

/** Report statuses that keep the form version they were issued with. */
export function isFormVersionLocked(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "approved" || s === "sent";
}

// ---------------------------------------------------------------------------
// What a section stores values under
// ---------------------------------------------------------------------------

interface Slot {
  id: string;
  label: string;
}

/** Every key a section stores values under, with the label people see. */
function sectionSlots(section: SectionConfig): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined, label: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: (label || "").trim() || id });
  };
  for (const f of section.fields ?? []) add(f.id, f.label);
  if (section.field) add(section.field.id, section.field.label || section.title);
  for (const f of section.aboveTableFields ?? []) add(f.id, f.label);
  for (const c of section.columns ?? []) add(c.field?.id ?? c.id, c.label || c.field?.label);
  for (const s of section.settingFields ?? []) add(s.id, s.label);
  for (const item of section.checklistItems ?? []) {
    add(item.id, [item.netaSection, item.description].filter(Boolean).join(" "));
  }
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The section's own block plus each of its table rows. */
function sectionBlocks(sectionId: string, data: FormData): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  if (data[sectionId] && typeof data[sectionId] === "object") blocks.push(data[sectionId]);
  const rowKey = new RegExp(`^${escapeRegExp(sectionId)}_row\\d+$`);
  for (const [key, value] of Object.entries(data)) {
    if (rowKey.test(key) && value && typeof value === "object") blocks.push(value);
  }
  return blocks;
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function showValue(v: unknown): string {
  if (v === true) return "✓";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return "(filled in)";
  const text = String(v).replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface SectionChange {
  sectionId: string;
  /** Title in the new version (the old one for a removed section). */
  title: string;
  kind: "added" | "removed" | "changed";
  renamedFrom?: string;
  /** Labels of fields / columns / checklist items. */
  added: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
  moved: boolean;
  /** Something else changed: formulas, defaults, choices, print layout… */
  otherChanges: boolean;
  /** Shown on screen but left out of the printed report (new version). */
  screenOnly?: boolean;
}

export interface HiddenValue {
  sectionTitle: string;
  label: string;
  value: string;
}

export interface FormVersionDiff {
  sections: SectionChange[];
  /** Filled-in values the new version no longer shows. Kept in the saved data. */
  hiddenValues: HiddenValue[];
  /** Form-wide settings changed (result choices, colour keywords…). */
  settingsChanged: boolean;
  /** The two versions are identical. */
  identical: boolean;
}

/** A section with the parts compared one by one taken out, to spot "other" changes. */
function sectionRest(section: SectionConfig): string {
  const {
    order: _order,
    title: _title,
    fields,
    field,
    aboveTableFields,
    columns,
    settingFields,
    checklistItems,
    ...rest
  } = section;
  // Labels are compared separately; everything else about a slot counts here.
  const strip = <T extends { label?: string; description?: string }>(list?: T[]) =>
    (list ?? []).map(({ label: _l, description: _d, ...r }) => r);
  return canonicalJson({
    rest,
    fields: strip(fields),
    field: field ? strip([field]) : null,
    aboveTableFields: strip(aboveTableFields),
    columns: (columns ?? []).map(({ label: _l, field: f, ...r }) => ({
      ...r,
      field: f ? strip([f])[0] : null,
    })),
    settingFields: strip(settingFields),
    checklistItems: strip(checklistItems),
  });
}

export function diffFormVersions(
  oldStructure: CustomFormStructure,
  newStructure: CustomFormStructure,
  oldData: FormData,
): FormVersionDiff {
  const identical = canonicalJson(oldStructure) === canonicalJson(newStructure);
  const oldSections = [...(oldStructure.sections ?? [])].sort((a, b) => a.order - b.order);
  const newSections = [...(newStructure.sections ?? [])].sort((a, b) => a.order - b.order);
  const oldById = new Map(oldSections.map((s) => [s.id, s]));
  const newById = new Map(newSections.map((s) => [s.id, s]));

  // Relative order of the sections both versions have, to tell a move.
  const commonOld = oldSections.filter((s) => newById.has(s.id)).map((s) => s.id);
  const commonNew = newSections.filter((s) => oldById.has(s.id)).map((s) => s.id);

  const sections: SectionChange[] = [];
  const hiddenValues: HiddenValue[] = [];

  const valuesFor = (section: SectionConfig, slots: Slot[]) => {
    const blocks = sectionBlocks(section.id, oldData);
    for (const slot of slots) {
      const filled = blocks.map((b) => b[slot.id]).filter(hasValue);
      if (filled.length === 0) continue;
      hiddenValues.push({
        sectionTitle: section.title || "Untitled section",
        label: slot.label,
        value:
          filled.length === 1
            ? showValue(filled[0])
            : `${filled.length} values (${showValue(filled[0])}, …)`,
      });
    }
  };

  for (const section of newSections) {
    const previous = oldById.get(section.id);
    if (!previous) {
      sections.push({
        sectionId: section.id,
        title: section.title || "Untitled section",
        kind: "added",
        added: sectionSlots(section).map((s) => s.label),
        removed: [],
        renamed: [],
        moved: false,
        otherChanges: false,
        screenOnly: section.showInPrint === false,
      });
      continue;
    }
    if (canonicalJson({ ...previous, order: 0 }) === canonicalJson({ ...section, order: 0 })) {
      const moved = commonOld.indexOf(section.id) !== commonNew.indexOf(section.id);
      if (moved) {
        sections.push({
          sectionId: section.id,
          title: section.title || "Untitled section",
          kind: "changed",
          added: [],
          removed: [],
          renamed: [],
          moved: true,
          otherChanges: false,
        });
      }
      continue;
    }

    const oldSlots = sectionSlots(previous);
    const newSlots = sectionSlots(section);
    const oldSlotById = new Map(oldSlots.map((s) => [s.id, s]));
    const newSlotIds = new Set(newSlots.map((s) => s.id));
    const removedSlots = oldSlots.filter((s) => !newSlotIds.has(s.id));
    valuesFor(previous, removedSlots);

    const renamed = newSlots
      .filter((s) => oldSlotById.has(s.id) && oldSlotById.get(s.id)!.label !== s.label)
      .map((s) => ({ from: oldSlotById.get(s.id)!.label, to: s.label }));

    sections.push({
      sectionId: section.id,
      title: section.title || "Untitled section",
      kind: "changed",
      renamedFrom: previous.title !== section.title ? previous.title || "Untitled section" : undefined,
      added: newSlots.filter((s) => !oldSlotById.has(s.id)).map((s) => s.label),
      removed: removedSlots.map((s) => s.label),
      renamed,
      moved: commonOld.indexOf(section.id) !== commonNew.indexOf(section.id),
      otherChanges: sectionRest(previous) !== sectionRest(section),
      screenOnly:
        previous.showInPrint !== false && section.showInPrint === false ? true : undefined,
    });
  }

  for (const section of oldSections) {
    if (newById.has(section.id)) continue;
    sections.push({
      sectionId: section.id,
      title: section.title || "Untitled section",
      kind: "removed",
      added: [],
      removed: sectionSlots(section).map((s) => s.label),
      renamed: [],
      moved: false,
      otherChanges: false,
    });
    valuesFor(section, sectionSlots(section));
  }

  return {
    sections,
    hiddenValues,
    settingsChanged:
      canonicalJson(oldStructure.settings ?? {}) !== canonicalJson(newStructure.settings ?? {}),
    identical,
  };
}

// ---------------------------------------------------------------------------
// Values onto the new version
// ---------------------------------------------------------------------------

const columnKey = (c: NonNullable<SectionConfig["columns"]>[number]) => c.field?.id ?? c.id;

/**
 * The report's values laid onto the new version.
 *
 * Every value keeps its place (values are stored by section and field id, so a
 * field that survived the edit keeps its reading). Parts that are new in this
 * version start the way they would on a brand-new report: contact-resistance
 * rows and per-cell starting values. Nothing already in the report is
 * overwritten, and nothing the new version dropped is deleted.
 *
 * Deliberately NOT re-run: job details, the asset prefill and the blank
 * temperature/humidity seed. Those happened when the report was created, and
 * running them again could change values somebody already checked.
 */
export function upgradeRuntimeData(
  oldStructure: CustomFormStructure,
  newTemplate: CustomFormTemplate,
  runtime: FormData,
): FormData {
  const oldById = new Map((oldStructure.sections ?? []).map((s) => [s.id, s]));
  const brandNew: SectionConfig[] = [];
  const withNewParts: SectionConfig[] = [];
  for (const section of newTemplate.structure.sections ?? []) {
    const previous = oldById.get(section.id);
    if (!previous) {
      brandNew.push(section);
      withNewParts.push(section);
      continue;
    }
    // Columns added to a table the report already had get their starting values.
    const oldColumns = new Set((previous.columns ?? []).map(columnKey));
    const newColumns = (section.columns ?? []).filter((c) => !oldColumns.has(columnKey(c)));
    if (newColumns.length > 0 && section.cellDefaults) {
      withNewParts.push({ ...section, columns: newColumns });
    }
  }
  if (withNewParts.length === 0) return runtime;

  const only = (sections: SectionConfig[]): CustomFormTemplate => ({
    ...newTemplate,
    structure: { ...newTemplate.structure, sections },
  });
  // Both only fill what is missing, never what is already there.
  let next = seedContactResistanceRows(only(brandNew), runtime);
  next = seedCellDefaults(only(withNewParts), next);
  return next;
}

/**
 * The overall result after the move. A result picked by hand (one that
 * disagreed with the readings before) stays; one that followed the readings
 * follows them on the new version too.
 */
export function upgradedStatus(args: {
  saved: string | null | undefined;
  oldStructure: CustomFormStructure;
  oldData: FormData;
  newStructure: CustomFormStructure;
  newData: FormData;
  auto: (structure: CustomFormStructure, data: FormData) => string | null;
}): string | null {
  const { saved, auto } = args;
  const before = auto(args.oldStructure, args.oldData);
  const manual = !!saved && before !== null && saved !== before;
  if (manual) return saved ?? null;
  return auto(args.newStructure, args.newData) ?? saved ?? null;
}

/** One-line summary for the report history. */
export function summarizeDiff(diff: FormVersionDiff): string {
  const added = diff.sections.filter((s) => s.kind === "added").length;
  const removed = diff.sections.filter((s) => s.kind === "removed").length;
  const changed = diff.sections.filter((s) => s.kind === "changed").length;
  const parts = [
    added && `${added} section${added === 1 ? "" : "s"} added`,
    removed && `${removed} removed`,
    changed && `${changed} changed`,
    diff.hiddenValues.length &&
      `${diff.hiddenValues.length} value${diff.hiddenValues.length === 1 ? "" : "s"} no longer shown`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "No layout changes";
}
