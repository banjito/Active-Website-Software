/**
 * Client side of the oil-report ingestion pipeline.
 *
 * OCR runs in the browser (see oilReportOcr.ts); this module hands the
 * resulting text to the parse-oil-report edge function, which calls DeepSeek
 * with the server-held API key, and coerces the response into OilReport.
 *
 * The model is prompted for this shape but is not trusted to produce it, so
 * every field is normalized defensively before it reaches the renderer.
 */

import { supabase } from "@/lib/supabase";
import type {
  DGA,
  EquipmentInfo,
  Nameplate,
  OilReport,
  Sample,
} from "@/lib/oilReport";

/** Coerce anything the model emits for a scalar field into a trimmed string. */
function s(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Same as `s`, but collapses empties to undefined for optional fields. */
function opt(value: unknown): string | undefined {
  const out = s(value);
  return out ? out : undefined;
}

function normalizeNameplate(raw: Record<string, unknown> = {}): Nameplate {
  return {
    serialNumber: s(raw.serialNumber),
    unitId: s(raw.unitId),
    equipmentType: s(raw.equipmentType),
    manufacturer: s(raw.manufacturer),
    yearManufactured: s(raw.yearManufactured),
    primaryKV: s(raw.primaryKV),
    gallons: s(raw.gallons),
    kvaRating: s(raw.kvaRating),
    phases: s(raw.phases),
    fluidType: s(raw.fluidType),
    substationLocation: s(raw.substationLocation),
    breathingConfiguration: s(raw.breathingConfiguration),
  };
}

function normalizeEquipment(raw: Record<string, unknown> = {}): EquipmentInfo {
  return {
    topValve: s(raw.topValve),
    bottomValve: s(raw.bottomValve),
    hoseLength: s(raw.hoseLength),
    paintCondition: s(raw.paintCondition),
    conservatorTank: s(raw.conservatorTank),
    bushingsEnclosed: s(raw.bushingsEnclosed),
    leaks: s(raw.leaks),
    radiators: s(raw.radiators),
    serviceEnergized: s(raw.serviceEnergized),
    compartments: s(raw.compartments),
  };
}

function normalizeDga(raw: Record<string, unknown> = {}): DGA {
  return {
    hydrogen: opt(raw.hydrogen),
    methane: opt(raw.methane),
    ethane: opt(raw.ethane),
    ethylene: opt(raw.ethylene),
    acetylene: opt(raw.acetylene),
    carbonMonoxide: opt(raw.carbonMonoxide),
    carbonDioxide: opt(raw.carbonDioxide),
    oxygen: opt(raw.oxygen),
    nitrogen: opt(raw.nitrogen),
    tdcg: opt(raw.tdcg),
    tdcgRatePerDay: opt(raw.tdcgRatePerDay),
    co2co: opt(raw.co2co),
  };
}

function normalizeSample(raw: Record<string, unknown> = {}): Sample {
  return {
    sampleDate: s(raw.sampleDate) || "Undated",
    barcodeDGA: opt(raw.barcodeDGA),
    barcodeFluid: opt(raw.barcodeFluid),
    jobNumber: opt(raw.jobNumber),
    sampleTempC: opt(raw.sampleTempC),
    identification: opt(raw.identification),
    dga: normalizeDga((raw.dga as Record<string, unknown>) ?? {}),
    dgaCondition: opt(raw.dgaCondition),
    dgaAnalysis: opt(raw.dgaAnalysis),
    operatingProcedures: opt(raw.operatingProcedures),
    samplingInterval: opt(raw.samplingInterval),
    moisture: opt(raw.moisture),
    acid: opt(raw.acid),
    ift: opt(raw.ift),
    color: opt(raw.color),
    visual: opt(raw.visual),
    dielectric: opt(raw.dielectric),
    specificGravity: opt(raw.specificGravity),
    pf25c: opt(raw.pf25c),
    pcb: opt(raw.pcb),
    oilClassification: opt(raw.oilClassification),
    oilQuality: opt(raw.oilQuality),
  };
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function normalizeReport(
  raw: Record<string, unknown>,
  index: number,
  sourceFile: string,
): OilReport {
  const nameplate = normalizeNameplate(
    (raw.nameplate as Record<string, unknown>) ?? {},
  );
  const samples = Array.isArray(raw.samples)
    ? raw.samples.map((sample) =>
        normalizeSample((sample as Record<string, unknown>) ?? {}),
      )
    : [];

  const label =
    s(raw.label) ||
    [nameplate.unitId, nameplate.substationLocation].filter(Boolean).join(" ") ||
    nameplate.serialNumber ||
    `Unit ${index + 1}`;

  return {
    id: slugify(s(raw.id) || label, `unit-${index + 1}`),
    label,
    siteName: s(raw.siteName) || nameplate.substationLocation,
    siteAddress: s(raw.siteAddress),
    nameplate,
    equipment: normalizeEquipment(
      (raw.equipment as Record<string, unknown>) ?? {},
    ),
    samples,
    sourceFile,
  };
}

/** Identity of a physical transformer, used to spot continuation pages. */
function unitKey(report: OilReport): string {
  const { serialNumber, unitId } = report.nameplate;
  const identity = `${serialNumber}|${unitId}`.trim();
  // With no nameplate identity at all, fall back to the label so distinct
  // units never collapse into one another.
  return identity === "|" ? `label:${report.label}` : identity;
}

/** Merge `extra` into `into`, filling gaps without overwriting real values. */
function mergeSample(into: Sample, extra: Sample): Sample {
  const merged: Sample = { ...into, dga: { ...into.dga } };

  for (const [key, value] of Object.entries(extra) as [
    keyof Sample,
    unknown,
  ][]) {
    if (key === "dga" || key === "sampleDate" || !value) continue;
    if (!merged[key]) (merged as Record<string, unknown>)[key] = value;
  }

  for (const [key, value] of Object.entries(extra.dga) as [
    keyof DGA,
    string | undefined,
  ][]) {
    if (value && !merged.dga[key]) merged.dga[key] = value;
  }

  return merged;
}

/**
 * Fold continuation pages back into their unit.
 *
 * A long report repeats the nameplate block on the next page and shows only
 * the rows that did not fit (often just Oil Quality). Those are the same
 * transformer, so they must not become separate reports.
 */
function mergeContinuations(reports: OilReport[]): OilReport[] {
  const byUnit = new Map<string, OilReport>();

  for (const report of reports) {
    const key = unitKey(report);
    const existing = byUnit.get(key);

    if (!existing) {
      byUnit.set(key, report);
      continue;
    }

    // Same transformer: merge each sample by date, appending genuinely new
    // sample columns.
    const samples = [...existing.samples];
    for (const sample of report.samples) {
      const at = samples.findIndex((s) => s.sampleDate === sample.sampleDate);
      if (at === -1) samples.push(sample);
      else samples[at] = mergeSample(samples[at], sample);
    }

    byUnit.set(key, {
      ...existing,
      siteName: existing.siteName || report.siteName,
      siteAddress: existing.siteAddress || report.siteAddress,
      samples,
    });
  }

  return Array.from(byUnit.values());
}

/**
 * Send OCR text for structuring and return renderable reports.
 *
 * Units with no samples are dropped: they are almost always an artifact of a
 * continuation page repeating the nameplate block.
 */
export async function parseOilReport(
  ocrText: string,
  fileName: string,
): Promise<OilReport[]> {
  const { data, error } = await supabase.functions.invoke("parse-oil-report", {
    body: { ocrText, fileName },
  });

  if (error) {
    throw new Error(`Could not reach the parser: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }

  const reports = Array.isArray(data?.reports) ? data.reports : [];
  const normalized = mergeContinuations(
    reports
      .map((raw: Record<string, unknown>, i: number) =>
        normalizeReport(raw ?? {}, i, fileName),
      )
      .filter((r: OilReport) => r.samples.length > 0),
  );

  if (normalized.length === 0) {
    throw new Error(
      "No readable units were found in that PDF. The scan may be too low-resolution to OCR.",
    );
  }

  // Ids feed React keys and the unit switcher, so they must be unique even if
  // two units share a label.
  const seen = new Set<string>();
  return normalized.map((report: OilReport) => {
    let id = report.id;
    let n = 2;
    while (seen.has(id)) id = `${report.id}-${n++}`;
    seen.add(id);
    return { ...report, id };
  });
}
