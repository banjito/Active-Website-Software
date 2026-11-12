// Estimates: read them, search the scope library, and create or edit Advanced
// and Simple estimates. Sales portal only, like the app.
//
// Every number comes from ../_shared/estimateMath.ts, the same file the app
// prices with, so totals and NET prices here match the sheet to the dollar.
//
// Saved shapes MIRROR the app. Update together:
//  - Advanced: src/components/estimates/EstimateSheet.tsx (no estimateType).
//    rollUp() mirrors its rollUpSubItems; recalc() mirrors its recalculation.
//  - Guided:   src/components/estimates/full/fullEstimateData.ts ("guided").
//    Same shape as Advanced, so edits work the same way.
//  - Simple:   src/components/estimates/SimpleEstimateEditor.tsx ("simple").
//
// Writes: every edit checks a revision (a fingerprint of the saved contents;
// the app never updates estimates.updated_at) so it never overwrites a newer
// edit, and every save leaves a note on the opportunity saying what the AI did.

import { canUseSales } from "./access.ts";
import { APP_URL, clampLimit, cleanSearch, type Row, str } from "./lib.ts";
import type { ToolContext } from "./mcp.ts";
import { resolveOpportunity } from "./office.ts";
import type { Tool } from "./tools.ts";
import {
  calculateLaborTotal,
  calculateMaterialExtension,
  computeDaysOnsite,
  computeLaborRateSplit,
  computeLineItemTotals,
  createEmptyTravelGroup,
  DEFAULT_ESTIMATING_PRESETS as D,
  DEFAULT_MOBILIZATION_FACTORS,
  DEFAULT_PAYMENT_TERM_FACTORS,
  DEFAULT_TRAVEL_DATA,
  sanitizePaymentTermFactors,
  summarizeEstimateSnapshot,
  toPriceNumber,
} from "../_shared/estimateMath.ts";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const CREATES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const EDITS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const salesOnly = (ctx: ToolContext) => canUseSales(ctx.user);

const MAX_ROWS = 500;

// deno-lint-ignore no-explicit-any
const fail = (what: string, error: any): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
};

const num = (v: unknown): number => toPriceNumber(v as number | string | null | undefined);
const positiveOr = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const has = (o: Row, key: string) => o[key] !== undefined && o[key] !== null;
const nameKey = (v: unknown) => String(v ?? "").trim().toLowerCase();
const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

const parseJson = (v: unknown): Row => {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" ? (v as Row) : {};
};

type Kind = "advanced" | "guided" | "simple";
const kindOf = (data: Row): Kind =>
  data.estimateType === "simple" ? "simple" : data.estimateType === "guided" ? "guided" : "advanced";
const KIND_LABEL: Record<Kind, string> = { advanced: "Advanced", guided: "Guided", simple: "Simple" };

const oppLink = (id: string) => (APP_URL ? `${APP_URL}/sales-dashboard/opportunities/${id}` : undefined);

// ------------------------------------------------------------------- rows

const ROW_TYPES = ["item", "section", "subsection", "blank"];

const EMPTY_ROW = {
  rowType: "item",
  item: "",
  quantity: 0,
  materialPrice: 0,
  expensePrice: 0,
  laborMen: 0,
  laborHours: 0,
  notes: "",
};

/** The sheet's default non-SOV rows (EstimateSheet DEFAULT_NON_SOV_ITEMS). */
const DEFAULT_NON_SOV_NAMES = ["Reports", "Project Management", "Shipping/ Postage", "Equipment Rental", "Equipment Purchase"];

/** A parent row's material and hours come from its sub-rows. Mirror of EstimateSheet rollUpSubItems. */
function rollUp(row: Row): Row {
  const subs = row.subItems;
  if (!Array.isArray(subs) || subs.length === 0) return row;
  const material = subs.reduce((sum: number, s: Row) => sum + calculateMaterialExtension(s.quantity, s.materialPrice), 0);
  const labor = subs.reduce((sum: number, s: Row) => sum + calculateLaborTotal(s.quantity, s.laborMen, s.laborHours), 0);
  const techs = Number(row.laborMen) || 0;
  return { ...row, materialPrice: Math.round(material * 100) / 100, laborHours: techs > 0 ? labor / techs : 0 };
}

/** Saved row -> what Claude reads. Same field names Claude writes back. */
function rowOut(r: Row): Row {
  const type = ROW_TYPES.includes(r?.rowType) ? r.rowType : "item";
  if (type !== "item") return str(r.item) ? { type, item: str(r.item) } : { type };
  const out: Row = { item: String(r.item ?? "").trim() };
  if (str(r.size)) out.size = str(r.size);
  out.quantity = num(r.quantity);
  out.techs = num(r.laborMen);
  out.hours = Math.round(num(r.laborHours) * 1000) / 1000;
  if (num(r.materialPrice)) out.material = num(r.materialPrice);
  if (num(r.expensePrice)) out.expense = num(r.expensePrice);
  if (str(r.notes)) out.notes = str(r.notes);
  if (r.auto && has(r.auto, "pct")) out.auto_hours_pct = num(r.auto.pct);
  if (Array.isArray(r.subItems) && r.subItems.length) {
    out.sub_rows = r.subItems.map(rowOut);
    if (r.showSubItemsInProposal) out.show_sub_rows_in_proposal = true;
  }
  return out;
}

