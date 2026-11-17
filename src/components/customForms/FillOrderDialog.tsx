/**
 * "Fill order": the whole sheet in one view, every fillable field with its
 * place in the order. Click fields in the order a technician should fill them;
 * click a numbered one to take it out. Enter (and optionally the arrow keys)
 * then follow that order on the form (lib/customForms/fillOrder.ts).
 */

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, Eraser } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { KeyboardNavSettings, SectionConfig } from "@/lib/types/customForms";
import {
  autoOrder,
  cellKey,
  cleanOrder,
  fillOrderSections,
  sectionKeys,
  type FillOrderSection,
} from "@/lib/customForms/fillOrder";

const segBtn = (on: boolean) =>
  `h-7 px-2.5 text-xs border rounded-none ${
    on
      ? "border-brand bg-brand text-white"
      : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-200 hover:border-brand"
  }`;

/** One numbered (or not yet numbered) place. */
const Slot: React.FC<{
  n: number | undefined;
  latest: boolean;
  onClick: () => void;
  title: string;
  wide?: boolean;
  children?: React.ReactNode;
}> = ({ n, latest, onClick, title, wide, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1.5 h-8 rounded-none border text-xs transition-colors ${
      wide ? "px-2" : "w-full justify-center"
    } ${
      n != null
        ? latest
          ? "border-brand bg-brand text-white font-semibold"
          : "border-brand/60 bg-brand/10 text-brand font-semibold dark:bg-brand/20"
        : "border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-400 hover:border-brand hover:text-brand"
    }`}
  >
    <span className="tabular-nums">{n ?? "+"}</span>
    {children}
  </button>
);

export const FillOrderDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  sections: SectionConfig[];
  value: KeyboardNavSettings | undefined;
  onSave: (next: KeyboardNavSettings | undefined) => void;
}> = ({ open, onClose, sections, value, onSave }) => {
  const items = useMemo(() => fillOrderSections(sections), [sections]);
  const total = useMemo(() => items.reduce((n, item) => n + sectionKeys(item, "across").length, 0), [items]);

  const [order, setOrder] = useState<string[]>([]);
  const [addedRows, setAddedRows] = useState<"repeat" | "end">("repeat");
  const [enterFollows, setEnterFollows] = useState(true);
  const [arrowsFollow, setArrowsFollow] = useState(false);
  useEffect(() => {
    if (!open) return;
    const saved = cleanOrder(value?.order, sections);
    setOrder(saved);
    setAddedRows(value?.addedRows ?? "repeat");
    setEnterFollows(!saved.length || value?.enter === "order");
    setArrowsFollow(value?.arrows === "order");
  }, [open, value, sections]);

  const place = useMemo(() => new Map(order.map((k, i) => [k, i + 1])), [order]);
  const latest = order[order.length - 1];
  const toggle = (key: string) =>
    setOrder((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const addRest = (item: FillOrderSection, pattern: "across" | "down") =>
    setOrder((prev) => [...prev, ...sectionKeys(item, pattern).filter((k) => !prev.includes(k))]);

  const save = () => {
    const next: KeyboardNavSettings = { ...(value ?? {}) };
    if (order.length) {
      next.order = order;
      next.addedRows = addedRows === "repeat" ? undefined : addedRows;
      if (enterFollows) next.enter = "order";
      else if (next.enter === "order") next.enter = undefined;
      if (arrowsFollow) next.arrows = "order";
      else if (next.arrows === "order") next.arrows = undefined;
    } else {
      next.order = undefined;
      next.addedRows = undefined;
      if (next.enter === "order") next.enter = undefined;
      if (next.arrows === "order") next.arrows = undefined;
    }
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as KeyboardNavSettings;
    onSave(Object.keys(kept).length ? kept : undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(72rem,96vw)] max-w-none h-[90vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none"
      >
        {/* Header and tools */}
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700 space-y-2">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">Fill order</DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Click fields in the order they should be filled in. Click a numbered field to take it out; the ones after it
            move up. Fields left without a number are reached right after the field before them on the page.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Number everything</span>
              <button type="button" className={segBtn(false)} onClick={() => setOrder(autoOrder(sections, "across"))}>
                <ArrowRight className="inline w-3 h-3 mr-1" />
                Across rows
              </button>
              <button type="button" className={segBtn(false)} onClick={() => setOrder(autoOrder(sections, "down"))}>
                <ArrowDown className="inline w-3 h-3 mr-1" />
                Down columns
              </button>
              <button type="button" className={segBtn(false)} onClick={() => setOrder([])}>
                <Eraser className="inline w-3 h-3 mr-1" />
                Clear all
              </button>
            </div>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
              {order.length} of {total} numbered · next click is <b className="text-brand">{order.length + 1}</b>
            </span>
          </div>
        </div>

        {/* The sheet */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-5 bg-neutral-50 dark:bg-dark-200">
          {items.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">This form has no fields to fill in yet.</p>
          )}
          {items.map((item) => (
            <section key={item.section.id} className="bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{item.section.title || "Untitled"}</h3>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mr-1">Add the rest</span>
                  <button type="button" className={segBtn(false)} onClick={() => addRest(item, "across")} title="Number this section's remaining fields, across each row">
                    <ArrowRight className="inline w-3 h-3" /> Across
                  </button>
                  <button type="button" className={segBtn(false)} onClick={() => addRest(item, "down")} title="Number this section's remaining fields, down each column">
                    <ArrowDown className="inline w-3 h-3" /> Down
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-3">
                {item.fields.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.fields.map((f) => (
                      <Slot
                        key={f.key}
                        wide
                        n={place.get(f.key)}
                        latest={f.key === latest}
                        onClick={() => toggle(f.key)}
                        title={place.has(f.key) ? "Take out of the order" : "Add next in the order"}
                      >
                        <span className="font-normal text-neutral-700 dark:text-neutral-200 truncate max-w-[12rem]">{f.label}</span>
                      </Slot>
                    ))}
                  </div>
                )}

                {item.table && (
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-xs" style={{ minWidth: `${(item.table.columns.length + 1) * 5}rem` }}>
                      <thead>
                        <tr>
                          <th className="w-24 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200" />
                          {item.table.columns.map((c) => (
                            <th
                              key={c.id}
                              className="px-1.5 py-1 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200 font-medium text-left text-neutral-700 dark:text-neutral-200"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.table.rows.map((r) => (
                          <tr key={r.index}>
                            <td className="px-1.5 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                              {r.label}
                            </td>
                            {item.table!.columns.map((c) => {
                              const key = cellKey(item.section.id, c.id, r.index);
                              return (
                                <td key={c.id} className="p-0.5 border border-neutral-200 dark:border-neutral-700">
                                  {item.table!.cellFillable(r.index, c.id) ? (
                                    <Slot
                                      n={place.get(key)}
                                      latest={key === latest}
                                      onClick={() => toggle(key)}
                                      title={`${c.label}, ${r.label}`}
                                    />
                                  ) : (
                                    <div
                                      className="h-8 bg-neutral-100 dark:bg-dark-200 text-center leading-8 text-neutral-400"
                                      title="Not typed in (formula, copied value or fixed text)"
                                    >
                                      —
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Behaviour and save */}
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Rows added while filling in</span>
            <button
              type="button"
              className={segBtn(addedRows === "repeat")}
              onClick={() => setAddedRows("repeat")}
              title="A new row comes right after the table's last numbered row, in that row's order"
            >
              Right after the last row
            </button>
            <button
              type="button"
              className={segBtn(addedRows === "end")}
              onClick={() => setAddedRows("end")}
              title="New rows come after everything else on the sheet"
            >
              After everything
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-200 cursor-pointer">
            <input type="checkbox" className="rounded-none accent-brand" checked={enterFollows} onChange={(e) => setEnterFollows(e.target.checked)} />
            Enter follows this order
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-200 cursor-pointer">
            <input type="checkbox" className="rounded-none accent-brand" checked={arrowsFollow} onChange={(e) => setArrowsFollow(e.target.checked)} />
            Arrow keys follow it too (↓ → next, ↑ ← back)
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
