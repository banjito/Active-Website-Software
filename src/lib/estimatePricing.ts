// Price math for a saved estimate. Lives outside the estimate sheet so other screens
// (the PM dashboard) can price an estimate the same way the sheet does, to the dollar.

import { DEFAULT_ESTIMATING_PRESETS } from "@/services/estimatingPresetsService";
import { computeTravelTotals } from "@/lib/travelExpenses";

/** Labor rates from each estimate's saved JSON — combined letters must not use the active tab's rates for every scope. */
export function getHourlyRatesForCombinedScope(parsedData: any): {
  straightTime: number;
  overtime: number;
  doubleTime: number;
} {
  const hr = parsedData?.hourlyRates;
  if (hr && typeof hr === "object") {
    const st = Number(hr.straightTime);
    const ot = Number(hr.overtime);
    const dt = Number(hr.doubleTime);
    return {
      straightTime: Number.isFinite(st)
        ? st
        : DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
      overtime: Number.isFinite(ot)
        ? ot
        : DEFAULT_ESTIMATING_PRESETS.overtime_rate,
      doubleTime: Number.isFinite(dt)
        ? dt
        : DEFAULT_ESTIMATING_PRESETS.double_time_rate,
    };
  }
  return {
    straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
    doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate,
  };
}

export const DEFAULT_MOBILIZATION_FACTORS = {
  base: 0.0,
  over100k: 0.1,
  over500k: 0.05,
  over1m: 0.05,
};

export const DEFAULT_PAYMENT_TERM_FACTORS = {
  net30: 1.0,
  net60: 1.06,
  net90: 1.09,
};

/** Payment-term factors are price multipliers, so a saved 0 / negative / non-numeric factor
 * (e.g. a cleared input persisted as 0) zeroes out every NET price — fall back per key. */
export function sanitizePaymentTermFactors(raw: unknown): {
  net30: number;
  net60: number;
  net90: number;
} {
  const src = (
    raw && typeof raw === "object" ? raw : {}
  ) as Record<string, unknown>;
  const pick = (key: "net30" | "net60" | "net90") => {
    const n = Number(src[key]);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAYMENT_TERM_FACTORS[key];
  };
  return { net30: pick("net30"), net60: pick("net60"), net90: pick("net90") };
}

/** Mobilization factors from each estimate's saved JSON — combined letters must not use the active tab's factors for every scope. */
export function getMobilizationFactorsForCombinedScope(parsedData: any): {
  base: number;
  over100k: number;
  over500k: number;
  over1m: number;
} {
  const mf = parsedData?.mobilizationFactors;
  if (mf && typeof mf === "object") {
    const b = Number(mf.base);
    const k = Number(mf.over100k);
    const fk = Number(mf.over500k);
    const m = Number(mf.over1m);
    return {
      base: Number.isFinite(b) ? b : DEFAULT_MOBILIZATION_FACTORS.base,
      over100k: Number.isFinite(k) ? k : DEFAULT_MOBILIZATION_FACTORS.over100k,
      over500k: Number.isFinite(fk)
        ? fk
        : DEFAULT_MOBILIZATION_FACTORS.over500k,
      over1m: Number.isFinite(m) ? m : DEFAULT_MOBILIZATION_FACTORS.over1m,
    };
  }
  return { ...DEFAULT_MOBILIZATION_FACTORS };
}

/**
 * Optional final markup (1.05 = +5%) applied on top of FINAL, after the
 * estimator is happy with the price. NET prices and mobilization are both
 * worked out from FINAL, so they pick it up too. Missing / bad values = 1.
 */
