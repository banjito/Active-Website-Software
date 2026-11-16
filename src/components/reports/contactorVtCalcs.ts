// Math for the Contactor VT Test Sheet: NETA ATS-2025 / MTS-2023 section
// 7.10.2 (voltage transformers). Kept apart from the form so it can be
// checked on its own.

export type InsulationType = "Dry" | "Liquid filled";
export type Application = "control" | "revenue";
export type Verdict = "PASS" | "FAIL" | "";
export type UnitVerdict = "PASS" | "FAIL" | "INCOMPLETE" | "";

/** NETA ATS-2025 Table 100.14.1, corrects to 20 °C: [°C, oil-immersed, solid]. */
export const TCF_TABLE_100_14_1: ReadonlyArray<readonly [number, number, number]> = [
  [-10, 0.125, 0.25],
  [-5, 0.18, 0.32],
  [0, 0.25, 0.4],
  [5, 0.36, 0.5],
  [10, 0.5, 0.63],
  [15, 0.75, 0.81],
  [20, 1, 1],
  [25, 1.4, 1.25],
  [30, 1.98, 1.58],
  [35, 2.8, 2],
  [40, 3.95, 2.5],
  [45, 5.6, 3.15],
  [50, 7.85, 3.98],
  [55, 11.2, 5],
  [60, 15.85, 6.3],
  [65, 22.4, 7.9],
  [70, 31.75, 10],
  [75, 44.7, 12.6],
  [80, 63.5, 15.8],
  [85, 89.789, 20],
  [90, 127, 25.2],
  [95, 180, 31.6],
  [100, 245, 40],
  [105, 359.15, 50.4],
  [110, 509, 63.2],
];

/** A number typed into the form, ignoring commas, units and signs like ">". */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^0-9eE+\-.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const fahrenheitToCelsius = (f: number): number => ((f - 32) * 5) / 9;

/** Multiplier that corrects a reading taken at `celsius` to 20 °C. */
export function temperatureCorrectionFactor(
  celsius: number,
  insulation: InsulationType,
): number {
  const col = insulation === "Liquid filled" ? 1 : 2;
  const rows = TCF_TABLE_100_14_1;
  if (celsius <= rows[0][0]) return rows[0][col];
  const last = rows[rows.length - 1];
  if (celsius >= last[0]) return last[col];
  for (let i = 0; i < rows.length - 1; i++) {
    const lo = rows[i];
    const hi = rows[i + 1];
    if (celsius >= lo[0] && celsius <= hi[0]) {
      const t = (celsius - lo[0]) / (hi[0] - lo[0]);
      return lo[col] + t * (hi[col] - lo[col]);
    }
  }
  return 1;
}

/** Table 100.5: lowest DC test voltage, in kV, for a winding rated `volts`. */
export function minTestKvdc(volts: number): number {
  if (volts <= 600) return 1;
  if (volts <= 5000) return 2.5;
  return 5;
}

/** Table 100.5: lowest passing insulation resistance, in MΩ. */
export function minInsulationMegohms(volts: number, insulation: InsulationType): number {
  const dry = insulation !== "Liquid filled";
  if (volts <= 600) return dry ? 500 : 100;
  if (volts <= 5000) return dry ? 5000 : 1000;
  return dry ? 25000 : 5000;
}

/** IEEE C57.13 ratio limit that 7.10.2 points to, in percent. */
export const ratioLimitPercent = (application: Application): number =>
  application === "revenue" ? 0.1 : 1.2;

export function nameplateRatio(
  primaryVolts: number | null,
  secondaryVolts: number | null,
): number | null {
  if (!primaryVolts || !secondaryVolts || primaryVolts <= 0 || secondaryVolts <= 0) {
    return null;
  }
  return primaryVolts / secondaryVolts;
}

export interface VtReadings {
  measuredRatio: string;
  polarity: string;
  irPriSec: string;
  irPriGnd: string;
  irSecGnd: string;
}

export interface VtSettings {
  primaryVolts: number | null;
  secondaryVolts: number | null;
  tcf: number | null;
  insulation: InsulationType;
  application: Application;
}

export interface VtResult {
  ratioErrorPercent: number | null;
  ratioResult: Verdict;
  corrected: { priSec: number | null; priGnd: number | null; secGnd: number | null };
  insulationResult: Verdict;
  overall: UnitVerdict;
}

// Floating point noise must not turn an exact 1.2 % into a fail.
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function evaluateVt(r: VtReadings, s: VtSettings): VtResult {
  const ratio = nameplateRatio(s.primaryVolts, s.secondaryVolts);
  const measured = parseNumber(r.measuredRatio);
  const ratioErrorPercent =
    ratio !== null && measured !== null
      ? (Math.abs(ratio - measured) / ratio) * 100
      : null;
  const ratioResult: Verdict =
    ratioErrorPercent === null
      ? ""
      : round4(ratioErrorPercent) <= ratioLimitPercent(s.application)
        ? "PASS"
        : "FAIL";

  const correct = (raw: string) => {
    const n = parseNumber(raw);
    return n === null || s.tcf === null ? null : n * s.tcf;
  };
  const corrected = {
    priSec: correct(r.irPriSec),
    priGnd: correct(r.irPriGnd),
    secGnd: correct(r.irSecGnd),
  };

  let insulationResult: Verdict = "";
  if (
    corrected.priSec !== null &&
    corrected.priGnd !== null &&
    corrected.secGnd !== null &&
    s.primaryVolts &&
    s.secondaryVolts
  ) {
    const minPri = minInsulationMegohms(s.primaryVolts, s.insulation);
    const minSec = minInsulationMegohms(s.secondaryVolts, s.insulation);
    insulationResult =
      corrected.priSec >= minPri && corrected.priGnd >= minPri && corrected.secGnd >= minSec
        ? "PASS"
        : "FAIL";
  }

  const polarity = r.polarity.trim();
  const anyEntered = Boolean(
    r.measuredRatio.trim() ||
      polarity ||
      r.irPriSec.trim() ||
      r.irPriGnd.trim() ||
      r.irSecGnd.trim(),
  );

  let overall: UnitVerdict = "";
  if (anyEntered) {
    if (ratioResult === "FAIL" || insulationResult === "FAIL" || polarity === "Reversed") {
      overall = "FAIL";
    } else if (!ratioResult || !insulationResult || !polarity) {
      overall = "INCOMPLETE";
    } else {
      overall = "PASS";
    }
  }

  return { ratioErrorPercent, ratioResult, corrected, insulationResult, overall };
}
