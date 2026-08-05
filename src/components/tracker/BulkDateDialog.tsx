import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import {
  applyBulkDates,
  planBulkDates,
  type BulkDateOp,
  type BulkDateRequest,
  type ShiftUnit,
} from "@/services/scheduledTestsService";
import {
  formatScheduleDate,
  nextWorkingDay,
  type ScheduledTestRow,
} from "@/lib/types/testScheduling";

interface BulkDateDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  op: BulkDateOp;
  rows: ScheduledTestRow[];
  userId?: string;
  onApplied: (batchId: string | null, affected: number) => void;
}

const TITLES: Record<BulkDateOp, string> = {
  set_start: "Change start date",
  set_finish: "Change finish date",
  shift: "Shift dates",
};

/** How many rows of the preview are shown before it collapses to a count. */
const PREVIEW_LIMIT = 10;

/**
 * Bulk date changes, always behind a preview.
 *
 * Shifting the wrong forty rows is easy, and nobody notices until a crew turns up on the
 * wrong day a week later. So: nothing is written until the before/after is on screen, and
 * everything written is undoable as one batch.
 */
export function BulkDateDialog({
  open,
  onClose,
  siteId,
  op,
  rows,
  userId,
  onApplied,
}: BulkDateDialogProps) {
  const [date, setDate] = useState("");
  const [days, setDays] = useState(5);
  const [unit, setUnit] = useState<ShiftUnit>("working");
  const [direction, setDirection] = useState<"later" | "earlier">("later");
  const [skipComplete, setSkipComplete] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(nextWorkingDay());
    setDays(5);
    setUnit("working");
    setDirection("later");
    setSkipComplete(true);
    setSaving(false);
  }, [open, op]);

  const request: BulkDateRequest = useMemo(
    () => ({
      siteId,
      rows,
      op,
      date: op === "shift" ? undefined : date,
      days: op === "shift" ? days : undefined,
      unit,
      direction,
      skipComplete,
      userId,
    }),
    [siteId, rows, op, date, days, unit, direction, skipComplete, userId],
  );

  /**
   * The preview is the same function the commit runs, so what's approved is exactly what
   * lands. No second code path to drift out of sync.
   */
  const plan = useMemo(
    () => (open ? planBulkDates(request) : { changes: [], skipped: [], warnings: [] }),
    [open, request],
  );

  const apply = async () => {
    if (plan.changes.length === 0) return;
    setSaving(true);
    try {
      const { batchId, affected } = await applyBulkDates(request, plan);
      onApplied(batchId, affected);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to change dates");
    } finally {
      setSaving(false);
    }
  };

  const shown = plan.changes.slice(0, PREVIEW_LIMIT);
  const hidden = plan.changes.length - shown.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            {TITLES[op]}
          </DialogTitle>
          <DialogDescription>
            {rows.length} item{rows.length === 1 ? "" : "s"} selected. Nothing is saved
            until you commit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {op === "shift" ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    label="Shift by"
                    value={String(days)}
                    onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="w-44">
                  <Select
                    label="Unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as ShiftUnit)}
                    options={[
                      { value: "working", label: "working days (Mon–Fri)" },
                      { value: "calendar", label: "calendar days" },
                    ]}
                  />
                </div>
                <div className="w-36">
                  <Select
                    label="Direction"
                    value={direction}
                    onChange={(e) =>
                      setDirection(e.target.value as "later" | "earlier")
                    }
                    options={[
                      { value: "later", label: "Later" },
                      { value: "earlier", label: "Earlier" },
                    ]}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Working days is the default because the customer's schedule never lands on
                a weekend, and seven calendar days is not the same as a week of work. Site
                holidays are <strong>not</strong> accounted for.
              </p>
            </>
          ) : (
            <Input
              type="date"
              label={op === "set_start" ? "New start date" : "New finish date"}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipComplete}
              onChange={(e) => setSkipComplete(e.target.checked)}
            />
            Skip items that are already complete
          </label>

          {/* ── Preview ── */}
          <div className="border border-neutral-200 dark:border-neutral-700">
            <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              Preview — {plan.changes.length} item
              {plan.changes.length === 1 ? "" : "s"} will change
            </div>
            <div className="max-h-56 overflow-y-auto">
              {plan.changes.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Nothing would change with these settings.
                </p>
              ) : (
                <>
                  {shown.map((change) => (
                    <div
                      key={change.id}
                      className="flex flex-wrap items-baseline gap-x-2 border-b border-neutral-100 px-3 py-1.5 text-sm last:border-b-0 dark:border-neutral-800"
                    >
                      <span className="font-medium">{change.identifier}</span>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {formatScheduleDate(change.fromStart)} –{" "}
                        {formatScheduleDate(change.fromFinish)}
                      </span>
                      <span className="text-neutral-400">→</span>
                      <span className="font-medium text-brand">
                        {formatScheduleDate(change.toStart)} –{" "}
                        {formatScheduleDate(change.toFinish)}
                      </span>
                    </div>
                  ))}
                  {hidden > 0 && (
                    <p className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                      …and {hidden} more
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {plan.warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950">
              {plan.warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={saving || plan.changes.length === 0}>
            {saving
              ? "Applying…"
              : `Apply to ${plan.changes.length} item${plan.changes.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkDateDialog;
