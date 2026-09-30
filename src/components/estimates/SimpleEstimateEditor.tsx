/**
 * Simple Estimate: line items with a price, one markup multiplier, and a
 * travel section. No labor table, hours, or rates.
 *
 * Saved as a normal row in business.estimates (data.estimateType = "simple")
 * so the letter proposal, combined letters, statuses and totals all reuse the
 * existing estimate code. The trick: the computed price is stored as a manual
 * price override, which every pricing path already honors.
 *   FINAL = (sum of line items x markup) + travel
 * Mobilization is forced to $0 (not part of a simple estimate).
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, FileText, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";

export interface SimpleLineItem {
  item: string;
  quantity: number | string;
  price: number | string;
}

export interface SimpleTravelItem {
  item: string;
  amount: number | string;
}

export const isSimpleEstimateData = (data: any): boolean => {
  if (!data) return false;
  if (typeof data === "string") {
    try {
      return JSON.parse(data)?.estimateType === "simple";
    } catch {
      return false;
    }
  }
  return data.estimateType === "simple";
};

const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  "$" +
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const DEFAULT_TRAVEL_ITEMS: SimpleTravelItem[] = [
  { item: "Mileage", amount: "" },
  { item: "Lodging", amount: "" },
  { item: "Per Diem", amount: "" },
  { item: "Airfare", amount: "" },
  { item: "Rental Car", amount: "" },
];

const emptyLine = (): SimpleLineItem => ({ item: "", quantity: 1, price: "" });

const INPUT =
  "w-full text-sm rounded-none border px-2 py-1 bg-white dark:bg-dark-100 border-neutral-300 dark:border-dark-200 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-brand";
const TH =
  "text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 font-medium px-2 py-1";

interface SimpleEstimateEditorProps {
  opportunityId: string;
  /** Existing saved estimate row. Omit to create a new one. */
  estimate?: { id: string; data: any; status?: string | null } | null;
  /** Suggested quote number for a new estimate (e.g. "v3"). */
  quoteNumber?: string;
  onSaved?: (row: any) => void;
  onCancel?: () => void;
  /** Shown only for a saved estimate. */
  onGenerateLetter?: () => void;
}

