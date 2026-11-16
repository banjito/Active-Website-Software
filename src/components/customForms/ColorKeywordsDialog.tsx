/**
 * Edit a form's colour keywords: words that colour a result cell.
 *
 * Any dropdown, radio choice or calculated result whose text is exactly the
 * keyword (any capitals) is shown in its colour on new reports. Tables with
 * "Color-code results" off stay plain text.
 */

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TONE_COLOR, cleanColorKeywords, type ColorKeyword } from "@/lib/customForms/resultField";
import { resultTextColor } from "@/lib/customForms/resultOptions";

const box =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const STANDARD: ColorKeyword[] = [
  { label: "PASS, SATISFACTORY, ACCEPTABLE", color: TONE_COLOR.pass },
  { label: "FAIL, UNSATISFACTORY, UNACCEPTABLE", color: TONE_COLOR.fail },
  { label: "LIMITED SERVICE, LIMITED, INVESTIGATE", color: TONE_COLOR.limited },
];

const Swatch: React.FC<{ k: ColorKeyword }> = ({ k }) => (
  <span
    className="inline-block px-2 py-0.5 text-xs font-bold rounded-none whitespace-nowrap"
    style={{ backgroundColor: k.color, color: resultTextColor(k.color) }}
  >
    {k.label || "KEYWORD"}
  </span>
);

export const ColorKeywordsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  value: ColorKeyword[] | undefined;
  onSave: (keywords: ColorKeyword[]) => void;
}> = ({ open, onClose, value, onSave }) => {
  const [rows, setRows] = useState<ColorKeyword[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(cleanColorKeywords(value));
      setError(null);
    }
  }, [open, value]);

  const update = (i: number, patch: Partial<ColorKeyword>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () => {
    const labels = rows.map((r) => r.label.trim().toUpperCase());
    if (labels.some((l) => !l)) return setError("Every keyword needs text.");
    if (new Set(labels).size !== labels.length) return setError("Two keywords are the same.");
    onSave(cleanColorKeywords(rows));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="w-[min(34rem,95vw)] max-w-none max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none">
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">Color keywords</DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            A result, dropdown or calculated cell whose text matches a keyword (any capitals) shows in its colour.
            Tables with "Color-code results" off stay plain.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Standard (always on)</p>
          {STANDARD.map((k) => (
            <div key={k.label}><Swatch k={k} /></div>
          ))}

          <p className="pt-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            This form's keywords (override the standard colours for the same word)
          </p>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${box} flex-1 min-w-0`}
                value={row.label}
                maxLength={40}
                placeholder="e.g. NEEDS REPAIR"
                onChange={(e) => update(i, { label: e.target.value })}
                autoFocus={i === rows.length - 1 && !row.label}
              />
              <input
                type="color"
                className="h-8 w-10 p-0 border border-neutral-300 dark:border-neutral-700 rounded-none bg-transparent cursor-pointer"
                value={row.color}
                onChange={(e) => update(i, { color: e.target.value })}
                title="Pick this keyword's colour"
                aria-label="Colour"
              />
              <Swatch k={row} />
              <button
                type="button"
                className="p-1 text-neutral-500 hover:text-red-600"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                title="Remove this keyword"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { label: "", color: "#f97316" }])}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add keyword
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
