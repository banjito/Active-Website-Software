/**
 * The common shape every report is reduced to before it can be trended, so a
 * custom form and a built-in report can sit on the same chart.
 */

/** One result in one report. */
export interface Reading {
  /** Stable within a report type: the same place on the same report. */
  fieldKey: string;
  /** e.g. "Insulation Resistance". */
  group: string;
  /** e.g. "Primary To Ground · Half Minute". */
  label: string;
  value: number;
  unit?: string;
}

/** One filed report, ready to chart. */
export interface TrendEntry {
  id: string;
  /** `custom:<template id>` or `built-in:<slug>`. */
  reportType: string;
  reportTypeName: string;
  /** Test date (ISO); the created date when the report has none. */
  date: string;
  /** False when `date` is the created date. */
  dateFromForm: boolean;
  /** Where the report opens in the app. */
  path: string;
  readings: Reading[];
}

const READING = /^[<>≤≥]?=?\s*(-?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*[a-zA-ZμµΩΩ°%]*$/;

/**
 * The number in a cell, or null. Strict on purpose: "3-phase", "12/14/2023" and
 * "N/A" aren't readings, and a loose parse would plot the first two as 3 and 12.
 * ">2200" is kept as 2200, the same as the report shows it.
 */
export function readingNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(READING);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Two fields are "like" when their group and label read the same. */
export function matchKey(group: string, label: string): string {
  const clean = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${clean(group)}|${clean(label)}`;
}
