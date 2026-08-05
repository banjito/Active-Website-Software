import React, { useEffect, useState } from "react";
import { ExternalLink, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { toast } from "react-hot-toast";
import { updateScheduledTest } from "@/services/scheduledTestsService";
import {
  EQUIPMENT_STATUS_OPTIONS,
  RESULT_LABELS,
  SCHEDULE_STATE_LABELS,
  TESTING_STATUS_OPTIONS,
  formatDateRange,
  getScheduleState,
  workingDaysBetween,
  type EquipmentStatus,
  type ScheduledTest,
  type ScheduledTestRow,
  type TestingStatus,
} from "@/lib/types/testScheduling";

interface ScheduledTestDrawerProps {
  row: ScheduledTestRow | null;
  onClose: () => void;
  canEdit: boolean;
  userId?: string;
  onSaved: (saved: ScheduledTest) => void;
  /** Work Scheduled resolved to a name by the tab, which holds the template list. */
  workLabel: string;
  /** Open the linked report, when there is one. */
  onOpenReport?: (reportAssetId: string) => void;
}

/**
 * Row detail as a right-side drawer rather than a page navigation.
 *
 * A PM working the Monday list is triaging twenty rows in a row. Navigating away and back
 * loses the filters and the scroll position each time, so the list stays put and the
 * detail slides over it.
 */
export function ScheduledTestDrawer({
  row,
  onClose,
  canEdit,
  userId,
  onSaved,
  workLabel,
  onOpenReport,
}: ScheduledTestDrawerProps) {
  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [equipmentStatus, setEquipmentStatus] = useState("");
  const [testingStatus, setTestingStatus] = useState<TestingStatus>("not_started");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setStartDate(row.start_date ?? "");
    setFinishDate(row.finish_date ?? "");
    setEquipmentStatus(row.equipment_status ?? "");
    setTestingStatus(row.testing_status);
    setNotes(row.notes ?? "");
    setSaving(false);
  }, [row]);

  // Escape closes, because a drawer that traps you is worse than a page.
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  const datesValid = !startDate || !finishDate || finishDate >= startDate;
  const dirty =
    startDate !== (row.start_date ?? "") ||
    finishDate !== (row.finish_date ?? "") ||
    equipmentStatus !== (row.equipment_status ?? "") ||
    testingStatus !== row.testing_status ||
    notes !== (row.notes ?? "");

  const state = getScheduleState({
    testing_status: testingStatus,
    start_date: startDate || null,
    finish_date: finishDate || null,
  });

  const save = async () => {
    if (!datesValid) return;
    setSaving(true);
    try {
      const saved = await updateScheduledTest(
        row.id,
        {
          start_date: startDate || null,
          finish_date: finishDate || null,
          equipment_status: (equipmentStatus || null) as EquipmentStatus | null,
          testing_status: testingStatus,
          notes: notes.trim() || null,
        },
        userId,
      );
      toast.success("Saved");
      onSaved(saved);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-dark-150"
        role="dialog"
        aria-label={`Scheduled test for ${row.identifier}`}
      >
        <div className="flex items-start justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <div>
            <h2 className="text-lg font-semibold">{row.identifier}</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {[row.substation, row.building_area, row.equipment_type]
                .filter(Boolean)
                .join(" · ") || "No location recorded"}
            </p>
            {row.part_of && (
              <p className="text-xs text-neutral-400">Part of {row.part_of}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-brand"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Work scheduled
            </p>
            <p className="text-sm">{workLabel}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {formatDateRange(startDate || null, finishDate || null)}
              {startDate && finishDate && datesValid && (
                <> · {workingDaysBetween(startDate, finishDate)} working days</>
              )}
              {" · "}
              {SCHEDULE_STATE_LABELS[state]}
            </p>
          </div>

          {row.has_date_constraint && (
            <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              The customer fixed this date in their schedule. Changing it means diverging
              from what they published.
            </p>
          )}

          {canEdit ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="date"
                  label="Start date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  type="date"
                  label="Finish date"
                  value={finishDate}
                  min={startDate || undefined}
                  onChange={(e) => setFinishDate(e.target.value)}
                  error={datesValid ? undefined : "Finish can't be before start"}
                />
              </div>

              <Select
                label="Equipment status"
                value={equipmentStatus}
                onChange={(e) => setEquipmentStatus(e.target.value)}
                options={[{ value: "", label: "Not set" }, ...EQUIPMENT_STATUS_OPTIONS]}
              />
              <Select
                label="Testing status"
                value={testingStatus}
                onChange={(e) => setTestingStatus(e.target.value as TestingStatus)}
                options={TESTING_STATUS_OPTIONS}
              />
              <Textarea
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              You have read-only access to the schedule.
            </p>
          )}

          {/* ── Result ── */}
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Result
            </p>
            {row.result ? (
              <p
                className={`text-sm font-semibold ${
                  row.result === "pass"
                    ? "text-green-600 dark:text-green-400"
                    : row.result === "fail"
                      ? "text-destructive"
                      : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {RESULT_LABELS[row.result]}
              </p>
            ) : (
              <p className="text-sm text-neutral-400">No result yet</p>
            )}

            {row.report_asset_id ? (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Lock className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-neutral-500 dark:text-neutral-400">
                  Result comes from the linked report
                </span>
                {onOpenReport && (
                  <button
                    type="button"
                    onClick={() => onOpenReport(row.report_asset_id!)}
                    className="ml-auto flex items-center gap-1 text-brand hover:underline"
                  >
                    Open report
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                No report linked yet. Create one from the asset list and it attaches here.
              </p>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="mt-auto flex items-center gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button onClick={save} disabled={saving || !dirty || !datesValid}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

export default ScheduledTestDrawer;