type Library = Map<string, Row>;

/** Claude's row -> saved row. `base` is the old row it replaces (keeps fields Claude never sees). */
function rowIn(input: Row, lib: Library, base: Row, canHoldSubRows: boolean): Row {
  const type = ROW_TYPES.includes(input?.type) ? input.type : "item";
  if (type !== "item") return { ...EMPTY_ROW, rowType: type, item: type === "blank" ? "" : str(input.item) };

  const libId = str(input.library_item_id);
  const libItem = libId ? lib.get(libId) : undefined;
  if (libId && !libItem) throw new Error(`Library item ${libId} not found. Use search_estimate_library for ids.`);

  const row: Row = { ...EMPTY_ROW, ...base, rowType: "item" };
  if (libItem) {
    Object.assign(row, {
      item: libItem.item_name,
      materialPrice: num(libItem.material_cost),
      laborMen: num(libItem.tech_count),
      laborHours: num(libItem.hours),
      notes: libItem.estimate_notes || "",
    });
  }
  if (has(input, "item")) row.item = str(input.item);
  if (has(input, "size")) row.size = str(input.size);
  if (has(input, "quantity")) row.quantity = num(input.quantity);
  else if (num(row.quantity) <= 0) row.quantity = 1;
  if (has(input, "techs")) row.laborMen = num(input.techs);
  if (has(input, "hours")) {
    row.laborHours = num(input.hours);
    delete row.auto; // Typed hours replace a Guided estimate's automatic hours.
  }
  if (has(input, "material")) row.materialPrice = num(input.material);
  if (has(input, "expense")) row.expensePrice = num(input.expense);
  if (has(input, "notes")) row.notes = str(input.notes);

  let subs: Row[] | undefined;
  if (Array.isArray(input.sub_rows)) {
    if (input.sub_rows.length && !canHoldSubRows) {
      throw new Error(`"${row.item}": only top-level SOV rows can have sub-rows.`);
    }
    subs = input.sub_rows.map((s: Row) => rowIn(s, lib, {}, false));
  } else if (canHoldSubRows && libItem?.parts?.length) {
    // Assembly from the library: its parts come in as sub-rows, like the sheet.
    subs = libItem.parts.map((p: Row) => ({
      ...EMPTY_ROW,
      item: p.item_name,
      quantity: num(p.default_quantity),
      materialPrice: num(p.material_cost),
      laborMen: num(p.tech_count),
      laborHours: num(p.hours),
      notes: p.estimate_notes || "",
    }));
  }
  if (subs) {
    if (subs.length) {
      row.subItems = subs;
      row.subItemsCollapsed = false;
      // Labor hours divide by techs, so a parent needs at least one tech.
      if (num(row.laborMen) <= 0) row.laborMen = 1;
    } else {
      delete row.subItems;
    }
  }
  if (has(input, "show_sub_rows_in_proposal")) row.showSubItemsInProposal = !!input.show_sub_rows_in_proposal;
  return rollUp(row);
}

