/**
 * Instance state: the durable V2 shape, and adapters to and from V1.
 *
 * V1 stored everything in one flat map keyed by `sectionId` or
 * `sectionId_row{N}`. Row identity was the array index, so a row's values were
 * whatever happened to sit at that position when the form reopened, and a
 * template whose row count changed silently re-pointed every value below it.
 *
 * V2 gives every runtime-added row a stable id that is minted once and
 * persisted. The renderer still addresses rows by index (moving it to
 * id-addressing is phase 2 work), so this module projects V2 down to the flat
 * runtime map and merges runtime edits back up, preserving ids by order.
 *
 * KNOWN LIMITATION until the renderer addresses rows by id: removing a row
 * from the middle of a table re-associates ids by position, so the LAST id in
 * that section disappears rather than the removed row's. Values stay correct
 * against what the user sees. Only contact-resistance tables can delete from
 * the middle today.
 */

import type { CustomFormStructure, SectionConfig } from "@/lib/types/customForms";
import { classifySection } from "./runtime/sectionKind";
import { resolveRowCount, rowStateKey } from "./runtime/layout";

export const CURRENT_INSTANCE_SCHEMA_VERSION = 2;

export interface RowInstanceV2 {
  /** Minted once, persisted forever. */
  rowInstanceId: string;
  /** The conditional-row definition this row came from, when it has one. */
  rowDefinitionId?: string;
  order: number;
  /** columnId or fieldId to value. */
  values: Record<string, unknown>;
}

export interface RepeaterInstanceV2 {
  groupInstanceId: string;
  order: number;
  label?: string;
}

export interface CustomFormInstanceStateV2 {
  schemaVersion: 2;
  /** Section-level values: sectionId to fieldId to value. */
  values: Record<string, Record<string, unknown>>;
  /** sectionId to its rows, in order. */
  tableRows: Record<string, RowInstanceV2[]>;
  /** Reserved for phase 4 repeatable report groups. */
  repeaters: Record<string, RepeaterInstanceV2[]>;
  /** Never business data. Safe to drop. */
  uiState?: Record<string, unknown>;
}

/** The flat map the renderer reads and writes. */
export type RuntimeFormData = Record<string, any>;

/** What a saved `data` column holds, in either schema. */
export interface StoredInstanceData {
  schemaVersion?: number;
  /** V1 and the runtime projection. */
  sections?: RuntimeFormData;
  /** V2. */
  state?: CustomFormInstanceStateV2;
  status?: string;
  templateName?: string;
  templateId?: string;
  templateVersionId?: string;
}

let rowIdCounter = 0;

/** Stable, collision-free row id. Prefers crypto when the browser has it. */
export function newRowInstanceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `row_${uuid}`;
  rowIdCounter += 1;
  return `row_${Date.now().toString(36)}_${rowIdCounter.toString(36)}`;
}

export function emptyInstanceState(): CustomFormInstanceStateV2 {
  return { schemaVersion: 2, values: {}, tableRows: {}, repeaters: {} };
}

/** Sections that own rows, and the row keys they use. */
function tableSections(structure: CustomFormStructure): SectionConfig[] {
  return structure.sections.filter((section) => {
    const kind = classifySection(section);
    return (
      kind === "table" ||
      kind === "contact-resistance" ||
      kind === "conditional-table"
    );
  });
}

/**
 * How many row slots a section has in the flat map. A conditional table
 * addresses rows by their position in the full definition list, not by which
 * ones the current settings show.
 */
function rowSlotCount(section: SectionConfig): number {
  if (classifySection(section) === "conditional-table") {
    return section.conditionalRows?.length ?? 0;
  }
  return resolveRowCount(section);
}

function rowDefinitionId(
  section: SectionConfig,
  rowIndex: number,
): string | undefined {
  if (classifySection(section) !== "conditional-table") return undefined;
  return section.conditionalRows?.[rowIndex]?.id;
}

// ---------------------------------------------------------------------------
// V1 in, V2 out
// ---------------------------------------------------------------------------

/**
 * Read a saved payload of either schema into V2, minting ids for V1 rows.
 * Nothing is written back to the database here: this is a read adapter, and
 * historical rows keep their stored shape until something saves them again.
 */
export function adaptStoredData(
  stored: StoredInstanceData | null | undefined,
  structure: CustomFormStructure,
): CustomFormInstanceStateV2 {
  if (stored?.state && stored.state.schemaVersion === 2) {
    return normalizeState(stored.state, structure);
  }
  return adaptV1ToV2(stored?.sections ?? {}, structure);
}

