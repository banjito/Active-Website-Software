/**
 * Pricing-group redistribution: move SOV line items from one estimate into
 * another (existing or new) and carry travel, non-SOV and mobilization along
 * with them, so the combined grand total does not move.
 *
 * Why this is allocation and not re-derivation:
 * overtime is bucketed per day (see recalculateEstimateSnapshot in
 * EstimateSheet.tsx), so re-deriving hours after a split can create or destroy
 * OT and shift the total on its own. Mobilization has the same problem via its
 * tier table plus rounding. So we split the *existing* numbers pro-rata and
 * write them down, rather than recomputing them from the moved rows.
 *
 * That means both sides come out on manual labor hours. This is correct for a
 * presentation re-carve (same crew, same trip, priced in two blocks) and wrong
 * for true phasing (two real mobilizations), which would be a separate mode.
 *
 * Pure module: no React, no Supabase. All money is whole dollars, matching the
 * Math.ceil the estimate sheet applies to FINAL and mobilization.
 */

export type AllocationBasis =
  | "hours"
  | "laborTotal"
  | "materialExpense"
  | "equal";

/** Order we fall back through when the preferred basis has no weight to give. */
const BASIS_ORDER: AllocationBasis[] = [
  "hours",
  "laborTotal",
  "materialExpense",
  "equal",
];

export interface RedistributionLineItem {
  rowType?: "item" | "section" | "subsection" | "blank";
  item?: string;
  quantity?: number | string;
  materialPrice?: number | string;
  expensePrice?: number | string;
  laborMen?: number | string;
  laborHours?: number | string;
  notes?: string;
  [key: string]: any;
}

/** The dollar and hour figures a split has to divide. Read off the source estimate. */
export interface RedistributionOverheads {
  /** Frozen work-hour buckets (these drive labor cost, not the row hours). */
  straightTimeHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  /** Frozen travel-hour buckets. */
  travelStraightTimeHours: number;
  travelOvertimeHours: number;
  travelDoubleTimeHours: number;
  /** Travel non-labor dollars (vehicle, per diem, lodging, flights, rental). */
  travelNonLaborCost: number;
  /** Mobilization dollars as currently quoted on the source. */
  mobilization: number;
}

/** A user-editable override for one overhead stream, as a 0..1 share to the target. */
export interface OverheadSplitOverrides {
  workHours?: number;
  travelHours?: number;
  travelNonLabor?: number;
  nonSov?: number;
  mobilization?: number;
}

export interface RedistributionInput {
  sourceSovItems: RedistributionLineItem[];
  sourceNonSovItems: RedistributionLineItem[];
  overheads: RedistributionOverheads;
  /** Indices into sourceSovItems that are moving to the target. */
  movingIndexes: number[];
  /** Per-stream share overrides (0..1). Omitted streams use the pro-rata share. */
  overrides?: OverheadSplitOverrides;
}

export interface RedistributionShare {
  /** Fraction of the source moving to the target, 0..1. */
  share: number;
  /** Which weighting actually produced it, after fallback. */
  basis: AllocationBasis;
  /** Rows that contributed no weight under the chosen basis. */
  zeroWeightRowIndexes: number[];
}

export interface RedistributionSideOverheads {
  straightTimeHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  travelStraightTimeHours: number;
  travelOvertimeHours: number;
  travelDoubleTimeHours: number;
  travelNonLaborCost: number;
  mobilization: number;
}

export interface RedistributionPlan {
  share: RedistributionShare;
  /** Rows staying on the source, in their original order. */
  sourceSovItems: RedistributionLineItem[];
  /** Rows moving to the target, in their original order. */
  targetSovItems: RedistributionLineItem[];
  /** Non-SOV rows, scaled so the two sides sum back to the original. */
  sourceNonSovItems: RedistributionLineItem[];
  targetNonSovItems: RedistributionLineItem[];
  sourceOverheads: RedistributionSideOverheads;
  targetOverheads: RedistributionSideOverheads;
  /** Non-fatal things the user should see before applying. */
  warnings: string[];
}