export function getFinalMarkupMultiplier(source: any): number {
  const n = Number(source?.finalMarkupMultiplier);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function applyFinalMarkup(value: number, multiplier: number): number {
  return multiplier === 1 ? value : Math.ceil(value * multiplier);
}

/** Pure mobilization-factor lookup that works with any factors object (not just component state). */
export function computeMobilizationFactor(
  finalValue: number,
  factors: { base: number; over100k: number; over500k: number; over1m: number },
) {
  if (finalValue > 1000000) return factors.over1m;
  if (finalValue > 500000) return factors.over500k;
  if (finalValue > 100000) return factors.over100k;
  return factors.base;
}

/**
 * Mobilization dollars for one scope. An explicit override wins over the tier
 * table: when a pricing group is split, the pieces have to add back up to the
 * original mobilization, and the tiers plus their rounding will not do that on
 * their own. Set by redistribution, or by hand on the estimate.
 */
export function resolveMobilizationAmount(
  finalValue: number,
  factors: { base: number; over100k: number; over500k: number; over1m: number },
  source?: { mobilizationOverride?: boolean; mobilizationValue?: any } | null,
) {
  if (source?.mobilizationOverride) {
    const overridden = Number(source.mobilizationValue);
    return Number.isFinite(overridden) && overridden > 0
      ? Math.round(overridden)
      : 0;
  }
  return Math.ceil(finalValue * computeMobilizationFactor(finalValue, factors));
}

export type MobilizationMode = "added" | "baked";
export interface MobilizationGroup {
  id: string;
  percent: number;
  mode: MobilizationMode;
}

/** Extra mobilization groups saved on an estimate; drops anything malformed. */
export function sanitizeMobilizationGroups(raw: unknown): MobilizationGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && typeof g === "object")
    .map((g: any, i) => {
      const pct = Number(g.percent);
      return {
        id: String(g.id || `mob-${i}`),
        percent: Number.isFinite(pct) && pct > 0 ? pct : 0,
        mode: (g.mode === "baked" ? "baked" : "added") as MobilizationMode,
      };
    });
}

/**
 * Mobilization in two parts:
 * - total: what the proposal quotes as "Mobilization costs of ..."
 * - added: the part added on top of the price. "Baked in" groups raise the
 *   mobilization without raising the price ($100k scope + 5% baked in =
 *   $100k total with $5k mobilization).
 * The tiered amount is the main group; extra groups are a flat % of FINAL.
 * A split's fixed amount replaces all groups, with its own added part.
 * `tierValue` picks the tier when FINAL is already multiplied by a quantity.
 */
export function resolveMobilizationBreakdown(
  finalValue: number,
  factors: { base: number; over100k: number; over500k: number; over1m: number },
  source?: {
    mobilizationOverride?: boolean;
    mobilizationValue?: any;
    mobilizationAddedValue?: any;
    mobilizationMode?: any;
    mobilizationGroups?: any;
  } | null,
  tierValue: number = finalValue,
): { total: number; added: number } {
  if (source?.mobilizationOverride) {
    const total = resolveMobilizationAmount(finalValue, factors, source);
    const rawAdded = source.mobilizationAddedValue;
    const addedNum = Number(rawAdded);
    const added =
      rawAdded != null && rawAdded !== "" && Number.isFinite(addedNum)
        ? Math.min(total, Math.max(0, Math.round(addedNum)))
        : total;
    return { total, added };
  }
  const main = Math.ceil(
    finalValue * computeMobilizationFactor(tierValue, factors),
  );
  let total = main;
  let added = source?.mobilizationMode === "baked" ? 0 : main;
  for (const g of sanitizeMobilizationGroups(source?.mobilizationGroups)) {
    const amount = Math.ceil((finalValue * g.percent) / 100);
    total += amount;
    if (g.mode !== "baked") added += amount;
  }
  return { total, added };
}

/**
 * Travel non-labor dollars for one scope. A split allocates travel as an
 * amount rather than as trips, because trips and flights don't divide: you
 * either make the drive or you don't. When a scope carries an allocated
 * amount it wins over whatever its own travel inputs would compute.
 */
