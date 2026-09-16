// Fill a new report's equipment fields from the asset it was started from, for any report.
//
// The reports with a profile in src/lib/reportAssetProfiles.ts know exactly which of their
// fields belong to the equipment. The rest don't, but they spell those fields the same way
// ("identifier", "substation", "eqptLocation", "nameplate.manufacturer"), so this matches by
// name instead. A value is only written where the form already has a string field at that
// path, so a report that names something differently is left alone rather than given a
// stray key.

import { getPath, setPath } from "@/lib/reportAssetProfiles";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

/** Containers a report keeps its header and nameplate fields in, most specific first. */
const HEADER_PREFIXES = ["", "reportInfo.", "jobInfo."];
const NAMEPLATE_CONTAINERS = [
  "nameplate.",
  "nameplateData.",
  "reportInfo.nameplate.",
  "reportInfo.nameplateData.",
];
/**
 * Manufacturer, catalog and serial also sit loose in some reports' headers. Other nameplate
 * keys ("type", "rating") are too generic to look for outside a nameplate block.
 */
const NAMEPLATE_PREFIXES = [...NAMEPLATE_CONTAINERS, "", "reportInfo."];

/** Asset column -> the names reports use for it. */
const HEADER_KEYS: [keyof EquipmentAsset, string[]][] = [
  ["identifier", ["identifier", "equipmentIdentifier"]],
  ["substation", ["substation"]],
  ["equipment_location", ["eqptLocation", "equipmentLocation"]],
];

const NAMEPLATE_KEYS: [keyof EquipmentAsset, string[]][] = [
  ["manufacturer", ["manufacturer"]],
  ["model", ["catalogNumber", "catalogNo", "modelNumber", "model"]],
  ["serial_number", ["serialNumber", "serialNo"]],
];

/**
 * Asset nameplate keys (src/lib/assetNameplateSchema.ts) that reports spell differently.
 * Anything not listed here is matched under its own name.
 */
const NAMEPLATE_ALIASES: Record<string, string[]> = {
  primaryVolts: ["primaryVolts", "primaryVoltage1", "primaryVoltage"],
  primaryVoltsSecondary: ["primaryVoltsSecondary", "primaryVoltage2"],
  secondaryVolts: ["secondaryVolts", "secondaryVoltage1", "secondaryVoltage"],
  secondaryVoltsSecondary: ["secondaryVoltsSecondary", "secondaryVoltage2"],
  primaryConnection: ["primaryConnection", "primaryWindingConnection"],
  secondaryConnection: ["secondaryConnection", "secondaryWindingConnection"],
  primaryMaterial: ["primaryMaterial", "primaryWindingMaterial"],
  secondaryMaterial: ["secondaryMaterial", "secondaryWindingMaterial"],
};

const asText = (value: unknown) => (value == null ? "" : String(value).trim());

/** First candidate path the form holds a string at. */
function findStringPath(form: unknown, prefixes: string[], keys: string[]): string | null {
  for (const prefix of prefixes) {
    for (const key of keys) {
      const path = prefix + key;
      if (typeof getPath(form, path) === "string") return path;
    }
  }
  return null;
}

/** Every equipment value the asset holds, as candidate report paths. */
function assetEntries(asset: EquipmentAsset): {
  value: string;
  prefixes: string[];
  keys: string[];
}[] {
  const out: { value: string; prefixes: string[]; keys: string[] }[] = [];
  for (const [column, keys] of HEADER_KEYS) {
    out.push({ value: asText(asset[column]), prefixes: HEADER_PREFIXES, keys });
  }
  for (const [column, keys] of NAMEPLATE_KEYS) {
    out.push({ value: asText(asset[column]), prefixes: NAMEPLATE_PREFIXES, keys });
  }
  for (const [key, raw] of Object.entries(asset.nameplate_data ?? {})) {
    out.push({
      value: asText(raw),
      prefixes: NAMEPLATE_CONTAINERS,
      keys: NAMEPLATE_ALIASES[key] ?? [key],
    });
  }
  // Values saved under another report's form paths ("nameplate.series") land on the same
  // path here when this report has it.
  for (const [path, raw] of Object.entries(asset.report_data ?? {})) {
    out.push({ value: asText(raw), prefixes: [""], keys: [path] });
  }
  return out.filter((e) => e.value);
}

/**
 * The form with the asset's values written in.
 *
 * Only called for a report that was just opened, so the asset overrides the form's starting
 * values: a dropdown that defaults to "Delta" should still show the transformer's "Wye".
 */
export function applyAssetToForm<T>(asset: EquipmentAsset, form: T): T {
  let next = form;
  for (const { value, prefixes, keys } of assetEntries(asset)) {
    const path = findStringPath(next, prefixes, keys);
    if (path) next = setPath(next, path, value);
  }
  return next;
}

/** A custom-form section: its id and the field ids it renders. */
export interface PrefillSection {
  id: string;
  fieldIds: string[];
}

/**
 * Custom forms keep values as `{ [sectionId]: { [fieldId]: value } }` and start empty, so
 * there is no existing string to match on. Match on the template's field ids instead, and
 * only fill fields nobody has typed in.
 */
export function applyAssetToCustomForm(
  asset: EquipmentAsset,
  sections: PrefillSection[],
  form: Record<string, any>,
): Record<string, any> {
  let next = form;
  for (const { value, keys } of assetEntries(asset)) {
    // report_data paths are dotted; a custom-form field id is only the last part.
    const names = keys.map((k) => k.split(".").pop()!.toLowerCase());
    const hit = sections
      .flatMap((s) => s.fieldIds.map((fieldId) => ({ sectionId: s.id, fieldId })))
      .find(({ fieldId }) => names.includes(fieldId.toLowerCase()));
    if (!hit) continue;
    if (asText(next[hit.sectionId]?.[hit.fieldId])) continue;
    next = {
      ...next,
      [hit.sectionId]: { ...(next[hit.sectionId] ?? {}), [hit.fieldId]: value },
    };
  }
  return next;
}