export default function SimpleEstimateEditor({
  opportunityId,
  estimate,
  quoteNumber,
  onSaved,
  onCancel,
  onGenerateLetter,
}: SimpleEstimateEditorProps) {
  const { user } = useAuth();
  const initial = useMemo(() => {
    let d: any = estimate?.data || {};
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        d = {};
      }
    }
    return d;
  }, [estimate?.id]);

  const [title, setTitle] = useState<string>(initial.title || "");
  const [items, setItems] = useState<SimpleLineItem[]>(
    Array.isArray(initial.simpleItems) && initial.simpleItems.length > 0
      ? initial.simpleItems
      : [emptyLine(), emptyLine(), emptyLine()],
  );
  const [markup, setMarkup] = useState<number | string>(
    initial.simpleMarkupMultiplier ?? 1.0,
  );
  const [travel, setTravel] = useState<SimpleTravelItem[]>(
    Array.isArray(initial.simpleTravelItems)
      ? initial.simpleTravelItems
      : DEFAULT_TRAVEL_ITEMS.map((t) => ({ ...t })),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const markupNum = toNum(markup) > 0 ? toNum(markup) : 1;
  const itemsSubtotal = items.reduce(
    (sum, li) => sum + toNum(li.quantity) * toNum(li.price),
    0,
  );
  const itemsWithMarkup = itemsSubtotal * markupNum;
  const travelTotal = travel.reduce((sum, t) => sum + toNum(t.amount), 0);
  const total = Math.ceil(itemsWithMarkup + travelTotal);

  const updateItem = (i: number, patch: Partial<SimpleLineItem>) => {
    setItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
    setDirty(true);
  };
  const updateTravel = (i: number, patch: Partial<SimpleTravelItem>) => {
    setTravel((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  async function handleSave() {
    if (!user) {
      alert("You must be logged in to save an estimate.");
      return;
    }
    if (!opportunityId) {
      alert("Cannot save: opportunity is missing.");
      return;
    }
    const cleanItems = items.filter(
      (li) => li.item.trim() || toNum(li.price) > 0,
    );
    const cleanTravel = travel.filter(
      (t) => t.item.trim() || toNum(t.amount) > 0,
    );

    const data = {
      estimateType: "simple",
      title: title.trim(),
      simpleItems: cleanItems,
      simpleMarkupMultiplier: markupNum,
      simpleTravelItems: cleanTravel,
      // Letter scope table reads sovItems (name + quantity).
      sovItems: cleanItems
        .filter((li) => li.item.trim())
        .map((li) => ({
          rowType: "item",
          item: li.item.trim(),
          quantity: toNum(li.quantity) || 1,
          materialPrice: 0,
          expensePrice: 0,
          laborMen: 0,
          laborHours: 0,
          notes: "",
        })),
      nonSovItems: [],
      useSovItems: true,
      // Every pricing path honors the manual override, so the letter prints
      // exactly this total (NET 30 = x1.0; NET 60/90 factors still apply).
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

    setSaving(true);
    try {
      let row: any;
      if (estimate?.id) {
        const { data: updated, error } = await supabase
          .schema("business")
          .from("estimates")
          .update({ data: JSON.stringify(data), travel_data: JSON.stringify({}) })
          .eq("id", estimate.id)
          .select()
          .single();
        if (error) throw error;
        row = updated;
      } else {
        // Next "vN" number, same scheme as the full estimate sheet.
        let nextNumber = quoteNumber;
        if (!nextNumber) {
          const { data: existing } = await supabase
            .schema("business")
            .from("estimates")
            .select("quote_number")
            .eq("opportunity_id", opportunityId);
          const versions = (existing || []).map((q: any) => {
            const m = String(q.quote_number || "").match(/v(\d+)$/);
            return m ? parseInt(m[1]) : 0;
          });
          nextNumber = `v${Math.max(0, ...versions) + 1}`;
        }
        const { data: created, error } = await supabase
          .schema("business")
          .from("estimates")
          .insert({
            opportunity_id: opportunityId,
            data: JSON.stringify(data),
            travel_data: JSON.stringify({}),
            quote_number: nextNumber,
            user_id: user.id,
            status: null,
          })
          .select()
          .single();
        if (error) throw error;
        row = created;
      }
      setDirty(false);
      window.dispatchEvent(
        new CustomEvent("estimateSaved", {
          detail: { opportunityId, estimateId: row.id },
        }),
      );
      onSaved?.(row);
    } catch (err: any) {
      console.error("Error saving simple estimate:", err);
      alert(`Failed to save estimate: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  const handleLetter = () => {
    if (dirty) {
      alert("Save the estimate first so the letter uses the latest numbers.");
      return;
    }
    onGenerateLetter?.();
  };

  return (
    <div className="text-left space-y-6 text-neutral-900 dark:text-dark-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className={TH + " px-0"}>Estimate title</div>
          <input
            className={INPUT}
            value={title}
            placeholder="e.g. Annual switchgear maintenance"
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <span className="text-xs px-2 py-1 rounded-none bg-brand/10 text-brand font-medium">
          Simple Estimate
        </span>
      </div>

      {/* Line items */}
      <div>
        <h4 className="font-semibold mb-2">Line Items</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-dark-200">
              <th className={TH}>Item</th>
              <th className={TH + " w-24"}>Qty</th>
              <th className={TH + " w-36"}>Price</th>
              <th className={TH + " w-36 text-right"}>Line Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((li, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-dark-200">
                <td className="px-2 py-1">
                  <input
                    className={INPUT}
                    value={li.item}
                    placeholder="Description"
                    onChange={(e) => updateItem(i, { item: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    className={INPUT}
                    value={li.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={INPUT}
                    value={li.price}
                    placeholder="0.00"
                    onChange={(e) => updateItem(i, { price: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1 text-right text-sm">
                  {money(toNum(li.quantity) * toNum(li.price))}
                </td>
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    title="Remove line"
                    className="text-neutral-400 hover:text-red-600"
                    onClick={() => {
                      setItems((prev) => prev.filter((_, idx) => idx !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => {
              setItems((prev) => [...prev, emptyLine()]);
              setDirty(true);
            }}
          >
            Add Line
          </Button>
          <div className="flex items-center gap-4 text-sm">
            <span>
              Subtotal: <b>{money(itemsSubtotal)}</b>
            </span>
            <label className="flex items-center gap-2">
              Markup
              <input
                type="number"
                min={0}
                step="0.01"
                className={INPUT + " w-24"}
                value={markup}
                onChange={(e) => {
                  setMarkup(e.target.value);
                  setDirty(true);
                }}
              />
              x
            </label>
            <span>
              Items total: <b>{money(itemsWithMarkup)}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Travel */}
      <div>
        <h4 className="font-semibold mb-2">Travel</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-dark-200">
              <th className={TH}>Travel item</th>
              <th className={TH + " w-36"}>Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {travel.map((t, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-dark-200">
                <td className="px-2 py-1">
                  <input
                    className={INPUT}
                    value={t.item}
                    placeholder="Description"
                    onChange={(e) => updateTravel(i, { item: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={INPUT}
                    value={t.amount}
                    placeholder="0.00"
                    onChange={(e) => updateTravel(i, { amount: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    title="Remove travel item"
                    className="text-neutral-400 hover:text-red-600"
                    onClick={() => {
                      setTravel((prev) => prev.filter((_, idx) => idx !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => {
              setTravel((prev) => [...prev, { item: "", amount: "" }]);
              setDirty(true);
            }}
          >
            Add Travel Item
          </Button>
          <span className="text-sm">
            Travel total: <b>{money(travelTotal)}</b>
          </span>
        </div>
      </div>

      {/* Total + actions */}
      <div className="border-t border-neutral-200 dark:border-dark-200 pt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg">
          Estimate Total: <b className="text-brand">{money(total)}</b>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            (Items x markup) + travel. Letter NET 60 / NET 90 options add the
            usual term factors.
          </div>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {estimate?.id && onGenerateLetter && (
            <Button
              variant="outline"
              leftIcon={<FileText size={16} />}
              onClick={handleLetter}
            >
              Generate Letter Proposal
            </Button>
          )}
          <Button
            leftIcon={<Save size={16} />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Estimate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
