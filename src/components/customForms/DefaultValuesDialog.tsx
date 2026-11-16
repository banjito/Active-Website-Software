/**
 * "Default values table": the table laid out the way the report shows it,
 * with each cell holding its starting value. Typing in a cell changes that
 * cell's default (section.cellDefaults, or the row names for contact
 * resistance). Static-text cells edit their per-row text. Formula, copied and
 * pass/fail cells are shown but can't take a default.
 */

import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ComponentType, type SectionConfig } from "@/lib/types/customForms";
import { contactResistanceRowLabels, resolveRowCount } from "@/lib/customForms/runtime/layout";
import { CellDefaultInput, canHaveCellDefault } from "./CellDefaultInput";

const cellInput =
  "w-full h-7 bg-transparent px-1.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:bg-brand/5 rounded-none";

export const DefaultValuesDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
}> = ({ open, onClose, section, onUpdate }) => {
  const columns = section.columns ?? [];
  const conditional = !!section.conditionalRows?.length;
  const rowCount = conditional ? section.conditionalRows!.length : resolveRowCount(section);
  const labelledCR =
    section.componentType === ComponentType.CONTACT_RESISTANCE && !conditional;
  const rowLabels = labelledCR ? contactResistanceRowLabels(section) : [];

  const setCellDefault = (r: number, colId: string, val: string) => {
    const key = `row${r}_${colId}`;
    const next = { ...(section.cellDefaults ?? {}) };
    if (val === "") delete next[key];
    else next[key] = val;
    onUpdate({ cellDefaults: next });
  };
  const setStaticCell = (r: number, colId: string, val: string) => {
    const key = `row${r}_${colId}`;
    const next = { ...(section.staticCells ?? {}) };
    if (val === "") delete next[key];
    else next[key] = val;
    onUpdate({ staticCells: next });
  };
  const setRowLabel = (r: number, val: string) => {
    const labels = [...rowLabels];
    while (labels.length <= r) labels.push("");
    labels[r] = val;
    onUpdate({ defaultRowLabels: labels });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(72rem,96vw)] max-w-none max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none"
      >
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">
            Default values — {section.title || "Table"}
          </DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            The table as a new report starts. Type in a cell to set its default; leave it blank for none.
            Grey cells are worked out by the form and can't take a default.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-white dark:bg-dark-150">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {conditional && (
                  <th className="border border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-100 px-2 py-1 text-left font-semibold text-neutral-900 dark:text-white" />
                )}
                {columns.map((col) => (
                  <th
                    key={col.id}
                    style={{ width: col.width }}
                    className="border border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-100 px-2 py-1 text-center font-semibold text-neutral-900 dark:text-white"
                  >
                    {col.label}
                    {col.field?.unit ? ` (${col.field.unit})` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, r) => (
                <tr key={r}>
                  {conditional && (
                    <td className="border border-neutral-400 dark:border-neutral-600 px-2 py-1 font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      {section.conditionalRows![r].label || `Row ${r + 1}`}
                    </td>
                  )}
                  {columns.map((col) => {
                    const f = col.field;
                    const b = f.cellBehavior ?? "user";
                    const td = "border border-neutral-400 dark:border-neutral-600 p-0 h-7";
                    const grey = `${td} px-2 bg-neutral-50 dark:bg-dark-100 text-neutral-400 italic`;
                    if (labelledCR && f.id === "busSection") {
                      return (
                        <td key={col.id} className={td}>
                          <input
                            value={rowLabels[r] ?? ""}
                            onChange={(e) => setRowLabel(r, e.target.value)}
                            placeholder={`Row ${r + 1}`}
                            className={cellInput}
                          />
                        </td>
                      );
                    }
                    if (b === "static") {
                      return (
                        <td key={col.id} className={td}>
                          <input
                            value={section.staticCells?.[`row${r}_${col.id}`] ?? ""}
                            onChange={(e) => setStaticCell(r, col.id, e.target.value)}
                            placeholder={f.staticValue || ""}
                            title="Fixed text for this row (blank uses the column's text)"
                            className={cellInput}
                          />
                        </td>
                      );
                    }
                    if (f.resultRule) return <td key={col.id} className={grey}>pass/fail</td>;
                    if (b === "calculate") return <td key={col.id} className={grey} title={f.calculation?.formula}>formula</td>;
                    if (b === "populate") return <td key={col.id} className={grey}>copied</td>;
                    if (!canHaveCellDefault(f)) return <td key={col.id} className={grey} />;
                    return (
                      <td key={col.id} className={td}>
                        <CellDefaultInput
                          field={f}
                          value={section.cellDefaults?.[`row${r}_${col.id}`] ?? ""}
                          onChange={(next) => setCellDefault(r, col.id, next)}
                          className={`${cellInput} dark:[&>option]:bg-dark-150`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
