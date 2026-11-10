import { Fragment, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import {
  calculateLaborUnit,
  computeMaterialExpenseBase,
  computeTravelLaborCost,
  computeWorkLaborCost,
  getPricingFactors,
  sovPricePerLaborHour,
  toPriceNumber,
} from "@/lib/estimatePricing";
import { allocateDollars } from "@/lib/estimateRedistribution";
import { computeTravelTotals, createEmptyTravelGroup } from "@/lib/travelExpenses";
import EstimateNumberInput from "../EstimateNumberInput";
import ScopeLibraryPickerModal from "../ScopeLibraryPickerModal";
import {
  FIELD_LABEL_CLS,
  INPUT_CLS,
  SectionNav,
  calcField,
  fmtMoney,
  numField,
  sectionTitle,
  totalField,
} from "../estimateFieldKit";
import {
  DEFAULT_AUTO_HOURS_PCT,
  createLine,
  getEstimatePrice,
  laborSplitTotal,
  parseEstimateData,
  travelSplitTotal,
} from "./fullEstimateData";

interface StepProps {
  data: any;
  update: (change: (prev: any) => any) => void;
}

const TH =
  "text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 font-medium px-2 py-1";
const TD = "px-2 py-1 text-sm";
const NUM_INPUT = `${INPUT_CLS} text-right`;
const ROW_BORDER = "border-b border-neutral-100 dark:border-dark-200";
const hrs = (n: unknown) => (Number(n) || 0).toFixed(1);

const textField = (
  label: string,
  value: string,
  onChange: (v: string) => void,
  options: { required?: boolean; type?: string; hint?: string } = {},
) => (
  <label className="flex flex-col min-w-0">
    <span className={FIELD_LABEL_CLS}>
      {label}
      {options.required && <span className="text-brand"> *</span>}
    </span>
    <input
      type={options.type || "text"}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
    />
    {options.hint && (
      <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {options.hint}
      </span>
    )}
  </label>
);

const patchRow =
  (update: StepProps["update"], key: "sovItems" | "nonSovItems") =>
  (index: number, patch: any) =>
    update((prev) => ({
      ...prev,
      [key]: prev[key].map((row: any, i: number) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));

const removeRow =
  (update: StepProps["update"], key: "sovItems" | "nonSovItems") =>
  (index: number) =>
    update((prev) => ({
      ...prev,
      [key]: prev[key].filter((_: any, i: number) => i !== index),
    }));

const addRow = (
  update: StepProps["update"],
  key: "sovItems" | "nonSovItems",
  row: any,
) => update((prev) => ({ ...prev, [key]: [...prev[key], row] }));

const NOTE_KINDS = ["Conversation", "Assumption", "Exclusion"];

export function JobDetailsStep({ data, update }: StepProps) {
  const set = (field: string) => (value: string) =>
    update((prev) => ({ ...prev, [field]: value }));
  const notes: any[] = data.scopeNotes || [];
  const setNotes = (next: any[]) =>
    update((prev) => ({ ...prev, scopeNotes: next }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
      <div>
        {sectionTitle("Job details")}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {textField("Estimate title", data.title, set("title"))}
          {textField("Customer", data.client, set("client"), { required: true })}
          {textField("Site", data.location, set("location"), { required: true })}
          {textField("PO number", data.poNumber, set("poNumber"))}
          {textField("Customer due date", data.dateDue, set("dateDue"), {
            required: true,
            type: "date",
          })}
          {textField(
            "Internal due date",
            data.internalDueDate,
            set("internalDueDate"),
            {
              required: true,
              type: "date",
              hint: "A few days early, so there is time for review.",
            },
          )}
          {textField(
            "Period of performance",
            data.periodOfPerformance,
            set("periodOfPerformance"),
          )}
          {textField(
            "Estimated start",
            data.estimatedStartDate,
            set("estimatedStartDate"),
            { type: "date" },
          )}
        </div>
        <label className="flex flex-col mt-3">
          <span className={FIELD_LABEL_CLS}>Job description</span>
          <textarea
            rows={3}
            value={data.jobDescription || ""}
            onChange={(e) => set("jobDescription")(e.target.value)}
            className={INPUT_CLS}
          />
        </label>
      </div>

      <div>
        {sectionTitle("Scope notes", "saved with the estimate for reviewers")}
        <div className="space-y-2">
          {notes.map((note, i) => (
            <div
              key={i}
              className="border border-neutral-200 dark:border-dark-200 p-2 space-y-2"
            >
              <div className="flex items-center gap-2">
                <select
                  value={note.kind}
                  onChange={(e) =>
                    setNotes(
                      notes.map((n, idx) =>
                        idx === i ? { ...n, kind: e.target.value } : n,
                      ),
                    )
                  }
                  className={INPUT_CLS}
                >
                  {NOTE_KINDS.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Remove note"
                  className="text-neutral-400 hover:text-red-600"
                  onClick={() => setNotes(notes.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <textarea
                rows={2}
                value={note.text}
                onChange={(e) =>
                  setNotes(
                    notes.map((n, idx) =>
                      idx === i ? { ...n, text: e.target.value } : n,
                    ),
                  )
                }
                className={INPUT_CLS}
              />
            </div>
          ))}
        </div>
        <Button
          className="mt-2"
          variant="outline"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() =>
            setNotes([...notes, { kind: NOTE_KINDS[0], text: "" }])
          }
        >
          Add note
        </Button>
      </div>
    </div>
  );
}

export function SovStep({ data, update }: StepProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const rows: any[] = data.sovItems;
  const patch = patchRow(update, "sovItems");
  const remove = removeRow(update, "sovItems");
  const hs = data.hoursSummary;
  const selectedRow =
    selected != null && rows[selected]?.rowType === "item"
      ? rows[selected]
      : null;

  const setCrew = (field: "men" | "hoursPerDay") => (value: number) =>
    update((prev) => ({
      ...prev,
      hoursSummary: { ...prev.hoursSummary, [field]: value },
    }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4 items-start">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-dark-200">
              <th className={TH}>Equipment</th>
              <th className={`${TH} w-28`}>Size</th>
              <th className={`${TH} w-20 text-right`}>Qty</th>
              <th className={`${TH} w-20 text-right`}>Men</th>
              <th className={`${TH} w-24 text-right`}>Hrs each</th>
              <th className={`${TH} w-24 text-right`}>Total hrs</th>
              <th className={`${TH} w-28 text-right`}>Material each</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.rowType !== "item" ? (
                <tr
                  key={i}
                  className="bg-neutral-50 dark:bg-dark-100 border-b border-neutral-200 dark:border-dark-200"
                >
                  <td colSpan={7} className={TD}>
                    <input
                      className={`${INPUT_CLS} font-semibold`}
                      value={row.item}
                      placeholder="Building or area"
                      onChange={(e) => patch(i, { item: e.target.value })}
                    />
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      title="Remove section"
                      className="text-neutral-400 hover:text-red-600"
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ) : (
                <tr
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`${ROW_BORDER} ${
                    selected === i ? "bg-brand/10" : ""
                  }`}
                >
                  <td className={TD}>
                    <div className="flex items-center gap-1">
                      <input
                        className={INPUT_CLS}
                        value={row.item}
                        placeholder="Equipment"
                        onChange={(e) => patch(i, { item: e.target.value })}
                      />
                      <button
                        type="button"
                        title="Search scope item library"
                        className="shrink-0 p-1 text-neutral-400 hover:text-brand"
                        onClick={() => setPickerIndex(i)}
                      >
                        <Search size={16} />
                      </button>
                    </div>
                  </td>
                  <td className={TD}>
                    <input
                      className={INPUT_CLS}
                      value={row.size || ""}
                      placeholder="e.g. 1,500 kVA"
                      onChange={(e) => patch(i, { size: e.target.value })}
                    />
                  </td>
                  <td className={TD}>
                    <EstimateNumberInput
                      className={NUM_INPUT}
                      value={row.quantity}
                      onValueChange={(v) => patch(i, { quantity: v })}
                    />
                  </td>
                  <td className={TD}>
                    <EstimateNumberInput
                      className={NUM_INPUT}
                      value={row.laborMen}
                      onValueChange={(v) => patch(i, { laborMen: v })}
                    />
                  </td>
                  <td className={TD}>
                    <EstimateNumberInput
                      className={NUM_INPUT}
                      value={row.laborHours}
                      onValueChange={(v) => patch(i, { laborHours: v })}
                    />
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {hrs(
                      calculateLaborUnit(row.laborMen, row.laborHours) *
                        toPriceNumber(row.quantity),
                    )}
                  </td>
                  <td className={TD}>
                    <EstimateNumberInput
                      className={NUM_INPUT}
                      value={row.materialPrice}
                      onValueChange={(v) => patch(i, { materialPrice: v })}
                    />
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      title="Remove row"
                      className="text-neutral-400 hover:text-red-600"
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => addRow(update, "sovItems", createLine())}
          >
            Add equipment
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() =>
              addRow(
                update,
                "sovItems",
                createLine({ rowType: "section", quantity: 0 }),
              )
            }
          >
            Add section
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {calcField("SOV hours", hrs(hs.workHours))}
          <label className="flex flex-col min-w-0">
            <span className={FIELD_LABEL_CLS}>
              Men <span className="text-brand">*</span>
            </span>
            <EstimateNumberInput
              className={NUM_INPUT}
              value={hs.men}
              onValueChange={setCrew("men")}
            />
          </label>
          <label className="flex flex-col min-w-0">
            <span className={FIELD_LABEL_CLS}>
              Hours per day <span className="text-brand">*</span>
            </span>
            <EstimateNumberInput
              className={NUM_INPUT}
              value={hs.hoursPerDay}
              onValueChange={setCrew("hoursPerDay")}
            />
          </label>
          {totalField("Days onsite", hrs(hs.daysOnsite))}
        </div>
      </div>

      <div className="border border-neutral-200 dark:border-dark-200 bg-neutral-50 dark:bg-dark-100 p-3">
        <div className={FIELD_LABEL_CLS}>Side notes</div>
        {selectedRow ? (
          <>
            <div className="text-sm font-semibold mb-2">
              {selectedRow.item || "New row"}
            </div>
            <textarea
              rows={7}
              className={INPUT_CLS}
              value={selectedRow.notes || ""}
              placeholder="Notes for this row"
              onChange={(e) => patch(selected!, { notes: e.target.value })}
            />
          </>
        ) : (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Click a row to see its notes.
          </div>
        )}
      </div>

      <ScopeLibraryPickerModal
        open={pickerIndex != null}
        excludeAssemblies
        onClose={() => setPickerIndex(null)}
        onSelect={(libraryItem) => {
          if (pickerIndex == null) return;
          const row = rows[pickerIndex];
          patch(pickerIndex, {
            item: libraryItem.item_name,
            presetId: libraryItem.id,
            quantity: toPriceNumber(row?.quantity) > 0 ? row.quantity : 1,
            materialPrice: Number(libraryItem.material_cost) || 0,
            laborMen: Number(libraryItem.tech_count) || 0,
            laborHours: Number(libraryItem.hours) || 0,
            notes: libraryItem.estimate_notes || "",
          });
          setSelected(pickerIndex);
          setPickerIndex(null);
        }}
      />
    </div>
  );
}

export function NonSovStep({ data, update }: StepProps) {
  const rows: any[] = data.nonSovItems;
  const patch = patchRow(update, "nonSovItems");
  const remove = removeRow(update, "nonSovItems");
  const cv = data.calculatedValues;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4 items-start">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse min-w-[680px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-dark-200">
              <th className={TH}>Item</th>
              <th className={`${TH} w-44`}>Basis</th>
              <th className={`${TH} w-20 text-right`}>Qty</th>
              <th className={`${TH} w-20 text-right`}>Men</th>
              <th className={`${TH} w-24 text-right`}>Hrs each</th>
              <th className={`${TH} w-28 text-right`}>Material each</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={ROW_BORDER}>
                <td className={TD}>
                  <input
                    className={INPUT_CLS}
                    value={row.item}
                    placeholder="Item"
                    onChange={(e) => patch(i, { item: e.target.value })}
                  />
                </td>
                <td className={`${TD} text-xs`}>
                  {row.auto ? (
                    <span className="text-blue-800 dark:text-blue-200">
                      Auto: {row.auto.pct}% of SOV hours
                    </span>
                  ) : row.manualFrom ? (
                    <button
                      type="button"
                      className="text-brand hover:underline"
                      onClick={() =>
                        patch(i, {
                          auto: row.manualFrom,
                          manualFrom: null,
                          laborMen: 1,
                        })
                      }
                    >
                      Reset to auto
                    </button>
                  ) : (
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Manual
                    </span>
                  )}
                </td>
                <td className={TD}>
                  <EstimateNumberInput
                    className={NUM_INPUT}
                    value={row.quantity}
                    disabled={!!row.auto}
                    onValueChange={(v) => patch(i, { quantity: v })}
                  />
                </td>
                <td className={TD}>
                  <EstimateNumberInput
                    className={NUM_INPUT}
                    value={row.laborMen}
                    onValueChange={(v) => patch(i, { laborMen: v })}
                  />
                </td>
                <td className={TD}>
                  <EstimateNumberInput
                    className={NUM_INPUT}
                    value={row.laborHours}
                    onValueChange={(v) =>
                      patch(
                        i,
                        row.auto
                          ? { laborHours: v, auto: null, manualFrom: row.auto }
                          : { laborHours: v },
                      )
                    }
                  />
                </td>
                <td className={TD}>
                  <EstimateNumberInput
                    className={NUM_INPUT}
                    value={row.materialPrice}
                    onValueChange={(v) => patch(i, { materialPrice: v })}
                  />
                </td>
                <td className="px-1 text-center">
                  <button
                    type="button"
                    title="Remove row"
                    className="text-neutral-400 hover:text-red-600"
                    onClick={() => remove(i)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => addRow(update, "nonSovItems", createLine())}
          >
            Add item
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {calcField("Non-SOV hours", hrs(data.hoursSummary.nonSovHours))}
        {calcField("Non-SOV material", fmtMoney(cv.nonSovMaterial))}
        <div className="border-l-2 border-brand bg-brand/10 p-3 text-xs text-neutral-700 dark:text-neutral-200">
          Reports and Project Management default to {DEFAULT_AUTO_HOURS_PCT}% of
          SOV hours and follow SOV changes. Type over the hours to set them by
          hand. Rental costs go in Material.
        </div>
      </div>
    </div>
  );
}

const travelNav = [
  { key: "trips", label: "Trips" },
  { key: "perDiem", label: "Per diem" },
  { key: "lodging", label: "Lodging" },
  { key: "localMiles", label: "Local miles" },
  { key: "airTravel", label: "Flights" },
  { key: "rentalCar", label: "Rental car" },
] as const;

export function TravelStep({ data, update }: StepProps) {
  const [active, setActive] =
    useState<(typeof travelNav)[number]["key"]>("trips");
  const td = data.travel_data;
  const totals = useMemo(() => computeTravelTotals(td), [td]);

  const setSection = (section: string, patch: any) =>
    update((prev) => ({
      ...prev,
      travel_data: {
        ...prev.travel_data,
        [section]: { ...prev.travel_data[section], ...patch },
      },
    }));
  const setTrips = (next: any[]) =>
    update((prev) => ({
      ...prev,
      travel_data: { ...prev.travel_data, travel: next },
    }));
  const field = (section: string, key: string, label: string, step?: number) =>
    numField(
      label,
      td[section][key],
      (v) => setSection(section, { [key]: toPriceNumber(v) }),
      step,
    );

  return (
    <div className="space-y-4">
      <SectionNav
        items={travelNav.map((n) => ({
          key: n.key,
          label: n.label,
          badge:
            n.key === "trips"
              ? fmtMoney(totals.travel.cost)
              : n.key === "airTravel"
                ? fmtMoney(totals.airTravel.flightTotal)
                : fmtMoney((totals as any)[n.key].total),
        }))}
        active={active}
        onChange={setActive}
      >
        {active === "trips" && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-dark-200">
                  <th className={TH}>Starting point</th>
                  <th className={`${TH} w-20 text-right`}>Round trips</th>
                  <th className={`${TH} w-24 text-right`}>One-way mi</th>
                  <th className={`${TH} w-20 text-right`}>Vehicles</th>
                  <th className={`${TH} w-20 text-right`}>Men</th>
                  <th className={`${TH} w-20 text-right`}>$ / mi</th>
                  <th className={`${TH} w-24 text-right`}>Cost</th>
                  <th className={`${TH} w-20 text-right`}>Drive hrs</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {td.travel.map((trip: any, i: number) => {
                  const setTrip = (patch: any) =>
                    setTrips(
                      td.travel.map((t: any, idx: number) =>
                        idx === i ? { ...t, ...patch } : t,
                      ),
                    );
                  return (
                    <tr key={i} className={ROW_BORDER}>
                      <td className={TD}>
                        <input
                          className={INPUT_CLS}
                          value={trip.from || ""}
                          placeholder="e.g. Houston shop"
                          onChange={(e) => setTrip({ from: e.target.value })}
                        />
                      </td>
                      {(
                        ["trips", "oneWayMiles", "numVehicles", "numMen", "rate"] as const
                      ).map((key) => (
                        <td key={key} className={TD}>
                          <EstimateNumberInput
                            className={NUM_INPUT}
                            value={trip[key]}
                            onValueChange={(v) => setTrip({ [key]: v })}
                          />
                        </td>
                      ))}
                      <td className={`${TD} text-right tabular-nums`}>
                        {fmtMoney(totals.groups[i]?.vehicleCost)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {hrs(totals.groups[i]?.groupHours)}
                      </td>
                      <td className="px-1 text-center">
                        {td.travel.length > 1 && (
                          <button
                            type="button"
                            title="Remove trip"
                            className="text-neutral-400 hover:text-red-600"
                            onClick={() =>
                              setTrips(
                                td.travel.filter(
                                  (_: any, idx: number) => idx !== i,
                                ),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() =>
                setTrips([
                  ...td.travel,
                  { ...createEmptyTravelGroup(), rate: td.travel[0]?.rate },
                ])
              }
            >
              Add trip
            </Button>
          </div>
        )}
        {active === "perDiem" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {field("perDiem", "numMen", "Men")}
            {field("perDiem", "numDays", "Days")}
            {field("perDiem", "dailyRate", "$ per day", 0.01)}
            {totalField("Total", fmtMoney(totals.perDiem.total))}
          </div>
        )}
        {active === "lodging" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {field("lodging", "numMen", "Men")}
            {field("lodging", "numNights", "Nights")}
            {field("lodging", "rate", "$ per night", 0.01)}
            {totalField("Total", fmtMoney(totals.lodging.total))}
          </div>
        )}
        {active === "localMiles" && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {field("localMiles", "numDays", "Days")}
            {field("localMiles", "numVehicles", "Vehicles")}
            {field("localMiles", "milesPerDay", "Miles per day")}
            {field("localMiles", "rate", "$ / mi", 0.01)}
            {totalField("Total", fmtMoney(totals.localMiles.total))}
          </div>
        )}
        {active === "airTravel" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {field("airTravel", "numMen", "Men")}
            {field("airTravel", "numFlights", "Flights")}
            {field("airTravel", "numTrips", "Round trips")}
            {field("airTravel", "oneWayHoursInAir", "One-way hours", 0.25)}
            {field("airTravel", "flightRate", "$ per flight", 0.01)}
            {field("airTravel", "luggageFees", "Luggage fees", 0.01)}
            {calcField("Air labor hours", hrs(totals.airTravel.hours))}
            {totalField("Total", fmtMoney(totals.airTravel.flightTotal))}
          </div>
        )}
        {active === "rentalCar" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {field("rentalCar", "numCars", "Cars")}
            {field("rentalCar", "numDays", "Days")}
            {field("rentalCar", "rate", "$ per day", 0.01)}
            {totalField("Total", fmtMoney(totals.rentalCar.total))}
          </div>
        )}
      </SectionNav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {calcField(
          "Travel labor hours (billed as labor on Pricing)",
          hrs(totals.laborHours),
        )}
        {totalField("Travel expense total", fmtMoney(totals.nonLaborCost))}
      </div>
    </div>
  );
}

const pricingNav = [
  { key: "hours", label: "Hours summary" },
  { key: "labor", label: "Labor tracking" },
  { key: "travel", label: "Travel labor" },
  { key: "rates", label: "Hourly rates" },
  { key: "materials", label: "Materials" },
  { key: "summary", label: "Summary" },
] as const;

function SplitTable({
  title,
  fields,
  expected,
  total,
  isManual,
  onChange,
  onReset,
  hs,
}: {
  title: string;
  fields: [string, string, string];
  expected: number;
  total: number;
  isManual: boolean;
  onChange: (field: string, value: number) => void;
  onReset: () => void;
  hs: any;
}) {
  const matches = Math.abs(expected - total) < 0.01;
  return (
    <div>
      {sectionTitle(title, `${hrs(expected)} hours to split`)}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["Regular (RT)", "Overtime (OT)", "Double time (DT)"] as const).map(
          (label, i) => (
            <label key={label} className="flex flex-col min-w-0">
              <span className={FIELD_LABEL_CLS}>{label}</span>
              <EstimateNumberInput
                className={NUM_INPUT}
                value={hs[fields[i]]}
                onValueChange={(v) => onChange(fields[i], v)}
              />
            </label>
          ),
        )}
        {totalField("Split total", hrs(total))}
      </div>
      <div
        className={`mt-2 text-xs ${
          matches
            ? "text-green-700 dark:text-green-300"
            : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {matches
          ? "Split matches the hours."
          : `Off by ${hrs(Math.abs(expected - total))} hours.`}
        {isManual && (
          <button
            type="button"
            className="ml-3 text-brand hover:underline"
            onClick={onReset}
          >
            Reset to auto
          </button>
        )}
      </div>
    </div>
  );
}

export function PricingStep({ data, update }: StepProps) {
  const [active, setActive] =
    useState<(typeof pricingNav)[number]["key"]>("hours");
  const hs = data.hoursSummary;
  const cv = data.calculatedValues;
  const rates = data.hourlyRates;
  const { taxFactor } = getPricingFactors(!!data.netTermsOnly);
  const price = getEstimatePrice(data);
  const materialBase = computeMaterialExpenseBase(
    cv,
    data.materialMarkup,
    taxFactor,
  );
  const workHours =
    toPriceNumber(hs.workHours) + toPriceNumber(hs.nonSovHours);

  const setHours = (flag: string) => (field: string, value: number) =>
    update((prev) => ({
      ...prev,
      [flag]: true,
      hoursSummary: { ...prev.hoursSummary, [field]: value },
    }));
  const set = (field: string, value: any) =>
    update((prev) => ({ ...prev, [field]: value }));

  return (
    <SectionNav
      items={pricingNav.map((n) => ({ key: n.key, label: n.label }))}
      active={active}
      onChange={setActive}
    >
      {active === "hours" && (
        <div>
          {sectionTitle("Hours summary", "read only, change on each page")}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {calcField("SOV", hrs(hs.workHours))}
            {calcField("Non-SOV", hrs(hs.nonSovHours))}
            {calcField("Travel", hrs(hs.travelHours))}
            {totalField("Total", hrs(hs.totalHours))}
          </div>
        </div>
      )}
      {active === "labor" && (
        <SplitTable
          title="Labor tracking"
          fields={["straightTimeHours", "overtimeHours", "doubleTimeHours"]}
          expected={workHours}
          total={laborSplitTotal(hs)}
          isManual={!!data.isManualLaborHours}
          onChange={setHours("isManualLaborHours")}
          onReset={() => set("isManualLaborHours", false)}
          hs={hs}
        />
      )}
      {active === "travel" && (
        <SplitTable
          title="Travel labor"
          fields={[
            "travelStraightTimeHours",
            "travelOvertimeHours",
            "travelDoubleTimeHours",
          ]}
          expected={toPriceNumber(hs.travelHours)}
          total={travelSplitTotal(hs)}
          isManual={!!data.isManualTravelLaborHours}
          onChange={setHours("isManualTravelLaborHours")}
          onReset={() => set("isManualTravelLaborHours", false)}
          hs={hs}
        />
      )}
      {active === "rates" && (
        <div>
          {sectionTitle("Hourly rates")}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                ["straightTime", "Regular (RT)"],
                ["overtime", "Overtime (OT)"],
                ["doubleTime", "Double time (DT)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                {numField(
                  label,
                  rates[key],
                  (v) =>
                    set("hourlyRates", { ...rates, [key]: toPriceNumber(v) }),
                  0.01,
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {active === "materials" && (
        <div>
          {sectionTitle("Materials", "rentals are included here")}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {calcField("Material total", fmtMoney(cv.totalMaterial))}
            {numField(
              "Material markup",
              data.materialMarkup,
              (v) => set("materialMarkup", toPriceNumber(v)),
              0.01,
            )}
            {calcField("Tax factor", String(taxFactor))}
            {totalField("Material with markup", fmtMoney(materialBase))}
          </div>
        </div>
      )}
      {active === "summary" && (
        <div className="space-y-4">
          {sectionTitle("Price summary")}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {calcField("Work labor", fmtMoney(computeWorkLaborCost(hs, rates)))}
            {calcField(
              "Travel labor",
              fmtMoney(computeTravelLaborCost(hs, rates)),
            )}
            {calcField("Travel expense", fmtMoney(price.travelNonLabor))}
            {calcField("Materials", fmtMoney(materialBase))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            {numField(
              "Final markup",
              data.finalMarkupMultiplier,
              (v) => set("finalMarkupMultiplier", toPriceNumber(v)),
              0.01,
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!data.netTermsOnly}
                onChange={(e) => set("netTermsOnly", e.target.checked)}
                className="rounded-none"
              />
              Net terms only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!data.manualPriceOverride}
                onChange={(e) => set("manualPriceOverride", e.target.checked)}
                className="rounded-none"
              />
              Manual price
            </label>
            {data.manualPriceOverride &&
              numField(
                "Manual FINAL",
                data.manualPriceValue,
                (v) => set("manualPriceValue", toPriceNumber(v)),
                1,
              )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {totalField("FINAL (M-F)", fmtMoney(price.finalValue))}
            {calcField("Mobilization", fmtMoney(price.mobilization))}
          </div>
        </div>
      )}
    </SectionNav>
  );
}

export function SummaryStep({
  data,
  update,
  opportunityId,
  currentId,
  onGenerateLetter,
}: StepProps & {
  opportunityId: string;
  currentId: string | null;
  onGenerateLetter?: () => void;
}) {
  const [tracks, setTracks] = useState<any[]>([]);
  const price = getEstimatePrice(data);
  const perHour = sovPricePerLaborHour(data, data.travel_data);
  const billing: any[] = data.billingSchedule || [];
  const billingPct = billing.reduce((sum, m) => sum + toPriceNumber(m.pct), 0);
  const billingAmounts = allocateDollars(
    (price.finalValue * billingPct) / 100,
    billing.map((m) => toPriceNumber(m.pct)),
  );
  const setBilling = (next: any[]) =>
    update((prev) => ({ ...prev, billingSchedule: next }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, data, travel_data, quote_number")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Error loading estimates to compare:", error);
        return;
      }
      if (cancelled) return;
      setTracks(
        (rows || []).map((row: any) => {
          const saved = parseEstimateData(row.data);
          return {
            id: row.id,
            name: saved.title || row.quote_number || "Estimate",
            price: getEstimatePrice({
              ...saved,
              travel_data: parseEstimateData(row.travel_data),
            }).finalValue,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [opportunityId, currentId]);

  const groups = useMemo(() => {
    const out: { title: string; rows: any[] }[] = [];
    (data.sovItems || []).forEach((row: any) => {
      if (row.rowType === "section") {
        out.push({ title: row.item, rows: [] });
      } else if (row.rowType === "item" && String(row.item || "").trim()) {
        if (out.length === 0) out.push({ title: "", rows: [] });
        out[out.length - 1].rows.push(row);
      }
    });
    return out.filter((group) => group.rows.length > 0);
  }, [data.sovItems]);

  const unitPrice = (row: any) =>
    perHour * calculateLaborUnit(row.laborMen, row.laborHours);

  const compared = tracks.map((track) =>
    track.id === currentId ? { ...track, price: price.finalValue } : track,
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6 items-start">
      <div className="min-w-0 overflow-x-auto">
        {sectionTitle("Schedule of values", "what the customer sees")}
        <table className="w-full border-collapse min-w-[520px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-dark-200">
              <th className={TH}>Item</th>
              <th className={`${TH} w-16 text-right`}>Qty</th>
              <th className={`${TH} w-28 text-right`}>Unit price</th>
              <th className={`${TH} w-28 text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, g) => (
              <Fragment key={g}>
                {group.title && (
                  <tr className="bg-neutral-50 dark:bg-dark-100">
                    <td colSpan={4} className={`${TD} font-semibold`}>
                      {group.title}
                    </td>
                  </tr>
                )}
                {group.rows.map((row, i) => (
                  <tr key={i} className={ROW_BORDER}>
                    <td className={TD}>
                      {row.item}
                      {row.size ? `, ${row.size}` : ""}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {row.quantity}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {fmtMoney(unitPrice(row))}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {fmtMoney(unitPrice(row) * toPriceNumber(row.quantity))}
                    </td>
                  </tr>
                ))}
                {group.title && (
                  <tr className={ROW_BORDER}>
                    <td colSpan={3} className={`${TD} font-medium`}>
                      {group.title} subtotal
                    </td>
                    <td className={`${TD} text-right font-medium tabular-nums`}>
                      {fmtMoney(
                        group.rows.reduce(
                          (sum, row) =>
                            sum + unitPrice(row) * toPriceNumber(row.quantity),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            <tr>
              <td colSpan={3} className={`${TD} font-bold`}>
                Total
              </td>
              <td className={`${TD} text-right font-bold tabular-nums`}>
                {fmtMoney(price.finalValue)}
              </td>
            </tr>
          </tbody>
        </table>
        {price.mobilization > 0 && (
          <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Mobilization of {fmtMoney(price.mobilization)} is shown on the
            letter proposal.
          </div>
        )}
      </div>

      <div className="space-y-6 min-w-0">
        <div>
          {sectionTitle("Progress billing", "only where it applies")}
          {billing.map((milestone, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                className={INPUT_CLS}
                value={milestone.label}
                placeholder="Milestone"
                onChange={(e) =>
                  setBilling(
                    billing.map((m, idx) =>
                      idx === i ? { ...m, label: e.target.value } : m,
                    ),
                  )
                }
              />
              <div className="w-20 shrink-0">
                <EstimateNumberInput
                  className={NUM_INPUT}
                  value={milestone.pct}
                  aria-label="Percent"
                  onValueChange={(v) =>
                    setBilling(
                      billing.map((m, idx) =>
                        idx === i ? { ...m, pct: v } : m,
                      ),
                    )
                  }
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                {fmtMoney(billingAmounts[i])}
              </span>
              <button
                type="button"
                title="Remove milestone"
                className="text-neutral-400 hover:text-red-600"
                onClick={() =>
                  setBilling(billing.filter((_, idx) => idx !== i))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setBilling([...billing, { label: "", pct: 0 }])}
            >
              Add milestone
            </Button>
            {billing.length > 0 && (
              <span
                className={`text-xs ${
                  Math.abs(billingPct - 100) < 0.01
                    ? "text-green-700 dark:text-green-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {billingPct}% of 100%
              </span>
            )}
          </div>
        </div>

        {compared.length > 1 && (
          <div>
            {sectionTitle("Estimates side by side")}
            <table className="w-full border-collapse">
              <tbody>
                {compared.map((track) => (
                  <tr key={track.id} className={ROW_BORDER}>
                    <td className={TD}>
                      {track.name}
                      {track.id === currentId && (
                        <span className="ml-2 text-xs text-brand">this one</span>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {fmtMoney(track.price)}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums text-neutral-500 dark:text-neutral-400`}
                    >
                      {track.id === currentId
                        ? ""
                        : `${track.price >= price.finalValue ? "+" : "-"}${fmtMoney(
                            Math.abs(track.price - price.finalValue),
                          )}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {onGenerateLetter && (
          <Button leftIcon={<FileText size={16} />} onClick={onGenerateLetter}>
            Generate Letter Proposal
          </Button>
        )}
      </div>
    </div>
  );
}
