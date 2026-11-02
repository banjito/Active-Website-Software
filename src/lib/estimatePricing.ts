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

/** Blank, bad or missing values count as 0, same as the estimate sheet's inputs. */
export function toPriceNumber(value: number | string | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(value) || 0;
}

/** Section, sub-section and blank rows carry no quantity or price. */
export const isStructuralLineItem = (item: any) =>
  item?.rowType === "section" ||
  item?.rowType === "subsection" ||
  item?.rowType === "blank";

function calculateExtension(quantity: number | string, price: number | string) {
  const qtyNum =
    typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity || 0;
  const priceNum =
    typeof price === "string" ? parseFloat(price) || 0 : price || 0;
  return qtyNum * priceNum;
}

export const calculateMaterialExtension = calculateExtension;
export const calculateExpenseExtension = calculateExtension;

export function calculateLaborUnit(men: number | string, hours: number | string) {
  const menNum = typeof men === "string" ? parseFloat(men) || 0 : men || 0;
  const hoursNum =
    typeof hours === "string" ? parseFloat(hours) || 0 : hours || 0;
  return menNum * hoursNum;
}

export function calculateLaborTotal(
  quantity: number | string,
  men: number | string,
  hours: number | string,
) {
  const qtyNum =
    typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity || 0;
  return qtyNum * calculateLaborUnit(men, hours);
}

/** Dollar and hour totals for an estimate's rows. Saved as data.calculatedValues. */
export function computeLineItemTotals(sovItems: any[], nonSovItems: any[]) {
  const sumRows = (items: any[]) => {
    let material = 0;
    let expense = 0;
    let labor = 0;
    let laborHours = 0;
    items.forEach((item) => {
      if (isStructuralLineItem(item)) return;
      material += calculateMaterialExtension(item.quantity, item.materialPrice);
      expense += calculateExpenseExtension(item.quantity, item.expensePrice);
      labor += calculateLaborTotal(
        item.quantity,
        item.laborMen,
        item.laborHours,
      );
      laborHours +=
        calculateLaborUnit(item.laborMen, item.laborHours) *
        toPriceNumber(item.quantity);
    });
    return { material, expense, labor, laborHours };
  };

  const sov = sumRows(sovItems);
  const nonSov = sumRows(nonSovItems);
  const totalMaterial = sov.material + nonSov.material;
  const totalExpense = sov.expense + nonSov.expense;
  const totalLabor = sov.labor + nonSov.labor;

  return {
    subtotalMaterial: totalMaterial,
    subtotalExpense: totalExpense,
    subtotalLabor: totalLabor,
    totalMaterial,
    totalExpense,
    totalLabor,
    grandTotal: totalMaterial + totalExpense + totalLabor,
    nonSovMaterial: nonSov.material,
    nonSovExpense: nonSov.expense,
    nonSovLabor: nonSov.labor,
    sovLaborHours: sov.laborHours,
    nonSovLaborHours: nonSov.laborHours,
    totalLaborHours: sov.laborHours + nonSov.laborHours,
  };
}

/** Days onsite come from SOV hours only (not PM or reports). Travel trips key off this. */
export function computeDaysOnsite(
  sovLaborHours: number,
  men: number | string,
  hoursPerDay: number | string,
) {
  const menNum = toPriceNumber(men);
  const hoursPerDayNum = toPriceNumber(hoursPerDay);
  return menNum > 0 && hoursPerDayNum > 0
    ? sovLaborHours / (menNum * hoursPerDayNum)
    : 0;
}