const toNum = (value: any): number => {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isStructural = (item: RedistributionLineItem) =>
  item?.rowType === "section" ||
  item?.rowType === "subsection" ||
  item?.rowType === "blank";

/**
 * Split `total` across `weights` so the parts are whole dollars that sum to
 * `total` exactly. Largest-remainder: floor everything, then hand the leftover
 * dollars to the biggest fractional parts. Without this a pro-rata split drifts
 * a few dollars and the letter stops reconciling.
 */
export function allocateDollars(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const rounded = Math.round(toNum(total));
  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = safeWeights.reduce((sum, w) => sum + w, 0);

  // No weight anywhere: put it all on the first bucket rather than losing it.
  if (weightSum <= 0) {
    const out = new Array(n).fill(0);
    out[0] = rounded;
    return out;
  }

  const exact = safeWeights.map((w) => (rounded * w) / weightSum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = rounded - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const out = floors.slice();
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    out[order[cursor % order.length].i] += 1;
    remainder -= 1;
    cursor += 1;
  }
  // Negative totals floor the other way; claw the overshoot back symmetrically.
  while (remainder < 0 && order.length > 0) {
    out[order[cursor % order.length].i] -= 1;
    remainder += 1;
    cursor += 1;
  }
  return out;
}

/** Weight one row under one basis. Structural rows never carry weight. */
export function rowWeight(
  item: RedistributionLineItem,
  basis: AllocationBasis,
): number {
  if (!item || isStructural(item)) return 0;

  const quantity = toNum(item.quantity);
  const laborUnit = toNum(item.laborMen) * toNum(item.laborHours);

  switch (basis) {
    case "hours":
      // Matches sovLaborHours in recalculateEstimateSnapshot. Note a "LOT"
      // quantity parses to 0 here, which is why the fallback chain exists.
      return laborUnit * quantity;
    case "laborTotal":
      // Ignores quantity, so LOT rows still carry their crew hours.
      return laborUnit;
    case "materialExpense":
      return (
        toNum(item.materialPrice) * quantity + toNum(item.expensePrice) * quantity
      );
    case "equal":
      return 1;
    default:
      return 0;
  }
}

/**
 * Pick the first basis that gives the moving rows a non-zero weight *and*
 * leaves the source with non-zero weight, so the split is meaningful in both
 * directions. Falls through hours -> laborTotal -> materialExpense -> equal.
 */
export function resolveBasis(
  sovItems: RedistributionLineItem[],
  movingIndexes: number[],
): AllocationBasis {
  const moving = new Set(movingIndexes);
  for (const basis of BASIS_ORDER) {
    let movedWeight = 0;
    let totalWeight = 0;
    sovItems.forEach((item, index) => {
      const weight = rowWeight(item, basis);
      totalWeight += weight;
      if (moving.has(index)) movedWeight += weight;
    });
    if (totalWeight > 0 && movedWeight > 0) return basis;
  }
  return "equal";
}

/** Pro-rata share of the source that the moving rows represent. */
export function computeShare(
  sovItems: RedistributionLineItem[],
  movingIndexes: number[],
): RedistributionShare {
  const basis = resolveBasis(sovItems, movingIndexes);
  const moving = new Set(movingIndexes);

  let movedWeight = 0;
  let totalWeight = 0;
  const zeroWeightRowIndexes: number[] = [];

  sovItems.forEach((item, index) => {
    if (isStructural(item)) return;
    const weight = rowWeight(item, basis);
    totalWeight += weight;
    if (moving.has(index)) {
      movedWeight += weight;
      if (weight <= 0) zeroWeightRowIndexes.push(index);
    }
  });

  const share = totalWeight > 0 ? movedWeight / totalWeight : 0;
  return {
    share: Math.min(1, Math.max(0, share)),
    basis,
    zeroWeightRowIndexes,
  };
}

/**
 * Scale a non-SOV row's money and hours by `factor`, leaving quantity alone so
 * a "LOT" or a count still reads correctly on the proposal. Scaling the unit
 * prices rather than the quantity is what keeps both halves legible.
 */
function scaleNonSovRow(
  item: RedistributionLineItem,
  factor: number,
): RedistributionLineItem {
  if (isStructural(item)) return { ...item };
  return {
    ...item,
    materialPrice: toNum(item.materialPrice) * factor,
    expensePrice: toNum(item.expensePrice) * factor,
    laborHours: toNum(item.laborHours) * factor,
  };
}

const pickShare = (override: number | undefined, fallback: number): number =>
  override === undefined || !Number.isFinite(override)
    ? fallback
    : Math.min(1, Math.max(0, override));

/**
 * Build the full split. Nothing here touches the database; the caller decides
 * whether to write it. Every dollar figure is allocated with largest-remainder
 * so source + target equals the original exactly.
 */
export function planRedistribution(
  input: RedistributionInput,
): RedistributionPlan {
  const {
    sourceSovItems,
    sourceNonSovItems,
    overheads,
    movingIndexes,
    overrides = {},
  } = input;

  const share = computeShare(sourceSovItems, movingIndexes);
  const warnings: string[] = [];

  const moving = new Set(movingIndexes);
  const targetSovItems: RedistributionLineItem[] = [];
  const remainingSovItems: RedistributionLineItem[] = [];
  sourceSovItems.forEach((item, index) => {
    if (moving.has(index)) targetSovItems.push({ ...item });
    else remainingSovItems.push({ ...item });
  });

  if (share.basis !== "hours") {
    warnings.push(
      `Labor hours could not weight this split, so it was weighted by ${
        share.basis === "laborTotal"
          ? "crew hours per row, ignoring quantity"
          : share.basis === "materialExpense"
            ? "material and expense value"
            : "an equal share per row"
      }. Check the split before applying.`,
    );
  }
  if (share.zeroWeightRowIndexes.length > 0) {
    warnings.push(
      `${share.zeroWeightRowIndexes.length} moving row(s) carry no weight and will move at no cost. Rows with a "LOT" quantity are the usual cause.`,
    );
  }
  if (share.share <= 0) {
    warnings.push(
      "The moving rows account for none of this estimate's value, so no cost will follow them.",
    );
  }

  // Each stream splits pro-rata by default; a user override replaces the share
  // for that stream only.
  const workShare = pickShare(overrides.workHours, share.share);
  const travelHourShare = pickShare(overrides.travelHours, share.share);
  const travelCostShare = pickShare(overrides.travelNonLabor, share.share);
  const nonSovShare = pickShare(overrides.nonSov, share.share);
  const mobilizationShare = pickShare(overrides.mobilization, share.share);

  // Hours split as plain numbers; only money needs largest-remainder.
  const splitHours = (total: number, toTarget: number) => {
    const value = toNum(total);
    const target = value * toTarget;
    return { source: value - target, target };
  };

  const st = splitHours(overheads.straightTimeHours, workShare);
  const ot = splitHours(overheads.overtimeHours, workShare);
  const dt = splitHours(overheads.doubleTimeHours, workShare);
  const tst = splitHours(overheads.travelStraightTimeHours, travelHourShare);
  const tot = splitHours(overheads.travelOvertimeHours, travelHourShare);
  const tdt = splitHours(overheads.travelDoubleTimeHours, travelHourShare);

  const [travelSourceCost, travelTargetCost] = allocateDollars(
    overheads.travelNonLaborCost,
    [1 - travelCostShare, travelCostShare],
  );
  const [mobSource, mobTarget] = allocateDollars(overheads.mobilization, [
    1 - mobilizationShare,
    mobilizationShare,
  ]);

  return {
    share,
    sourceSovItems: remainingSovItems,
    targetSovItems,
    sourceNonSovItems: sourceNonSovItems.map((item) =>
      scaleNonSovRow(item, 1 - nonSovShare),
    ),
    targetNonSovItems: sourceNonSovItems.map((item) =>
      scaleNonSovRow(item, nonSovShare),
    ),
    sourceOverheads: {
      straightTimeHours: st.source,
      overtimeHours: ot.source,
      doubleTimeHours: dt.source,
      travelStraightTimeHours: tst.source,
      travelOvertimeHours: tot.source,
      travelDoubleTimeHours: tdt.source,
      travelNonLaborCost: travelSourceCost,
      mobilization: mobSource,
    },
    targetOverheads: {
      straightTimeHours: st.target,
      overtimeHours: ot.target,
      doubleTimeHours: dt.target,
      travelStraightTimeHours: tst.target,
      travelOvertimeHours: tot.target,
      travelDoubleTimeHours: tdt.target,
      travelNonLaborCost: travelTargetCost,
      mobilization: mobTarget,
    },
    warnings,
  };
}

/**
 * Expand a section header index into the rows that belong to it: the header
 * itself plus every row until the next section header. Sub-sections and the
 * blank spacer rows between sections come along, which is what "split by
 * section" has to mean for the Low Voltage style scopes.
 */
export function sectionSpan(
  sovItems: RedistributionLineItem[],
  sectionIndex: number,
): number[] {
  if (sovItems[sectionIndex]?.rowType !== "section") return [];
  const span = [sectionIndex];
  for (let i = sectionIndex + 1; i < sovItems.length; i += 1) {
    if (sovItems[i]?.rowType === "section") break;
    span.push(i);
  }
  // Trailing blank spacers belong to the gap, not to the section.
  while (
    span.length > 1 &&
    sovItems[span[span.length - 1]]?.rowType === "blank"
  ) {
    span.pop();
  }
  return span;
}

/**
 * Mobilization tier lookup. Mirrors computeMobilizationFactor in
 * EstimateSheet.tsx so the preview and the sheet agree; that file should import
 * this once the override lands.
 */
export function mobilizationFactorFor(
  finalValue: number,
  factors: { base: number; over100k: number; over500k: number; over1m: number },
): number {
  if (finalValue > 1000000) return factors.over1m;
  if (finalValue > 500000) return factors.over500k;
  if (finalValue > 100000) return factors.over100k;
  return factors.base;
}