export function resolveTravelNonLaborCost(
  travelData: any,
  source?: {
    travelNonLaborOverride?: boolean;
    travelNonLaborValue?: any;
  } | null,
) {
  if (source?.travelNonLaborOverride) {
    const allocated = Number(source.travelNonLaborValue);
    return Number.isFinite(allocated) && allocated > 0 ? allocated : 0;
  }
  try {
    const sum = computeTravelTotals(travelData || {}).nonLaborCost;
    return Number.isFinite(sum) ? sum : 0;
  } catch {
    return 0;
  }
}

/**
 * FINAL, mobilization and the overhead figures for a saved estimate snapshot.
 * Mirrors the combined-letter pricing math so a redistribution preview shows
 * the same numbers the proposal will print.
 */
export function summarizeEstimateSnapshot(
  parsedData: any,
  travelData: any,
  materialMarkupValue: number,
) {
  const rates = getHourlyRatesForCombinedScope(parsedData);
  const factors = getMobilizationFactorsForCombinedScope(parsedData);
  const netTerms = !!parsedData?.netTermsOnly;
  const tax = netTerms ? 1.0 : 1.09;
  const divisor = netTerms ? 1.0 : 0.96;

  const cv = parsedData?.calculatedValues || {};
  const hs = parsedData?.hoursSummary || {};

  const matExpBase =
    (cv.totalMaterial || 0) * tax * materialMarkupValue +
    (cv.totalExpense || 0) * tax +
    (cv.nonSovExpense || 0) * 1.0;
  const workLabor =
    (hs.straightTimeHours || 0) * rates.straightTime +
    (hs.overtimeHours || 0) * rates.overtime +
    (hs.doubleTimeHours || 0) * rates.doubleTime;
  const travelLabor =
    (hs.travelStraightTimeHours || 0) * rates.straightTime +
    (hs.travelOvertimeHours || 0) * rates.overtime +
    (hs.travelDoubleTimeHours || 0) * rates.doubleTime;
  const travelNonLabor = Math.max(
    0,
    resolveTravelNonLaborCost(travelData, parsedData),
  );

  const manual = parsedData?.manualPriceOverride
    ? Math.max(0, Number(parsedData.manualPriceValue) || 0)
    : null;
  const rawFinal =
    manual != null
      ? manual
      : Math.ceil(
          (matExpBase + workLabor + travelLabor + travelNonLabor) / divisor,
        );
  const finalValue = Number.isFinite(rawFinal)
    ? applyFinalMarkup(rawFinal, getFinalMarkupMultiplier(parsedData))
    : 0;

  const mob = resolveMobilizationBreakdown(finalValue, factors, parsedData);

  return {
    finalValue,
    mobilization: mob.total,
    mobilizationAdded: mob.added,
    travelNonLabor,
    workLabor,
    travelLabor,
    hoursSummary: hs,
    rates,
    factors,
    isManualPrice: manual != null,
  };
}

/**
 * Dollars per labor hour on a saved estimate's SOV rows, at the NET term the sheet shows.
 * A row's "SOV item price" is this times its labor unit (techs x hours). Same formula as
 * calculateSOVItemPrice in EstimateSheet: the labor share of FINAL, no materials or expenses.
 */
export function sovPricePerLaborHour(parsedData: any, travelData: any): number {
  const markup = Number(parsedData?.materialMarkup);
  const { finalValue } = summarizeEstimateSnapshot(
    parsedData,
    travelData,
    Number.isFinite(markup) && markup > 0
      ? markup
      : DEFAULT_ESTIMATING_PRESETS.default_markup_factor,
  );

  const workHours = Number(parsedData?.hoursSummary?.workHours);
  if (!Number.isFinite(workHours) || workHours <= 0) return 0;

  const factors = sanitizePaymentTermFactors(parsedData?.paymentTermFactors);
  const term = parsedData?.selectedSovPriceTerm as keyof typeof factors;
  const perHour = (finalValue / workHours) * (factors[term] ?? factors.net30);
  return Number.isFinite(perHour) ? perHour : 0;
}