/** Each day: first 8 hours straight time, next 4 overtime, the rest double time. */
export function computeLaborRateSplit(
  totalWorkHours: number,
  hoursPerDay: number,
) {
  let straightTimeHours = 0;
  let overtimeHours = 0;
  let doubleTimeHours = 0;

  if (totalWorkHours > 0 && hoursPerDay > 0) {
    const totalDays = Math.ceil(totalWorkHours / hoursPerDay);

    for (let day = 0; day < totalDays; day++) {
      const hoursThisDay = Math.min(
        hoursPerDay,
        totalWorkHours - day * hoursPerDay,
      );

      if (hoursThisDay <= 8) {
        straightTimeHours += hoursThisDay;
      } else if (hoursThisDay <= 12) {
        straightTimeHours += 8;
        overtimeHours += hoursThisDay - 8;
      } else {
        straightTimeHours += 8;
        overtimeHours += 4;
        doubleTimeHours += hoursThisDay - 12;
      }
    }
  }

  return { straightTimeHours, overtimeHours, doubleTimeHours };
}

/** "Net terms only" turns off the tax factor and the final markup divisor. */
export function getPricingFactors(netTermsOnly: boolean) {
  return {
    taxFactor: netTermsOnly ? 1.0 : 1.09,
    finalMarkupDivisor: netTermsOnly ? 1.0 : 0.96,
  };
}

/**
 * Material + expense dollars, shared by every day-type scenario.
 * Note: totalExpense already includes nonSovExpense, so non-SOV expense counts twice here.
 */
export function computeMaterialExpenseBase(
  calculatedValues: any,
  materialMarkup: number | string,
  taxFactor: number,
) {
  const cv = calculatedValues || {};
  return (
    toPriceNumber(cv.totalMaterial) * taxFactor * toPriceNumber(materialMarkup) +
    toPriceNumber(cv.totalExpense) * taxFactor +
    toPriceNumber(cv.nonSovExpense) * 1.0
  );
}

export function computeWorkLaborCost(hours: any, rates: any) {
  return (
    toPriceNumber(hours?.straightTimeHours) * toPriceNumber(rates?.straightTime) +
    toPriceNumber(hours?.overtimeHours) * toPriceNumber(rates?.overtime) +
    toPriceNumber(hours?.doubleTimeHours) * toPriceNumber(rates?.doubleTime)
  );
}

export function computeTravelLaborCost(hours: any, rates: any) {
  return (
    toPriceNumber(hours?.travelStraightTimeHours) *
      toPriceNumber(rates?.straightTime) +
    toPriceNumber(hours?.travelOvertimeHours) * toPriceNumber(rates?.overtime) +
    toPriceNumber(hours?.travelDoubleTimeHours) *
      toPriceNumber(rates?.doubleTime)
  );
}

/** FINAL before the optional final markup. A manual price wins over the math. */
export function computeBaseFinalValue(
  costs: {
    materialExpenseBase: number;
    workLabor: number;
    travelLabor: number;
    travelNonLabor: number;
  },
  finalMarkupDivisor: number,
  manualPrice?: number | null,
) {
  if (manualPrice != null) return Math.max(0, manualPrice);
  return Math.ceil(
    (costs.materialExpenseBase +
      costs.workLabor +
      costs.travelLabor +
      costs.travelNonLabor) /
      finalMarkupDivisor,
  );
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
  const { taxFactor, finalMarkupDivisor } = getPricingFactors(
    !!parsedData?.netTermsOnly,
  );

  const hs = parsedData?.hoursSummary || {};

  const workLabor = computeWorkLaborCost(hs, rates);
  const travelLabor = computeTravelLaborCost(hs, rates);
  const travelNonLabor = Math.max(
    0,
    resolveTravelNonLaborCost(travelData, parsedData),
  );

  const manual = parsedData?.manualPriceOverride
    ? toPriceNumber(parsedData.manualPriceValue)
    : null;
  const rawFinal = computeBaseFinalValue(
    {
      materialExpenseBase: computeMaterialExpenseBase(
        parsedData?.calculatedValues,
        materialMarkupValue,
        taxFactor,
      ),
      workLabor,
      travelLabor,
      travelNonLabor,
    },
    finalMarkupDivisor,
    manual,
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