/** Builds a row list. Each input row reuses the first unused old row with the same name. */
function rowsIn(inputs: unknown, old: Row[], lib: Library, canHoldSubRows: boolean): Row[] {
  if (!Array.isArray(inputs)) throw new Error("Rows must be a list.");
  if (inputs.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS}).`);
  const used = new Set<number>();
  return inputs.map((input: Row) => {
    const type = ROW_TYPES.includes(input?.type) ? input.type : "item";
    const idx = old.findIndex(
      (o, i) => !used.has(i) && (o.rowType || "item") === type && nameKey(o.item) === nameKey(input?.item) && !!nameKey(input?.item),
    );
    if (idx >= 0) used.add(idx);
    return rowIn(input ?? {}, lib, idx >= 0 ? old[idx] : {}, canHoldSubRows);
  });
}

/** Loads the library items (and assembly parts) that rows point to. */
async function loadLibrary(ctx: ToolContext, rowLists: unknown[]): Promise<Library> {
  const ids = new Set<string>();
  const walk = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows as Row[]) {
      if (str(r?.library_item_id)) ids.add(str(r.library_item_id));
      walk(r?.sub_rows);
    }
  };
  rowLists.forEach(walk);
  const lib: Library = new Map();
  if (!ids.size) return lib;
  const items = await libraryItems(ctx, [...ids]);
  for (const item of items) lib.set(item.id, item);
  return lib;
}

const LIBRARY_COLUMNS = "id, item_name, activity, material_cost, tech_count, hours, estimate_notes, library_notes";

/** Library items by id, each with its active parts (for assemblies). */
async function libraryItems(ctx: ToolContext, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  const { data, error } = await ctx.supabase
    .schema("business")
    .from("estimating_scope_library_items")
    .select(LIBRARY_COLUMNS)
    .in("id", ids);
  if (error) fail("Couldn't read the scope library", error);
  const items = (data ?? []) as Row[];
  const { data: links } = await ctx.supabase
    .schema("business")
    .from("estimating_scope_library_item_components")
    .select("assembly_id, component_id, default_quantity, sort_order")
    .in("assembly_id", items.map((i) => i.id))
    .order("sort_order");
  const partIds = [...new Set(((links ?? []) as Row[]).map((l) => l.component_id))];
  const parts: Record<string, Row> = {};
  if (partIds.length) {
    const { data: ps } = await ctx.supabase
      .schema("business")
      .from("estimating_scope_library_items")
      .select(LIBRARY_COLUMNS + ", is_active")
      .in("id", partIds);
    for (const p of (ps ?? []) as Row[]) parts[p.id] = p;
  }
  for (const item of items) {
    item.parts = ((links ?? []) as Row[])
      .filter((l) => l.assembly_id === item.id && parts[l.component_id]?.is_active)
      .map((l) => ({ ...parts[l.component_id], default_quantity: num(l.default_quantity) }));
  }
  return items;
}

// ------------------------------------------------------------------- math

/** Re-derives every calculated value. Mirrors the sheet's recalculation; travel is left as saved. */
function recalc(data: Row): Row {
  const sovItems = (data.sovItems || []).map(rollUp);
  const sovHours = computeLineItemTotals(sovItems, []).sovLaborHours;
  const nonSovItems = (data.nonSovItems || []).map((r: Row) =>
    r.auto ? { ...r, quantity: 1, laborHours: Math.round(sovHours * num(r.auto.pct)) / 100 } : rollUp(r),
  );
  const cv = computeLineItemTotals(sovItems, nonSovItems);
  const hs = data.hoursSummary || {};
  const travelHours = num(hs.travelHours);
  return {
    ...data,
    sovItems,
    nonSovItems,
    calculatedValues: { ...(data.calculatedValues || {}), ...cv },
    hoursSummary: {
      ...hs,
      daysOnsite: computeDaysOnsite(cv.sovLaborHours, hs.men, hs.hoursPerDay),
      workHours: cv.sovLaborHours,
      nonSovHours: cv.nonSovLaborHours,
      travelHours,
      totalHours: cv.totalLaborHours + travelHours,
      ...(data.isManualLaborHours ? {} : computeLaborRateSplit(cv.totalLaborHours, num(hs.hoursPerDay))),
    },
  };
}

/** The proposal letter's prices: ceil(FINAL x NET factor) + mobilization added on top. */
function priceOf(data: Row, travel: unknown): Row {
  const s = summarizeEstimateSnapshot(data, travel, positiveOr(data.materialMarkup, D.default_markup_factor));
  const f = sanitizePaymentTermFactors(data.paymentTermFactors);
  const option = (k: "net30" | "net60" | "net90") => Math.ceil(s.finalValue * f[k]) + s.mobilizationAdded;
  return {
    net30: option("net30"),
    net60: option("net60"),
    net90: option("net90"),
    mobilization: s.mobilization,
    travel_cost: Math.round(s.travelNonLabor * 100) / 100,
    ...(s.isManualPrice && kindOf(data) !== "simple" ? { note: "The price on this estimate was typed in by hand." } : {}),
  };
}

/** Fingerprint of the saved contents. Changes whenever anyone saves the estimate. */
async function revisionOf(row: Row): Promise<string> {
  const text = JSON.stringify([row.data ?? null, row.travel_data ?? null]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const versionNum = (r: Row) => {
  const m = String(r.quote_number || "").match(/v(\d+)$/);
  return m ? parseInt(m[1]) : 0;
};

const travelOf = (row: Row, data: Row) => {
  const col = parseJson(row.travel_data);
  return Object.keys(col).length ? col : (data.travel_data ?? {});
};

// ----------------------------------------------------------------- simple

/** Mirror of SimpleEstimateEditor.handleSave. */
function simpleData(title: string, items: Row[], markup: unknown, travelItems: Row[]): Row {
  const cleanItems = items
    .map((li) => ({ item: str(li?.item), quantity: has(li ?? {}, "quantity") ? num(li.quantity) : 1, price: num(li?.price) }))
    .filter((li) => li.item || li.price > 0);
  const cleanTravel = travelItems
    .map((t) => ({ item: str(t?.item), amount: has(t ?? {}, "amount") && t.amount !== "" ? num(t.amount) : "" }))
    .filter((t) => t.item || num(t.amount) > 0);
  const markupNum = num(markup) > 0 ? num(markup) : 1;
  const subtotal = cleanItems.reduce((sum, li) => sum + li.quantity * li.price, 0);
  const travelTotal = cleanTravel.reduce((sum, t) => sum + num(t.amount), 0);
  const total = Math.ceil(subtotal * markupNum + travelTotal);
  return {
    estimateType: "simple",
    title,
    simpleItems: cleanItems,
    simpleMarkupMultiplier: markupNum,
    simpleTravelItems: cleanTravel,
    sovItems: cleanItems
      .filter((li) => li.item)
      .map((li) => ({ ...EMPTY_ROW, item: li.item, quantity: li.quantity || 1 })),
    nonSovItems: [],
    useSovItems: true,
    manualPriceOverride: true,
    manualPriceValue: total,
    finalMarkupMultiplier: 1,
    mobilizationOverride: true,
    mobilizationValue: 0,
    mobilizationAddedValue: 0,
    mobilizationMode: "added",
    mobilizationGroups: [],
    travelNonLaborOverride: true,
    travelNonLaborValue: travelTotal,
    calculatedValues: {
      subtotalMaterial: 0,
      subtotalExpense: 0,
      subtotalLabor: 0,
      totalMaterial: 0,
      totalExpense: 0,
      totalLabor: 0,
      grandTotal: total,
      nonSovMaterial: 0,
      nonSovExpense: 0,
      nonSovLabor: 0,
      sovLaborHours: 0,
      nonSovLaborHours: 0,
      totalLaborHours: 0,
    },
    hoursSummary: {},
    travel_data: {},
  };
}

const SIMPLE_DEFAULT_TRAVEL = ["Mileage", "Lodging", "Per Diem", "Airfare", "Rental Car"].map((item) => ({ item, amount: "" }));

// --------------------------------------------------------------- advanced

/** A new Advanced estimate from the company presets. Mirrors fullEstimateData.createFullEstimateData. */
function advancedData(presets: Row, job: Row): Row {
  const p = { ...D, ...presets };
  const men = positiveOr(job.men, positiveOr(p.default_number_of_men, D.default_number_of_men));
  const vehicles = num(p.default_number_of_vehicles);
  const perMile = num(p.default_vehicle_cost_per_mile);
  return {
    title: job.title || "",
    client: job.client || "",
    jobDescription: job.jobDescription || "",
    location: job.location || "",
    dateDue: job.dateDue || "",
    periodOfPerformance: "",
    estimatedStartDate: "",
    poNumber: "",
    notes: job.notes || "",
    useSovItems: true,
    useScopeNarrative: false,
    scopeNarrative: "",
    sovItems: [],
    nonSovItems: DEFAULT_NON_SOV_NAMES.map((item) => ({ ...EMPTY_ROW, item, quantity: 1 })),
    hoursSummary: {
      men,
      hoursPerDay: positiveOr(job.hoursPerDay, positiveOr(p.default_hours_per_day, D.default_hours_per_day)),
      travelHours: 0,
      travelStraightTimeHours: 0,
      travelOvertimeHours: 0,
      travelDoubleTimeHours: 0,
    },
    hourlyRates: {
      straightTime: positiveOr(p.default_hourly_rate, D.default_hourly_rate),
      overtime: positiveOr(p.overtime_rate, D.overtime_rate),
      doubleTime: positiveOr(p.double_time_rate, D.double_time_rate),
    },
    materialMarkup: positiveOr(p.default_markup_factor, D.default_markup_factor),
    travel_data: {
      ...DEFAULT_TRAVEL_DATA,
      travel: [{ ...createEmptyTravelGroup(), numVehicles: vehicles, rate: perMile, numMen: men }],
      perDiem: { numDays: 0, dailyRate: num(p.default_per_diem_rate), numMen: men },
      lodging: { numNights: 0, numMen: men, rate: num(p.default_lodging_rate) },
      localMiles: { numDays: 0, numVehicles: vehicles, milesPerDay: num(p.default_local_miles_per_day), rate: perMile },
      airTravel: {
        numMen: num(p.default_flight_number_of_men),
        numTrips: 0,
        numFlights: 0,
        flightRate: num(p.default_flight_rate),
        luggageFees: num(p.default_flight_luggage_fees),
        oneWayHoursInAir: 0,
      },
      rentalCar: { numCars: num(p.default_rental_number_of_cars), numDays: 0, rate: num(p.default_rental_rate) },
    },
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

/** Problems worth telling the person about before they send the estimate. */
function rowWarnings(rows: Row[]): string[] {
  const items = rows.filter((r) => (r.rowType || "item") === "item");
  const out: string[] = [];
  const unnamed = items.filter((r) => !str(r.item) && (num(r.laborHours) > 0 || num(r.materialPrice) > 0)).length;
  if (unnamed) out.push(`${unnamed} row(s) have no name.`);
  const noLabor = items.filter((r) => str(r.item) && num(r.laborMen) * num(r.laborHours) <= 0).map((r) => r.item);
  if (noLabor.length) out.push(`No labor on: ${noLabor.slice(0, 15).join(", ")}${noLabor.length > 15 ? ", ..." : ""}.`);
  const noQty = items.filter((r) => str(r.item) && num(r.quantity) <= 0).length;
  if (noQty) out.push(`${noQty} row(s) have quantity 0 and add nothing.`);
  return out;
}

// ---------------------------------------------------------------- loading

async function loadEstimate(ctx: ToolContext, args: Row): Promise<{ row: Row; others: Row[] }> {
  const cols = "id, opportunity_id, quote_number, status, data, travel_data, created_at, updated_at, user_id";
  const table = () => ctx.supabase.schema("business").from("estimates");
  if (str(args.estimate_id)) {
    const { data, error } = await table().select(cols).eq("id", str(args.estimate_id)).limit(1);
    if (error) fail("Couldn't read the estimate", error);
    if (!data?.length) throw new Error("No estimate with that id, or your account can't see it.");
    return { row: data[0] as Row, others: [] };
  }
  const opp = await resolveOpportunity(ctx, args);
  const { data, error } = await table().select(cols).eq("opportunity_id", opp.id).order("created_at", { ascending: false });
  if (error) fail("Couldn't read the estimates", error);
  const rows = ((data ?? []) as Row[]).sort((a, b) => versionNum(b) - versionNum(a));
  if (!rows.length) throw new Error(`Opportunity ${opp.quote_number} has no estimates yet.`);
  const v = str(args.version).toLowerCase().replace(/^v?/, "v");
  const row = v !== "v" ? rows.find((r) => String(r.quote_number || "").toLowerCase() === v) : rows[0];
  if (!row) throw new Error(`No estimate ${args.version} on opportunity ${opp.quote_number}. It has: ${rows.map((r) => r.quote_number).join(", ")}.`);
  return { row, others: rows.filter((r) => r.id !== row.id) };
}

async function opportunityOf(ctx: ToolContext, id: string): Promise<Row> {
  return await resolveOpportunity(ctx, { opportunity_id: id });
}

async function nextVersion(ctx: ToolContext, opportunityId: string): Promise<string> {
  const { data } = await ctx.supabase.schema("business").from("estimates").select("quote_number").eq("opportunity_id", opportunityId);
  return `v${Math.max(0, ...((data ?? []) as Row[]).map(versionNum)) + 1}`;
}

/** Leaves a note on the opportunity so people see what the AI changed. Never blocks the save. */
async function leaveNote(ctx: ToolContext, opportunityId: string, content: string) {
  await ctx.supabase.schema("business").from("opportunity_notes").insert({
    opportunity_id: opportunityId,
    user_id: ctx.user.id,
    content,
  });
}

/** What get_estimate, create and update all return. */
async function describe(row: Row, opp: Row): Promise<Row> {
  const data = parseJson(row.data);
  const kind = kindOf(data);
  const travel = travelOf(row, data);
  const hs = data.hoursSummary || {};
  const base: Row = {
    estimate_id: row.id,
    version: row.quote_number,
    kind: KIND_LABEL[kind],
    title: data.title || undefined,
    status: row.status ?? null,
    revision: await revisionOf(row),
    opportunity: { quote_number: opp.quote_number, title: opp.title, link: oppLink(opp.id) },
    price: priceOf(data, travel),
  };
  if (kind === "simple") {
    return {
      ...base,
      markup: num(data.simpleMarkupMultiplier) || 1,
      items: data.simpleItems ?? [],
      travel_items: data.simpleTravelItems ?? [],
    };
  }
  return {
    ...base,
    client: data.client || undefined,
    location: data.location || undefined,
    job_description: data.jobDescription || undefined,
    notes: data.notes || undefined,
    due_date: data.dateDue || undefined,
    crew: { techs: num(hs.men), hours_per_day: num(hs.hoursPerDay) },
    hours: {
      sov: Math.round(num(hs.workHours) * 100) / 100,
      non_sov: Math.round(num(hs.nonSovHours) * 100) / 100,
      travel: Math.round(num(hs.travelHours) * 100) / 100,
      days_onsite: num(hs.daysOnsite),
      straight_time: num(hs.straightTimeHours),
      overtime: num(hs.overtimeHours),
      double_time: num(hs.doubleTimeHours),
      ...(data.isManualLaborHours ? { split_set_by_hand: true } : {}),
    },
    rates: data.hourlyRates,
    material_markup: num(data.materialMarkup) || undefined,
    sov_rows: (data.sovItems || []).map(rowOut).filter((r: Row) => r.type || r.item || r.quantity || r.hours || r.material),
    non_sov_rows: (data.nonSovItems || []).map(rowOut),
  };
}

// ------------------------------------------------------------------ schemas

const OPP_PROPS = {
  quote_number: { type: "string", description: "The opportunity's quote number as shown in ampOS, like 4189." },
  opportunity_id: { type: "string", description: "Opportunity UUID, if known instead." },
};

const ROW_FIELDS = {
  item: { type: "string", description: "Row name as it should print, like \"480V Switchboard SWBD-1\"." },
  size: { type: "string", description: "Optional size or rating, like \"2000A\"." },
  quantity: { type: "number", description: "How many. Default 1." },
  techs: { type: "number", description: "Technicians on this row." },
  hours: { type: "number", description: "Hours per unit, per tech. Row labor hours = quantity x techs x hours." },
  material: { type: "number", description: "Material cost per unit, before markup." },
  expense: { type: "number", description: "Expense cost per unit." },
  notes: { type: "string", description: "Internal note: assumptions, drawing sheet, etc." },
  library_item_id: {
    type: "string",
    description: "Fill name, techs, hours, material and notes from this scope library item (assemblies also bring their parts as sub-rows). Fields you give win.",
  },
};

const SUB_ROW_SCHEMA = { type: "object", properties: ROW_FIELDS, additionalProperties: false };

const ROW_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["item", "section", "subsection", "blank"],
      description: "item (default) is a priced row. section and subsection are heading rows (name only). blank is a spacer.",
    },
    ...ROW_FIELDS,
    sub_rows: {
      type: "array",
      items: SUB_ROW_SCHEMA,
      description: "Breakdown rows (SOV only). When given, they set this row's material and hours, like the sheet. Empty list removes them.",
    },
    show_sub_rows_in_proposal: { type: "boolean", description: "List the sub-rows under this row on the proposal letter." },
  },
  additionalProperties: false,
};

const SIMPLE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    item: { type: "string" },
    quantity: { type: "number" },
    price: { type: "number", description: "Price per unit, before the markup multiplier." },
  },
  additionalProperties: false,
};

const SIMPLE_TRAVEL_SCHEMA = {
  type: "object",
  properties: { item: { type: "string" }, amount: { type: "number" } },
  additionalProperties: false,
};

const SHARED_EDIT_PROPS = {
  title: { type: "string", description: "Estimate title shown on its tab." },
  job_description: { type: "string" },
  notes: { type: "string", description: "Internal estimate notes (Advanced)." },
  due_date: { type: "string", description: "Customer due date, YYYY-MM-DD (Advanced)." },
  techs: { type: "number", description: "Crew size (Advanced). Default from company presets." },
  hours_per_day: { type: "number", description: "Hours per day onsite (Advanced). Default from company presets." },
  items: { type: "array", items: SIMPLE_ITEM_SCHEMA, description: "Simple estimates only: the line items." },
  markup: { type: "number", description: "Simple estimates only: markup multiplier, like 1.2. Default 1." },
  travel_items: { type: "array", items: SIMPLE_TRAVEL_SCHEMA, description: "Simple estimates only: travel dollar lines." },
};

const isoDate = (v: unknown): string | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : undefined);

// -------------------------------------------------------------------- tools

export const ESTIMATE_TOOLS: Tool[] = [
  {
    name: "get_estimate",
    title: "Read an estimate",
    description:
      "One estimate: its rows (SOV and non-SOV, with sub-rows), crew, hours, rates and the prices the proposal " +
      "letter would show (NET 30/60/90, same math as the app). Look up by estimate_id, or by the opportunity's " +
      "quote_number plus an optional version like v2 (default: the highest version). Returns revision, " +
      "which update_estimate needs.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        ...OPP_PROPS,
        version: { type: "string", description: "Estimate version on the opportunity, like v2." },
        include_raw: { type: "boolean", description: "Also return the full saved JSON. Large; rarely needed." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      const { row, others } = await loadEstimate(ctx, args);
      const opp = await opportunityOf(ctx, row.opportunity_id);
      const out = await describe(row, opp);
      if (others.length) {
        out.other_versions = others.map((r) => ({ version: r.quote_number, estimate_id: r.id, status: r.status, created_at: r.created_at }));
      }
      if (args.include_raw === true) {
        const raw = JSON.stringify({ data: parseJson(row.data), travel_data: parseJson(row.travel_data) });
        out.raw = raw.length > 100_000 ? raw.slice(0, 100_000) + " ...(cut)" : raw;
      }
      return out;
    },
  },
  {
    name: "search_estimate_library",
    title: "Search the estimating scope library",
    description:
      "The company's standard estimate rows: item name, activity, techs, hours per unit, material cost and notes. " +
      "Assemblies list their parts. Use these numbers (and library_item_id) when building estimate rows instead " +
      "of guessing hours. Every word must match the name, activity or notes.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Words to find, like \"switchgear\" or \"transformer liquid\". Empty lists everything." },
        limit: { type: "number", description: "Default 100, max 400." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      let q = ctx.supabase
        .schema("business")
        .from("estimating_scope_library_items")
        .select("id")
        .eq("is_active", true);
      const words = cleanSearch(args.search).split(" ").filter(Boolean).slice(0, 6);
      for (const w of words) q = q.or(`item_name.ilike.%${w}%,activity.ilike.%${w}%,estimate_notes.ilike.%${w}%`);
      const limit = clampLimit(args.limit, 100, 400);
      const { data, error } = await q.order("item_name").limit(limit);
      if (error) fail("Couldn't search the scope library", error);
      const items = await libraryItems(ctx, ((data ?? []) as Row[]).map((r) => r.id));
      items.sort((a, b) => String(a.item_name).localeCompare(String(b.item_name)));
      const clean = (i: Row) => ({
        library_item_id: i.id,
        item: i.item_name,
        activity: i.activity || undefined,
        techs: num(i.tech_count),
        hours: num(i.hours),
        material: num(i.material_cost) || undefined,
        notes: i.estimate_notes || undefined,
        library_notes: i.library_notes || undefined,
      });
      return {
        count: items.length,
        ...(items.length === limit ? { note: "More items match. Narrow the search." } : {}),
        items: items.map((i) => ({
          ...clean(i),
          ...(i.parts?.length ? { parts: i.parts.map((p: Row) => ({ ...clean(p), quantity: p.default_quantity })) } : {}),
        })),
      };
    },
  },
  {
    name: "create_estimate",
    title: "Create an estimate",
    description:
      "Saves a NEW estimate (next version, like v3) on an opportunity, marked In progress. Never changes " +
      "existing estimates. kind advanced (default) takes sov_rows (+ optional non_sov_rows, techs, hours_per_day); " +
      "kind simple takes items, markup and travel_items. Rates, markup and payment terms come from the company " +
      "presets. Travel starts at zero; the estimator sets it in the app. Before calling: show the person the rows " +
      "and get a yes. Prefer scope library rows (search_estimate_library) for techs and hours. Returns the prices " +
      "and a link.",
    inputSchema: {
      type: "object",
      properties: {
        ...OPP_PROPS,
        kind: { type: "string", enum: ["advanced", "simple"], description: "Default advanced." },
        ...SHARED_EDIT_PROPS,
        sov_rows: { type: "array", items: ROW_SCHEMA, description: "Advanced: the Schedule of Values rows, in order." },
        non_sov_rows: {
          type: "array",
          items: ROW_SCHEMA,
          description:
            "Advanced: fills the default non-SOV rows by name (Reports, Project Management, Shipping/ Postage, " +
            "Equipment Rental, Equipment Purchase); other names are added.",
        },
      },
      additionalProperties: false,
    },
    annotations: CREATES,
    allowed: salesOnly,
    async run(args, ctx) {
      const opp = await resolveOpportunity(ctx, args);
      const kind: Kind = args.kind === "simple" ? "simple" : "advanced";
      const title = str(args.title);
      let data: Row;
      let warnings: string[] = [];

      if (kind === "simple" && (has(args, "sov_rows") || has(args, "non_sov_rows"))) {
        throw new Error("Simple estimates take items, markup and travel_items, not rows.");
      }
      if (kind === "advanced" && (has(args, "items") || has(args, "markup") || has(args, "travel_items"))) {
        throw new Error("Advanced estimates take sov_rows and non_sov_rows. Use kind simple for items.");
      }

      if (kind === "simple") {
        if (!Array.isArray(args.items) || !args.items.length) throw new Error("A simple estimate needs items.");
        if (args.items.length > MAX_ROWS) throw new Error(`Too many items (max ${MAX_ROWS}).`);
        data = simpleData(
          title,
          args.items,
          args.markup,
          Array.isArray(args.travel_items) ? args.travel_items : SIMPLE_DEFAULT_TRAVEL,
        );
      } else {
        if (!Array.isArray(args.sov_rows) || !args.sov_rows.length) throw new Error("An advanced estimate needs sov_rows.");
        const [presetsRes, customerRes, lib] = await Promise.all([
          ctx.supabase.schema("business").from("estimating_presets").select("*").limit(1),
          opp.customer_id
            ? ctx.supabase.schema("common").from("customers").select("name, company_name, address").eq("id", opp.customer_id).limit(1)
            : Promise.resolve({ data: [] as Row[] }),
          loadLibrary(ctx, [args.sov_rows, args.non_sov_rows]),
        ]);
        const customer = ((customerRes as { data: Row[] | null }).data ?? [])[0] ?? {};
        data = advancedData(((presetsRes.data ?? []) as Row[])[0] ?? {}, {
          title: title || opp.title,
          client: customer.company_name || customer.name,
          jobDescription: str(args.job_description) || opp.description,
          location: opp.jobsite_location || customer.address,
          dateDue: isoDate(args.due_date),
          notes: str(args.notes),
          men: args.techs,
          hoursPerDay: args.hours_per_day,
        });
        data.sovItems = rowsIn(args.sov_rows, [], lib, true);
        if (Array.isArray(args.non_sov_rows)) {
          const defaults: Row[] = data.nonSovItems;
          const given = rowsIn(args.non_sov_rows, defaults, lib, false);
          // Keep the sheet's default order: defaults first, extras after.
          data.nonSovItems = [
            ...defaults.map((d) => given.find((g) => nameKey(g.item) === nameKey(d.item)) ?? d),
            ...given.filter((g) => !defaults.some((d) => nameKey(d.item) === nameKey(g.item))),
          ];
        }
        data = recalc(data);
        warnings = rowWarnings(data.sovItems);
        if (!data.sovItems.some((r: Row) => (r.rowType || "item") === "item" && str(r.item))) {
          throw new Error("Add at least one named SOV row.");
        }
      }

      const version = await nextVersion(ctx, opp.id);
      const { data: created, error } = await ctx.supabase
        .schema("business")
        .from("estimates")
        .insert({
          opportunity_id: opp.id,
          data: JSON.stringify(data),
          travel_data: JSON.stringify(data.travel_data ?? {}),
          quote_number: version,
          user_id: ctx.user.id,
          status: "in_progress",
        })
        .select("id, opportunity_id, quote_number, status, data, travel_data, created_at, updated_at")
        .single();
      if (error) fail("Couldn't save the estimate", error);

      const out = await describe(created as Row, opp);
      const rowCount = kind === "simple" ? (data.simpleItems ?? []).length : data.sovItems.length;
      await leaveNote(
        ctx,
        opp.id,
        `Claude (AI connector) created estimate ${version}${title ? ` "${title}"` : ""}: ${KIND_LABEL[kind]}, ` +
          `${rowCount} rows, NET 30 ${dollars(out.price.net30)}. Review before sending.`,
      );
      return { saved: true, ...out, ...(warnings.length ? { warnings } : {}) };
    },
  },
  {
    name: "update_estimate",
    title: "Edit an estimate",
    description:
      "Changes an existing estimate. Read it with get_estimate first and pass its revision; the save is refused " +
      "if anyone saved the estimate since. sov_rows / non_sov_rows (Advanced and Guided) and items / " +
      "travel_items (Simple) REPLACE the whole list: send every row to keep, in order. Rows matched by name keep " +
      "their other settings. Fields you leave out stay as they are. Rates, markup, travel and payment terms are " +
      "not changed here. Before calling: show the person what will change and get a yes.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        revision: { type: "string", description: "revision from get_estimate, exactly as returned." },
        ...SHARED_EDIT_PROPS,
        sov_rows: { type: "array", items: ROW_SCHEMA, description: "Advanced/Guided: the full new SOV list." },
        non_sov_rows: { type: "array", items: ROW_SCHEMA, description: "Advanced/Guided: the full new non-SOV list." },
      },
      required: ["estimate_id", "revision"],
      additionalProperties: false,
    },
    annotations: EDITS,
    allowed: salesOnly,
    async run(args, ctx) {
      const { row } = await loadEstimate(ctx, { estimate_id: args.estimate_id });
      if (str(args.revision) !== (await revisionOf(row))) {
        throw new Error("This estimate was saved since you read it. Read it again with get_estimate, then retry.");
      }
      const opp = await opportunityOf(ctx, row.opportunity_id);
      const before = await describe(row, opp);
      const old = parseJson(row.data);
      const kind = kindOf(old);
      const warnings: string[] = [];
      let data: Row;

      if (kind === "simple") {
        if (has(args, "sov_rows") || has(args, "non_sov_rows")) {
          throw new Error("This is a Simple estimate: change items, markup or travel_items instead of rows.");
        }
        if (Array.isArray(args.items) && args.items.length > MAX_ROWS) throw new Error(`Too many items (max ${MAX_ROWS}).`);
        data = simpleData(
          has(args, "title") ? str(args.title) : old.title || "",
          Array.isArray(args.items) ? args.items : old.simpleItems ?? [],
          has(args, "markup") ? args.markup : old.simpleMarkupMultiplier,
          Array.isArray(args.travel_items) ? args.travel_items : old.simpleTravelItems ?? [],
        );
      } else {
        if (has(args, "items") || has(args, "markup") || has(args, "travel_items")) {
          throw new Error(`This is an ${KIND_LABEL[kind]} estimate: change sov_rows or non_sov_rows instead.`);
        }
        const lib = await loadLibrary(ctx, [args.sov_rows, args.non_sov_rows]);
        data = { ...old };
        if (has(args, "title")) data.title = str(args.title);
        if (has(args, "job_description")) data.jobDescription = str(args.job_description);
        if (has(args, "notes")) data.notes = str(args.notes);
        if (has(args, "due_date")) data.dateDue = isoDate(args.due_date) ?? "";
        const hs = { ...(old.hoursSummary || {}) };
        if (has(args, "techs")) hs.men = positiveOr(args.techs, num(hs.men) || D.default_number_of_men);
        if (has(args, "hours_per_day")) hs.hoursPerDay = positiveOr(args.hours_per_day, num(hs.hoursPerDay) || D.default_hours_per_day);
        data.hoursSummary = hs;
        if (has(args, "sov_rows")) data.sovItems = rowsIn(args.sov_rows, old.sovItems || [], lib, true);
        if (has(args, "non_sov_rows")) data.nonSovItems = rowsIn(args.non_sov_rows, old.nonSovItems || [], lib, false);
        data = recalc(data);
        warnings.push(...rowWarnings(data.sovItems));
        if (data.isManualLaborHours) {
          warnings.push("Straight/overtime/double-time hours were set by hand on this estimate and were not changed. Check them in the app.");
        }
      }
      if (row.status === "sent" || row.status === "approved_to_send") {
        warnings.push(`This estimate was already marked ${row.status === "sent" ? "Sent" : "Approved to send"}.`);
      }

      const { data: saved, error } = await ctx.supabase
        .schema("business")
        .from("estimates")
        .update({
          data: JSON.stringify(data),
          travel_data: JSON.stringify(data.travel_data ?? parseJson(row.travel_data)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("updated_at", row.updated_at)
        .select("id, opportunity_id, quote_number, status, data, travel_data, created_at, updated_at");
      if (error) fail("Couldn't save the estimate", error);
      if (!saved?.length) throw new Error("Someone saved this estimate at the same moment. Read it again, then retry.");

      const after = await describe(saved[0] as Row, opp);
      const rowsBefore = kind === "simple" ? (before.items ?? []).length : (old.sovItems ?? []).length;
      const rowsAfter = kind === "simple" ? (data.simpleItems ?? []).length : (data.sovItems ?? []).length;
      await leaveNote(
        ctx,
        opp.id,
        `Claude (AI connector) edited estimate ${row.quote_number}: rows ${rowsBefore} -> ${rowsAfter}, ` +
          `NET 30 ${dollars(before.price.net30)} -> ${dollars(after.price.net30)}.`,
      );
      return {
        saved: true,
        net30_before: before.price.net30,
        ...after,
        ...(warnings.length ? { warnings } : {}),
      };
    },
  },
];
