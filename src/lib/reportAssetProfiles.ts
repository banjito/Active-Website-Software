// Which report fields belong to a piece of equipment, per built-in report.
//
// An asset names the report it is meant to be tested with (equipment_assets.report_template_slug)
// and stores that report's equipment-level values under the report's own form paths
// (equipment_assets.report_data). This file is the one description of those fields. The
// report forms render their Job Information and Nameplate Data sections from it, and so does
// the asset editor, which is why filling in an asset looks exactly like filling in the report.
//
// ATS and MTS versions of the same equipment use the same paths, so an asset set up for the
// ATS 25 breaker report prefills the MTS breaker report without any translation.
//
// A report with no profile here keeps the older per-equipment-type nameplate list in
// src/lib/assetNameplateSchema.ts.

import { labelForKey } from "@/lib/assetNameplateSchema";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

/** Asset columns a report field can be stored in instead of report_data. */
export type AssetColumn =
  | "identifier"
  | "substation"
  | "equipment_location"
  | "manufacturer"
  | "model"
  | "serial_number";

export type ReportFieldKind =
  | "text"
  | "date"
  | "select"
  | "fahrenheit"
  | "celsius"
  | "tcf"
  | "humidity"
  /** °F, °C and TCF on one line, for the two-column layout. Path is "temperature". */
  | "temperature-line";

export interface ReportFieldOption {
  value: string;
  label: string;
}

export interface ReportField {
  /** Path into the report's form state, e.g. "breakerType" or "nameplate.series". */
  path: string;
  label: string;
  /**
   * "asset" fields describe the equipment and are saved on it. "job" fields change every
   * visit (date, technicians, temperature) or come from the job, so the asset editor shows
   * them greyed out and never stores them.
   */
  scope: "asset" | "job";
  /** Stored in this asset column rather than in report_data. */
  column?: AssetColumn;
  kind?: ReportFieldKind;
  /** For selects. An empty-value option renders as "Select...". */
  options?: ReportFieldOption[];
  /** Read-only in the report too: filled from the job, or calculated. */
  locked?: boolean;
  /** Grid placement, e.g. "md:col-span-2". */
  className?: string;
  /** Two-column layout only. */
  side?: "left" | "right";
  /** Keys in the old nameplate_data that mean the same thing, for converting an asset. */
  legacyKeys?: string[];
}

export type JobInfoLayout = "grid-5" | "two-column" | "grid-6";

export interface ReportAssetProfile {
  slug: string;
  /**
   * Reports that test the same kind of equipment with the same field paths (ATS and MTS
   * versions). An asset set up for one is offered the others first.
   */
  family: "lv-breaker" | "lv-assembly";
  /** Written to equipment_type when the report is chosen, so lists and filters still read. */
  equipmentType: string;
  jobInfoLayout: JobInfoLayout;
  nameplateGridClassName: string;
  /** Whether this report writes its labels as "Manufacturer:" or "Manufacturer". */
  labelColon: boolean;
  jobInfo: ReportField[];
  nameplate: ReportField[];
}

