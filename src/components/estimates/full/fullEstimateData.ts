/**
 * Full Estimate: the guided, step-by-step estimate.
 *
 * Saved as a normal row in business.estimates (data.estimateType = "guided")
 * in the same shape the Advanced sheet saves, so letters, combined letters,
 * statuses and totals all reuse the existing estimate code. All math comes
 * from estimatePricing.ts and travelExpenses.ts.
 */
import {
  DEFAULT_ESTIMATING_PRESETS,
  type EstimatingPresets,
} from "@/services/estimatingPresetsService";
import {
  DEFAULT_MOBILIZATION_FACTORS,
  DEFAULT_PAYMENT_TERM_FACTORS,
  computeDaysOnsite,
  computeLaborRateSplit,
  computeLineItemTotals,
  summarizeEstimateSnapshot,
  toPriceNumber,
} from "@/lib/estimatePricing";
import {
  DEFAULT_TRAVEL_DATA,
  computeTravelTotals,
  createEmptyTravelGroup,
} from "@/lib/travelExpenses";

export const FULL_ESTIMATE_TYPE = "guided";

/** Reports and PM start at this share of SOV hours. */
export const DEFAULT_AUTO_HOURS_PCT = 5;

export const parseEstimateData = (data: any): any => {
  if (typeof data !== "string") return data || {};
  try {
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
};

export const isFullEstimateData = (data: any): boolean =>
  parseEstimateData(data)?.estimateType === FULL_ESTIMATE_TYPE;

export const FULL_STEPS = [
  { key: "job", label: "Job details" },
  { key: "sov", label: "SOV" },
  { key: "nonSov", label: "Non-SOV" },
  { key: "travel", label: "Travel" },
  { key: "pricing", label: "Pricing" },
  { key: "summary", label: "Summary" },
] as const;

export type FullStepKey = (typeof FULL_STEPS)[number]["key"];

export const createLine = (patch: any = {}) => ({
  rowType: "item",
  item: "",
  size: "",
  quantity: 1,
  materialPrice: 0,
  expensePrice: 0,
  laborMen: 0,
  laborHours: 0,
  notes: "",
  ...patch,
});

const autoHours = (item: string) =>
  createLine({
    item,
    laborMen: 1,
    auto: { basis: "sov_hours", pct: DEFAULT_AUTO_HOURS_PCT },
  });

const positiveOr = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

/** A new estimate, filled from the company presets and the opportunity. */
export function createFullEstimateData(
  presets: EstimatingPresets | null,
  job: any = {},
) {
  const d = DEFAULT_ESTIMATING_PRESETS;
  const p: any = presets || d;
  const men = positiveOr(p.default_number_of_men, d.default_number_of_men);

  return {
    estimateType: FULL_ESTIMATE_TYPE,
    builderStep: "job",
    title: job.title || "",
    client: job.client || "",
    jobDescription: job.jobDescription || "",
    location: job.location || "",
    dateDue: "",
    internalDueDate: "",
    periodOfPerformance: "",
    estimatedStartDate: "",
    poNumber: "",
    notes: "",
    scopeNotes: [],
    useSovItems: true,
    sovItems: [createLine(), createLine(), createLine()],
    nonSovItems: [
      autoHours("Reports"),
      autoHours("Project Management"),
      createLine({ item: "Shipping/ Postage" }),
      createLine({ item: "Equipment Rental" }),
      createLine({ item: "Equipment Purchase" }),
    ],
    billingSchedule: [],
    hoursSummary: {
      men,
      hoursPerDay: positiveOr(
        p.default_hours_per_day,
        d.default_hours_per_day,
      ),
    },
    hourlyRates: {
      straightTime: positiveOr(p.default_hourly_rate, d.default_hourly_rate),
      overtime: positiveOr(p.overtime_rate, d.overtime_rate),
      doubleTime: positiveOr(p.double_time_rate, d.double_time_rate),
    },
    materialMarkup: positiveOr(
      p.default_markup_factor,
      d.default_markup_factor,
    ),
    travel_data: {
      ...DEFAULT_TRAVEL_DATA,
      travel: [
        {
          ...createEmptyTravelGroup(),
          numVehicles: toPriceNumber(p.default_number_of_vehicles),
          rate: toPriceNumber(p.default_vehicle_cost_per_mile),
          numMen: men,
        },
      ],
      perDiem: {
        numDays: 0,
        dailyRate: toPriceNumber(p.default_per_diem_rate),
        numMen: men,
      },
      lodging: {
        numNights: 0,
        numMen: men,
        rate: toPriceNumber(p.default_lodging_rate),
      },
      localMiles: {
        numDays: 0,
        numVehicles: toPriceNumber(p.default_number_of_vehicles),
        milesPerDay: toPriceNumber(p.default_local_miles_per_day),
        rate: toPriceNumber(p.default_vehicle_cost_per_mile),
      },
      airTravel: {
        numMen: toPriceNumber(p.default_flight_number_of_men),
        numTrips: 0,
        numFlights: 0,
        flightRate: toPriceNumber(p.default_flight_rate),
        luggageFees: toPriceNumber(p.default_flight_luggage_fees),
        oneWayHoursInAir: 0,
      },
      rentalCar: {
        numCars: toPriceNumber(p.default_rental_number_of_cars),
        numDays: 0,
        rate: toPriceNumber(p.default_rental_rate),
      },
    },
    // Same keys the Advanced sheet saves, so every reader finds them.
    paymentTermFactors: { ...DEFAULT_PAYMENT_TERM_FACTORS },
    mobilizationFactors: { ...DEFAULT_MOBILIZATION_FACTORS },
    selectedSovPriceTerm: "net30",
    letterPaymentTerm: "net30",
    combinedLetterQuantity: 1,
    isManualLaborHours: false,
    isManualTravelLaborHours: false,
    showSaturdayHours: false,
    showSundayHours: false,
    isManualSaturdayHours: false,
    isManualSundayHours: false,
    netTermsOnly: false,
    manualPriceOverride: false,
    manualPriceValue: 0,
    finalMarkupMultiplier: 1,
    mobilizationOverride: false,
    mobilizationValue: 0,
    mobilizationAddedValue: 0,
    mobilizationMode: "added",
    mobilizationGroups: [],
    travelNonLaborOverride: false,
    travelNonLaborValue: 0,
  };
}

/** Re-derives everything calculated. Run after every edit. */
export function recalculateFullEstimate(data: any) {
  const sovItems = data.sovItems || [];
  const sovHours = computeLineItemTotals(sovItems, []).sovLaborHours;
  const nonSovItems = (data.nonSovItems || []).map((row: any) =>
    row.auto
      ? {
          ...row,
          quantity: 1,
          laborHours: Math.round(sovHours * row.auto.pct) / 100,
        }
      : row,
  );

  const calculatedValues = computeLineItemTotals(sovItems, nonSovItems);
  const { sovLaborHours, nonSovLaborHours, totalLaborHours } = calculatedValues;
  const hs = data.hoursSummary || {};
  const split = computeLaborRateSplit(
    totalLaborHours,
    toPriceNumber(hs.hoursPerDay),
  );
  const travelHours = computeTravelTotals(data.travel_data).laborHours;

  return {
    ...data,
    nonSovItems,
    calculatedValues,
    hoursSummary: {
      ...hs,
      daysOnsite: computeDaysOnsite(sovLaborHours, hs.men, hs.hoursPerDay),
      workHours: sovLaborHours,
      nonSovHours: nonSovLaborHours,
      travelHours,
      totalHours: totalLaborHours + travelHours,
      ...(data.isManualLaborHours ? {} : split),
      ...(data.isManualTravelLaborHours
        ? {}
        : {
            travelStraightTimeHours: travelHours,
            travelOvertimeHours: 0,
            travelDoubleTimeHours: 0,
          }),
    },
  };
}

/** FINAL and mobilization for any saved estimate, Full or not. */
export function getEstimatePrice(data: any) {
  const markup = Number(data?.materialMarkup);
  return summarizeEstimateSnapshot(
    data,
    data?.travel_data,
    Number.isFinite(markup) && markup > 0
      ? markup
      : DEFAULT_ESTIMATING_PRESETS.default_markup_factor,
  );
}

const hoursMatch = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function laborSplitTotal(hs: any) {
  return (
    toPriceNumber(hs?.straightTimeHours) +
    toPriceNumber(hs?.overtimeHours) +
    toPriceNumber(hs?.doubleTimeHours)
  );
}

export function travelSplitTotal(hs: any) {
  return (
    toPriceNumber(hs?.travelStraightTimeHours) +
    toPriceNumber(hs?.travelOvertimeHours) +
    toPriceNumber(hs?.travelDoubleTimeHours)
  );
}

/** What still blocks this step. Empty means Next is open. */
export function getStepIssues(step: FullStepKey, data: any): string[] {
  const issues: string[] = [];
  if (step === "job") {
    if (!String(data.client || "").trim()) issues.push("Customer");
    if (!String(data.location || "").trim()) issues.push("Site");
    if (!data.dateDue) issues.push("Customer due date");
    if (!data.internalDueDate) issues.push("Internal due date");
  }
  if (step === "sov") {
    const items = (data.sovItems || []).filter(
      (row: any) => row.rowType === "item",
    );
    const rows = items.filter((row: any) => String(row.item || "").trim());
    const unnamed = items.filter(
      (row: any) =>
        !String(row.item || "").trim() &&
        (toPriceNumber(row.laborHours) > 0 ||
          toPriceNumber(row.materialPrice) > 0),
    ).length;
    if (unnamed > 0) issues.push(`${unnamed} row(s) need a name`);
    if (rows.length === 0) issues.push("Add at least one SOV row");
    const incomplete = rows.filter(
      (row: any) =>
        toPriceNumber(row.quantity) <= 0 ||
        toPriceNumber(row.laborMen) * toPriceNumber(row.laborHours) <= 0,
    ).length;
    if (incomplete > 0) {
      issues.push(`${incomplete} row(s) need quantity, men and hours`);
    }
    if (toPriceNumber(data.hoursSummary?.men) <= 0) issues.push("Men");
    if (toPriceNumber(data.hoursSummary?.hoursPerDay) <= 0) {
      issues.push("Hours per day");
    }
  }
  if (step === "pricing") {
    const hs = data.hoursSummary || {};
    const work =
      toPriceNumber(hs.workHours) + toPriceNumber(hs.nonSovHours);
    if (!hoursMatch(laborSplitTotal(hs), work)) {
      issues.push("RT / OT / DT hours must match the work hours");
    }
    if (!hoursMatch(travelSplitTotal(hs), toPriceNumber(hs.travelHours))) {
      issues.push("Travel RT / OT / DT hours must match the travel hours");
    }
  }
  return issues;
}