/** Fill in rows the structure declares but the saved state has not seen. */
function normalizeState(
  state: CustomFormInstanceStateV2,
  structure: CustomFormStructure,
): CustomFormInstanceStateV2 {
  const tableRows: Record<string, RowInstanceV2[]> = {};
  for (const section of tableSections(structure)) {
    const saved = state.tableRows?.[section.id] ?? [];
    const slots = rowSlotCount(section);
    const rows: RowInstanceV2[] = [];
    for (let index = 0; index < slots; index += 1) {
      const existing = saved[index];
      rows.push(
        existing
          ? { ...existing, order: index }
          : {
              rowInstanceId: newRowInstanceId(),
              rowDefinitionId: rowDefinitionId(section, index),
              order: index,
              values: {},
            },
      );
    }
    // A saved form may hold more rows than the current draft declares. Keep
    // them: dropping values because a template shrank would lose real work.
    for (let index = slots; index < saved.length; index += 1) {
      rows.push({ ...saved[index], order: index });
    }
    tableRows[section.id] = rows;
  }
  return {
    schemaVersion: 2,
    values: { ...(state.values ?? {}) },
    tableRows,
    repeaters: { ...(state.repeaters ?? {}) },
    uiState: state.uiState,
  };
}

export function adaptV1ToV2(
  sections: RuntimeFormData,
  structure: CustomFormStructure,
): CustomFormInstanceStateV2 {
  const state = emptyInstanceState();
  const rowKeys = new Set<string>();

  for (const section of tableSections(structure)) {
    const rows: RowInstanceV2[] = [];
    // Read past the declared count so a form saved with extra rows keeps them.
    const declared = rowSlotCount(section);
    let index = 0;
    while (true) {
      const key = rowStateKey(section.id, index);
      const hasStored = Object.prototype.hasOwnProperty.call(sections, key);
      if (index >= declared && !hasStored) break;
      if (hasStored) rowKeys.add(key);
      rows.push({
        rowInstanceId: newRowInstanceId(),
        rowDefinitionId: rowDefinitionId(section, index),
        order: index,
        values: hasStored ? { ...sections[key] } : {},
      });
      index += 1;
      if (index > 1000) break; // guard against a corrupt payload
    }
    state.tableRows[section.id] = rows;
  }

  // Everything that is not a row key is section-level.
  for (const [key, value] of Object.entries(sections)) {
    if (rowKeys.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      state.values[key] = { ...value };
    } else if (value !== undefined) {
      // A stray scalar. Keep it rather than drop it.
      state.values[key] = { value } as Record<string, unknown>;
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// V2 out to the renderer, and back
// ---------------------------------------------------------------------------

/** Flatten V2 into the `sectionId_row{N}` map the renderer reads. */
export function projectStateToRuntime(
  state: CustomFormInstanceStateV2,
): RuntimeFormData {
  const runtime: RuntimeFormData = {};
  for (const [key, values] of Object.entries(state.values)) {
    runtime[key] = { ...values };
  }
  for (const [sectionId, rows] of Object.entries(state.tableRows)) {
    rows.forEach((row, index) => {
      runtime[rowStateKey(sectionId, index)] = { ...row.values };
    });
  }
  return runtime;
}

/**
 * Merge the renderer's flat map back into V2, keeping every row id the state
 * already had and minting ids only for rows that are genuinely new.
 */
export function mergeRuntimeIntoState(
  state: CustomFormInstanceStateV2,
  runtime: RuntimeFormData,
  structure: CustomFormStructure,
): CustomFormInstanceStateV2 {
  const next = emptyInstanceState();
  const rowKeys = new Set<string>();

  for (const section of tableSections(structure)) {
    const previous = state.tableRows[section.id] ?? [];
    const declared = rowSlotCount(section);
    const rows: RowInstanceV2[] = [];
    let index = 0;
    while (true) {
      const key = rowStateKey(section.id, index);
      const hasStored = Object.prototype.hasOwnProperty.call(runtime, key);
      if (index >= declared && !hasStored) break;
      if (hasStored) rowKeys.add(key);
      const existing = previous[index];
      rows.push({
        rowInstanceId: existing?.rowInstanceId ?? newRowInstanceId(),
        rowDefinitionId: rowDefinitionId(section, index),
        order: index,
        values: hasStored ? { ...runtime[key] } : (existing?.values ?? {}),
      });
      index += 1;
      if (index > 1000) break;
    }
    next.tableRows[section.id] = rows;
  }

  for (const [key, value] of Object.entries(runtime)) {
    if (rowKeys.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next.values[key] = { ...value };
    } else if (value !== undefined) {
      next.values[key] = { value } as Record<string, unknown>;
    }
  }

  next.repeaters = { ...state.repeaters };
  if (state.uiState) next.uiState = state.uiState;
  return next;
}

/**
 * The payload written to `custom_form_instances.data`.
 *
 * Both shapes are written: `state` is authoritative, `sections` is the flat
 * projection every existing reader (PDF export, deliverables, the offline app)
 * already understands. Dropping `sections` is a later, deliberate migration.
 */
export function buildStoredData(
  state: CustomFormInstanceStateV2,
  meta: {
    status: string;
    templateName?: string;
    templateId?: string;
    templateVersionId?: string;
  },
): StoredInstanceData {
  return {
    schemaVersion: CURRENT_INSTANCE_SCHEMA_VERSION,
    state,
    sections: projectStateToRuntime(state),
    ...meta,
  };
}

/** Parse a `data` column that may be a JSON string or an object. */
export function parseStoredData(raw: unknown): StoredInstanceData | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StoredInstanceData;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as StoredInstanceData;
  return null;
}