const opts = (values: string[], labels: Record<string, string> = {}): ReportFieldOption[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

// ── LV circuit breaker ATS 25 / MTS 25 ────────────────────────────────────────

export const BREAKER_TYPE_LABELS: Record<string, string> = {
  "molded case": "Molded Case",
  "insulated case": "Insulated Case",
  power: "Power",
};

const BREAKER_25_JOB_INFO: ReportField[] = [
  { path: "customer", label: "Customer", scope: "job", locked: true },
  { path: "address", label: "Address", scope: "job" },
  { path: "jobNumber", label: "Job #", scope: "job", locked: true },
  { path: "technicians", label: "Technicians", scope: "job" },
  { path: "date", label: "Date", scope: "job", kind: "date" },
  {
    path: "breakerIdentifier",
    label: "Breaker Identifier",
    scope: "asset",
    column: "identifier",
  },
  { path: "substation", label: "Substation", scope: "asset", column: "substation" },
  { path: "eqptIdentifier", label: "Eqpt. Identifier", scope: "asset" },
  { path: "circuitCellNo", label: "Circuit / Cell No.", scope: "asset" },
  { path: "user", label: "User", scope: "job" },
  { path: "temperature.fahrenheit", label: "Temp", scope: "job", kind: "fahrenheit" },
  { path: "temperature.celsius", label: "Celsius", scope: "job", kind: "celsius" },
  { path: "temperature.humidity", label: "Humidity", scope: "job", kind: "humidity" },
  { path: "temperature.tcf", label: "TCF", scope: "job", kind: "tcf", locked: true },
];

const BREAKER_25_NAMEPLATE: ReportField[] = [
  { path: "manufacturer", label: "Manufacturer", scope: "asset", column: "manufacturer" },
  { path: "catalogNumber", label: "Catalog Number", scope: "asset", column: "model" },
  { path: "serialNumber", label: "Serial Number", scope: "asset", column: "serial_number" },
  {
    path: "breakerType",
    label: "Breaker Type",
    scope: "asset",
    kind: "select",
    options: opts(["", "molded case", "insulated case", "power"], BREAKER_TYPE_LABELS),
    legacyKeys: ["type"],
  },
  { path: "tripUnitType", label: "Trip Unit Type", scope: "asset", legacyKeys: ["tripUnitType"] },
  { path: "frameSize", label: "Frame Size (A)", scope: "asset", legacyKeys: ["frameSize"] },
  { path: "ratingPlug", label: "Rating Plug (A)", scope: "asset", legacyKeys: ["ratingPlug"] },
  {
    path: "ratedVoltage",
    label: "Rated Voltage (V)",
    scope: "asset",
    kind: "select",
    options: opts(["", "250", "480", "600", "1000"]),
    legacyKeys: ["ratedVoltage"],
  },
  {
    path: "operatingVoltage",
    label: "Operating Voltage (V)",
    scope: "asset",
    legacyKeys: ["operatingVoltage"],
  },
  { path: "icRating", label: "I.C. Rating (kA)", scope: "asset", legacyKeys: ["icRating"] },
  { path: "curveNo", label: "Curve No.", scope: "asset", legacyKeys: ["curveNo"] },
  {
    path: "operation",
    label: "Operation",
    scope: "asset",
    kind: "select",
    options: opts(["", "Over-Center Handle", "Two-Step Stored Energy"]),
    legacyKeys: ["operation"],
  },
  {
    path: "mounting",
    label: "Mounting",
    scope: "asset",
    kind: "select",
    options: opts(["", "Bolt-In", "Plug-in", "Fixed-Mount", "Bushing-Mount", "Draw-out"]),
    legacyKeys: ["mounting"],
  },
  {
    path: "zoneInterlock",
    label: "Zone Interlock",
    scope: "asset",
    kind: "select",
    options: opts(["", "Yes", "No", "Enabled", "Disabled", "N/A"]),
  },
  {
    path: "thermalMemory",
    label: "Thermal Memory",
    scope: "asset",
    kind: "select",
    options: opts(["", "Yes", "No", "Simulated", "Unknown", "N/A"]),
  },
];

const breaker25 = (slug: string): ReportAssetProfile => ({
  slug,
  family: "lv-breaker",
  equipmentType: "Low Voltage Circuit Breaker",
  jobInfoLayout: "grid-5",
  nameplateGridClassName: "grid grid-cols-1 md:grid-cols-4 gap-4",
  labelColon: true,
  jobInfo: BREAKER_25_JOB_INFO,
  nameplate: BREAKER_25_NAMEPLATE,
});

// ── LV assemblies: switchgear, switchboard, panelboard ────────────────────────

const ASSEMBLY_25_JOB_INFO: ReportField[] = [
  { path: "customerName", label: "Customer", scope: "job", locked: true, side: "left" },
  { path: "customerLocation", label: "Site Address", scope: "job", side: "left" },
  { path: "userName", label: "User", scope: "job", side: "left" },
  { path: "date", label: "Date", scope: "job", kind: "date", side: "left" },
  {
    path: "identifier",
    label: "Identifier",
    scope: "asset",
    column: "identifier",
    side: "left",
  },
  { path: "jobNumber", label: "Job #", scope: "job", locked: true, side: "right" },
  { path: "technicians", label: "Technicians", scope: "job", side: "right" },
  { path: "temperature", label: "Temp.", scope: "job", kind: "temperature-line", side: "right" },
  { path: "temperature.humidity", label: "Humidity", scope: "job", kind: "humidity", side: "right" },
  { path: "substation", label: "Substation", scope: "asset", column: "substation", side: "right" },
  {
    path: "eqptLocation",
    label: "Eqpt. Location",
    scope: "asset",
    column: "equipment_location",
    side: "right",
  },
];

const ASSEMBLY_RATED_VOLTAGES = [
  "250",
  "480",
  "600",
  "1000",
  "2500",
  "5000",
  "8000",
  "15000",
  "25000",
  "34500",
  "46000",
];

/** Units in the label are how the ATS 25 sheets print them; the MTS sheet leaves them off. */
const assemblyNameplate = (
  withUnits: boolean,
  ratedVoltageOptions: string[] | null,
): ReportField[] => [
  { path: "nameplate.manufacturer", label: "Manufacturer", scope: "asset", column: "manufacturer" },
  {
    path: "nameplate.catalogNumber",
    label: withUnits ? "Catalog No." : "Catalog Number",
    scope: "asset",
    column: "model",
  },
  {
    path: "nameplate.serialNumber",
    label: "Serial Number",
    scope: "asset",
    column: "serial_number",
  },
  { path: "nameplate.series", label: "Series", scope: "asset", legacyKeys: ["series", "style"] },
  { path: "nameplate.type", label: "Type", scope: "asset", legacyKeys: ["type"] },
  {
    path: "nameplate.systemVoltage",
    label: withUnits ? "System Voltage (V)" : "System Voltage",
    scope: "asset",
    legacyKeys: ["systemVoltage"],
  },
  {
    path: "nameplate.ratedVoltage",
    label: withUnits ? "Rated Voltage (V)" : "Rated Voltage",
    scope: "asset",
    ...(ratedVoltageOptions
      ? { kind: "select" as const, options: opts(["", ...ratedVoltageOptions]) }
      : {}),
    legacyKeys: ["ratedVoltage"],
  },
  {
    path: "nameplate.ratedCurrent",
    label: withUnits ? "Rated Current (A)" : "Rated Current",
    scope: "asset",
    legacyKeys: ["ratedCurrent", "ampacity"],
  },
  {
    path: "nameplate.aicRating",
    label: withUnits ? "SCCR (kA)" : "SCCR",
    scope: "asset",
    legacyKeys: ["sccr", "icRating"],
  },
  {
    path: "nameplate.phaseConfiguration",
    label: "Phase Configuration",
    scope: "asset",
    legacyKeys: ["phaseConfiguration"],
  },
];

const ASSEMBLY_MTS_JOB_INFO: ReportField[] = [
  { path: "customerName", label: "Customer", scope: "job", locked: true },
  { path: "jobNumber", label: "Job #", scope: "job", locked: true },
  { path: "technicians", label: "Technicians", scope: "job" },
  { path: "date", label: "Date", scope: "job", kind: "date" },
  { path: "identifier", label: "Identifier", scope: "asset", column: "identifier" },
  { path: "temperature.fahrenheit", label: "Temp", scope: "job", kind: "fahrenheit" },
  {
    path: "temperature.celsius",
    label: "Temp (°C)",
    scope: "job",
    kind: "celsius",
    locked: true,
    className: "md:col-span-2",
  },
  { path: "temperature.tcf", label: "TCF", scope: "job", kind: "tcf", locked: true },
  { path: "substation", label: "Substation", scope: "asset", column: "substation" },
  {
    path: "eqptLocation",
    label: "Eqpt. Location",
    scope: "asset",
    column: "equipment_location",
  },
  { path: "userName", label: "User", scope: "job", className: "md:col-span-2" },
  { path: "temperature.humidity", label: "Humidity %", scope: "job", kind: "humidity" },
  { path: "customerLocation", label: "Address", scope: "job", className: "md:col-span-6" },
];

// ── Registry ──────────────────────────────────────────────────────────────────

export const REPORT_ASSET_PROFILES: Record<string, ReportAssetProfile> = {
  "lv-molded-case-circuit-breaker-ats25": breaker25("lv-molded-case-circuit-breaker-ats25"),
  "lv-circuit-breaker-mts25": breaker25("lv-circuit-breaker-mts25"),
  // Same component, older route; the report saves under this slug.
  "lv-circuit-breaker-mts": breaker25("lv-circuit-breaker-mts"),
  "panelboard-assemblies-ats25": {
    slug: "panelboard-assemblies-ats25",
    family: "lv-assembly",
    equipmentType: "Panelboard",
    jobInfoLayout: "two-column",
    nameplateGridClassName: "grid grid-cols-3 gap-4",
    labelColon: false,
    jobInfo: ASSEMBLY_25_JOB_INFO,
    nameplate: assemblyNameplate(true, ["N/L", ...ASSEMBLY_RATED_VOLTAGES]),
  },
  "switchgear-switchboard-assemblies-ats25": {
    slug: "switchgear-switchboard-assemblies-ats25",
    family: "lv-assembly",
    equipmentType: "Switchgear",
    jobInfoLayout: "two-column",
    nameplateGridClassName: "grid grid-cols-3 gap-4",
    labelColon: false,
    jobInfo: ASSEMBLY_25_JOB_INFO,
    nameplate: assemblyNameplate(true, ASSEMBLY_RATED_VOLTAGES),
  },
  "switchgear-panelboard-mts-report": {
    slug: "switchgear-panelboard-mts-report",
    family: "lv-assembly",
    equipmentType: "Switchgear",
    jobInfoLayout: "grid-6",
    nameplateGridClassName: "grid grid-cols-3 gap-4",
    labelColon: true,
    jobInfo: ASSEMBLY_MTS_JOB_INFO,
    nameplate: assemblyNameplate(false, null),
  },
};

/**
 * Report forms an asset can be set up for, in picker order. The older duplicate route for
 * the MTS breaker report is left out so it isn't listed twice.
 */
export const ASSET_TEMPLATE_SLUGS = [
  "lv-molded-case-circuit-breaker-ats25",
  "lv-circuit-breaker-mts",
  "panelboard-assemblies-ats25",
  "switchgear-switchboard-assemblies-ats25",
  "switchgear-panelboard-mts-report",
];

export function getReportAssetProfile(
  slug: string | null | undefined,
): ReportAssetProfile | null {
  return slug ? (REPORT_ASSET_PROFILES[slug] ?? null) : null;
}

/** The asset's own report form first, then the rest of its family. */
export function relatedTemplateSlugs(slug: string | null | undefined): string[] {
  const profile = getReportAssetProfile(slug);
  if (!profile) return [];
  return [
    profile.slug,
    ...ASSET_TEMPLATE_SLUGS.filter(
      (other) => other !== profile.slug && REPORT_ASSET_PROFILES[other].family === profile.family,
    ),
  ];
}

/** Every field saved on the asset, in on-screen order. */
export function assetFieldsOf(profile: ReportAssetProfile): ReportField[] {
  return [...profile.jobInfo, ...profile.nameplate].filter((f) => f.scope === "asset");
}

// ── Form-state paths ──────────────────────────────────────────────────────────

export function getPath(source: unknown, path: string): unknown {
  let current: any = source;
  for (const key of path.split(".")) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/** Copy-on-write set, so it can be used inside a React state updater. */
export function setPath<T>(source: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const root: any = Array.isArray(source) ? [...source] : { ...(source as any) };
  let current = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = current[keys[i]];
    current[keys[i]] = Array.isArray(next) ? [...next] : { ...(next ?? {}) };
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return root;
}

const asText = (value: unknown) => (value == null ? "" : String(value).trim());

// ── Asset <-> report values ───────────────────────────────────────────────────

/** What the asset holds for one field. Empty string when nothing. */
export function assetValueFor(asset: EquipmentAsset, field: ReportField): string {
  if (field.column) return asText(asset[field.column]);
  return asText((asset.report_data as Record<string, unknown> | null)?.[field.path]);
}

/**
 * The equipment-level values a report should start with, as path/value pairs.
 *
 * An asset that has never had a report form chosen still carries the old nameplate_data;
 * that is converted on the fly so the first report written against it isn't blank.
 */
export function reportValuesFromAsset(
  profile: ReportAssetProfile,
  asset: EquipmentAsset,
): { path: string; value: string }[] {
  const legacy = asset.report_template_slug
    ? {}
    : convertLegacyNameplate(profile, asset.nameplate_data).values;

  const out: { path: string; value: string }[] = [];
  for (const field of assetFieldsOf(profile)) {
    const value = assetValueFor(asset, field) || legacy[field.path] || "";
    if (value) out.push({ path: field.path, value });
  }
  return out;
}

/**
 * Fill only the blanks. A report always wins over the asset for anything already typed,
 * and a field the report calculates is never touched.
 */
export function applyAssetValuesToForm<T>(
  profile: ReportAssetProfile,
  asset: EquipmentAsset,
  form: T,
): T {
  let next = form;
  for (const { path, value } of reportValuesFromAsset(profile, asset)) {
    if (asText(getPath(next, path))) continue;
    next = setPath(next, path, value);
  }
  return next;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The option a free-text value means, or null when it isn't one of them. */
function matchOption(field: ReportField, value: string): string | null {
  if (!field.options) return value;
  const wanted = normalize(value);
  const hit = field.options.find(
    (o) => o.value && (normalize(o.value) === wanted || normalize(o.label) === wanted),
  );
  return hit ? hit.value : null;
}

/**
 * Move old per-equipment-type nameplate values onto this report's fields.
 *
 * Only unambiguous matches are carried over: same meaning by key, and for a dropdown a value
 * that is actually one of its options. Everything else comes back in `leftovers` so the
 * caller can keep it somewhere visible (the asset's notes) rather than drop it.
 */
export function convertLegacyNameplate(
  profile: ReportAssetProfile,
  nameplate: Record<string, string> | null | undefined,
): {
  values: Record<string, string>;
  leftovers: { key: string; label: string; value: string }[];
} {
  const values: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of assetFieldsOf(profile)) {
    if (field.column) continue;
    for (const key of field.legacyKeys ?? []) {
      const raw = asText(nameplate?.[key]);
      if (!raw || used.has(key)) continue;
      const value = matchOption(field, raw);
      if (value === null) continue;
      values[field.path] = value;
      used.add(key);
      break;
    }
  }

  const leftovers: { key: string; label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(nameplate ?? {})) {
    const value = asText(raw);
    if (!value || used.has(key)) continue;
    leftovers.push({ key, label: labelForKey(key), value });
  }
  return { values, leftovers };
}
