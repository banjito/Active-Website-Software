/**
 * Edit a template's overall result choices.
 *
 * PASS / FAIL / LIMITED SERVICE are fixed. The template can add its own,
 * each with a colour, used by the result button and the box at the top of
 * the report.
 */

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_RESULT_OPTIONS,
  cleanCustomResultOptions,
  cleanResultLabel,
  resultTextColor,
  type ResultOption,
} from "@/lib/customForms/resultOptions";

const box =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const Swatch: React.FC<{ option: ResultOption }> = ({ option }) => (
  <span
    className="inline-block px-2 py-0.5 text-xs font-bold rounded-none whitespace-nowrap"
    style={{ backgroundColor: option.color, color: resultTextColor(option.color) }}
  >
    {option.label || "NEW RESULT"}
  </span>
);

export const ResultOptionsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  value: ResultOption[] | undefined;
  onSave: (options: ResultOption[]) => void;
}> = ({ open, onClose, value, onSave }) => {
  const [rows, setRows] = useState<ResultOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(cleanCustomResultOptions(value));
      setError(null);
    }
  }, [open, value]);

  const update = (i: number, patch: Partial<ResultOption>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () => {
    const labels = rows.map((r) => cleanResultLabel(r.label));
    if (labels.some((l) => !l)) return setError("Every added result needs a name.");
    const all = [...DEFAULT_RESULT_OPTIONS.map((o) => o.label), ...labels];
    if (new Set(all).size !== all.length) return setError("Two results have the same name.");
    onSave(cleanCustomResultOptions(rows));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="w-[min(32rem,95vw)] max-w-none max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none">
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">Result choices</DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            The result button cycles through these. The chosen one prints in its colour at the top of the report.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {DEFAULT_RESULT_OPTIONS.map((o) => (
            <div key={o.label} className="flex items-center gap-2">
              <Swatch option={o} />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Standard (always included)</span>
            </div>
          ))}

          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${box} flex-1 min-w-0 uppercase`}
                value={row.label}
                maxLength={40}
                placeholder="e.g. NOT TESTED"
                onChange={(e) => update(i, { label: e.target.value })}
                autoFocus={i === rows.length - 1 && !row.label}
              />
              <input
                type="color"
                className="h-8 w-10 p-0 border border-neutral-300 dark:border-neutral-700 rounded-none bg-transparent cursor-pointer"
                value={row.color}
                onChange={(e) => update(i, { color: e.target.value })}
                title="Pick this result's colour"
                aria-label="Colour"
              />
              <Swatch option={{ ...row, label: cleanResultLabel(row.label) }} />
              <button
                type="button"
                className="p-1 text-neutral-500 hover:text-red-600"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                title="Remove this result"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { label: "", color: "#3b82f6" }])}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add result
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
