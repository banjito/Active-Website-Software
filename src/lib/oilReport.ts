/**
 * Types and helpers for transformer oil analysis reports.
 *
 * Source reports arrive from the outside lab (MVA Diagnostics) as PDFs with no
 * text layer — every glyph is drawn as vector outlines, so the values below are
 * transcribed rather than parsed. See /oil-results for the branded renderer.
 */

export interface Nameplate {
  serialNumber: string;
  unitId: string;
  equipmentType: string;
  manufacturer: string;
  yearManufactured: string;
  primaryKV: string;
  gallons: string;
  kvaRating: string;
  phases: string;
  fluidType: string;
  substationLocation: string;
  breathingConfiguration: string;
}

export interface EquipmentInfo {
  topValve: string;
  bottomValve: string;
  hoseLength: string;
  paintCondition: string;
  conservatorTank: string;
  bushingsEnclosed: string;
  leaks: string;
  radiators: string;
  serviceEnergized: string;
  compartments: string;
}

/** Dissolved gas analysis, all in ppm except the two ratios. */
export interface DGA {
  hydrogen?: string;
  methane?: string;
  ethane?: string;
  ethylene?: string;
  acetylene?: string;
  carbonMonoxide?: string;
  carbonDioxide?: string;
  oxygen?: string;
  nitrogen?: string;
  tdcg?: string;
  tdcgRatePerDay?: string;
  co2co?: string;
}

export interface Sample {
  sampleDate: string;
  barcodeDGA?: string;
  barcodeFluid?: string;
  jobNumber?: string;
  sampleTempC?: string;
  identification?: string;
  dga: DGA;
  dgaCondition?: string;
  dgaAnalysis?: string;
  operatingProcedures?: string;
  samplingInterval?: string;
  /** Fluid quality screen. */
  moisture?: string;
  acid?: string;
  ift?: string;
  color?: string;
  visual?: string;
  dielectric?: string;
  specificGravity?: string;
  pf25c?: string;
  pcb?: string;
  oilClassification?: string;
  oilQuality?: string;
}

export interface OilReport {
  id: string;
  /** Customer-facing label for the unit this report covers. */
  label: string;
  siteName: string;
  siteAddress: string;
  nameplate: Nameplate;
  equipment: EquipmentInfo;
  /** Newest sample first. */
  samples: Sample[];
  sourceFile: string;
}

/* ------------------------------------------------------------------ */
/* Condition severity                                                  */
/* ------------------------------------------------------------------ */

export type Severity = "good" | "caution" | "alert" | "unknown";

/**
 * IEEE C57.104 conditions and the newer "status" wording both run 1..4, low to
 * high severity, so one parser covers "Condition 2" and "Status 2" alike.
 */
export function conditionSeverity(condition?: string): Severity {
  if (!condition) return "unknown";
  const level = Number(condition.match(/(\d)/)?.[1]);
  if (level === 1) return "good";
  if (level === 2) return "caution";
  if (level >= 3) return "alert";
  return "unknown";
}

export const severityLabel: Record<Severity, string> = {
  good: "Normal",
  caution: "Monitor",
  alert: "Investigate",
  unknown: "Not rated",
};

/** Badge classes per severity. Kept here so the page and any future PDF agree. */
export const severityClasses: Record<Severity, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  caution:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  alert:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
  unknown:
    "bg-neutral-100 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-600/30",
};

/**
 * Trend of a numeric field between the newest sample and the one before it.
 * Values like "Trace" or "< 1" are not numeric and yield no trend.
 */
export function trend(
  current?: string,
  previous?: string,
): { direction: "up" | "down" | "flat"; delta: number } | null {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const delta = a - b;
  if (delta === 0) return { direction: "flat", delta };
  return { direction: delta > 0 ? "up" : "down", delta };
}

/** Rows rendered in the sample identification block, in report order. */
export const IDENT_ROWS: { key: keyof Sample; label: string }[] = [
  { key: "barcodeDGA", label: "Barcode Sample Number" },
  { key: "jobNumber", label: "Job Number" },
  { key: "sampleTempC", label: "Sample Temp. °C" },
  { key: "identification", label: "Identification" },
];

/** Rows rendered in the DGA block, in report order. */
export const DGA_ROWS: { key: keyof DGA; label: string; indent?: boolean }[] = [
  { key: "hydrogen", label: "Hydrogen", indent: true },
  { key: "methane", label: "Methane", indent: true },
  { key: "ethane", label: "Ethane", indent: true },
  { key: "ethylene", label: "Ethylene", indent: true },
  { key: "acetylene", label: "Acetylene", indent: true },
  { key: "carbonMonoxide", label: "Carbon Monoxide", indent: true },
  { key: "carbonDioxide", label: "Carbon Dioxide", indent: true },
  { key: "oxygen", label: "Oxygen", indent: true },
  { key: "nitrogen", label: "Nitrogen", indent: true },
  { key: "tdcg", label: "TDCG", indent: true },
  { key: "tdcgRatePerDay", label: "TDCG Rate ppm / day", indent: true },
  { key: "co2co", label: "CO2 / CO", indent: true },
];

/** Rows rendered in the fluid quality block, in report order. */
export const FLUID_ROWS: { key: keyof Sample; label: string; unit?: string }[] = [
  { key: "moisture", label: "Moisture (D1533)", unit: "ppm" },
  { key: "acid", label: "Acid (D974)", unit: "mgKOH/g" },
  { key: "ift", label: "IFT", unit: "mM/m" },
  { key: "color", label: "Color (D1500)" },
  { key: "visual", label: "Visual (1524)" },
  { key: "dielectric", label: "Dielectric (D1816)", unit: "kV / 2 mm" },
  { key: "specificGravity", label: "Specific Gravity (D1298/D4052)" },
  { key: "pf25c", label: "PF 25C (D924)", unit: "%" },
  { key: "pcb", label: "PCB (D4059)", unit: "ppm" },
  { key: "oilClassification", label: "Oil Classification" },
];
