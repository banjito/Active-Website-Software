import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { describeSupabaseError } from "@/lib/supabaseRetry";
import { useDemoMode } from "@/lib/DemoModeContext";
import { employeeNameEmailRegex } from "@/lib/companyConfig";
import { TechnicianAssignment } from "@/lib/types/scheduling";
import {
  formatTimeRange,
  isAllDayRange,
  isUnknownRange,
  unknownHoursEnd,
} from "@/lib/scheduleTime";

type Props = {
  assignment: TechnicianAssignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  /** Called after an edit, delete, or undo so the schedule reloads. */
  onChanged: () => void;
};

// A raw row from common.technician_assignments.
type Row = {
  id: string;
  user_id: string;
  job_id: string;
  assignment_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  notes: string | null;
  portal_type: string;
  division: string | null;
  [key: string]: any;
};

const STATUSES = ["scheduled", "in-progress", "completed", "cancelled"];
const assignmentsTable = () =>
  supabase.schema("common").from("technician_assignments");

const displayName = (a?: TechnicianAssignment | null): string => {
  const email = a?.user?.email || "";
  const m = email.toLowerCase().match(employeeNameEmailRegex);
  if (m) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(m[1])} ${cap(m[2])}`;
  }
  return (
    a?.user?.user_metadata?.name || (a?.user as any)?.raw_user_meta_data?.name || email || "Unknown"
  );
};

export const AssignmentDetailsDialog: React.FC<Props> = ({
  assignment,
  open,
  onOpenChange,
  canEdit,
  onChanged,
}) => {
  const { maskJobTitle } = useDemoMode();
  const [row, setRow] = useState<Row | null>(null);
  // Same person + same job on back-to-back days (one Quick Assign
  // over several days saves one row per day).
  const [runRows, setRunRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    startTime: "07:30",
    endTime: "16:00",
    isAllDay: true,
    unknownHours: false,
    status: "scheduled",
    notes: "",
    applyToAll: false,
  });

  // Load the fresh row (the calendar only passes partial data) and its run.
  useEffect(() => {
    if (!open || !assignment?.id) return;
    let mounted = true;
    setEditing(false);
    setRow(null);
    setRunRows([]);
    setLoading(true);
    (async () => {
      try {
        const { data: fresh, error } = await assignmentsTable()
          .select("*")
          .eq("id", assignment.id)
          .maybeSingle();
        if (error) throw error;
        if (!fresh) {
          if (mounted) {
            toast({
              title: "This assignment no longer exists",
              variant: "warning",
            });
            onOpenChange(false);
            onChanged();
          }
          return;
        }
        const r = fresh as Row;
        let q = assignmentsTable()
          .select("*")
          .eq("user_id", r.user_id)
          .eq("job_id", r.job_id)
          .eq("portal_type", r.portal_type)
          .gte(
            "assignment_date",
            dayjs(r.assignment_date).subtract(120, "day").format("YYYY-MM-DD"),
          )
          .lte(
            "assignment_date",
            dayjs(r.assignment_date).add(120, "day").format("YYYY-MM-DD"),
          );
        q = r.division ? q.eq("division", r.division) : q.is("division", null);
        const { data: nearby, error: nearbyErr } = await q;
        if (nearbyErr) throw nearbyErr;

        const byDate = new Map<string, Row[]>();
        ((nearby || []) as Row[]).forEach((x) => {
          if (!byDate.has(x.assignment_date)) byDate.set(x.assignment_date, []);
          byDate.get(x.assignment_date)!.push(x);
        });
        const dates = [r.assignment_date];
        let back = dayjs(r.assignment_date).subtract(1, "day");
        while (byDate.has(back.format("YYYY-MM-DD"))) {
          dates.unshift(back.format("YYYY-MM-DD"));
          back = back.subtract(1, "day");
        }
        let fwd = dayjs(r.assignment_date).add(1, "day");
        while (byDate.has(fwd.format("YYYY-MM-DD"))) {
          dates.push(fwd.format("YYYY-MM-DD"));
          fwd = fwd.add(1, "day");
        }
        const run = dates.flatMap((d) => byDate.get(d) || []);

        if (!mounted) return;
        setRow(r);
        setRunRows(run.length > 0 ? run : [r]);
        setForm({
          startTime: r.start_time?.slice(0, 5) || "07:30",
          endTime: r.end_time?.slice(0, 5) || "16:00",
          isAllDay: isAllDayRange(r.start_time, r.end_time),
          unknownHours:
            !isAllDayRange(r.start_time, r.end_time) &&
            isUnknownRange(r.start_time, r.end_time),
          status: r.status || "scheduled",
          notes: r.notes || "",
          applyToAll: false,
        });
      } catch (e: any) {
        console.error("Failed to load assignment:", e);
        if (mounted)
          toast({
            title: "Couldn't load this assignment",
            description: describeSupabaseError(e),
            variant: "destructive",
          });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment?.id]);

  const runDates = useMemo(
    () => Array.from(new Set(runRows.map((r) => r.assignment_date))).sort(),
    [runRows],
  );
  const runLength = runDates.length;
  const dayIndex = row ? runDates.indexOf(row.assignment_date) + 1 : 0;
  const runLabel =
    runLength > 1
      ? `${dayjs(runDates[0]).format("MMM D")} - ${dayjs(runDates[runLength - 1]).format("MMM D")}`
      : "";

  const handleDelete = async (rows: Row[]) => {
    if (rows.length === 0) return;
    setBusy(true);
    const { error } = await assignmentsTable()
      .delete()
      .in(
        "id",
        rows.map((r) => r.id),
      );
    setBusy(false);
    if (error) {
      console.error("Failed to delete assignment(s):", error);
      toast({
        title: "Couldn't delete",
        description: describeSupabaseError(error),
        variant: "destructive",
      });
      return;
    }
    const days = new Set(rows.map((r) => r.assignment_date)).size;
    onOpenChange(false);
    onChanged();
    toast({
      title: days > 1 ? `Deleted ${days} days` : "Deleted 1 day",
      variant: "success",
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: undoErr } = await assignmentsTable().insert(rows);
          if (undoErr) {
            console.error("Undo delete failed:", undoErr);
            toast({
              title: "Couldn't undo",
              description: describeSupabaseError(undoErr),
              variant: "destructive",
            });
            return;
          }
          onChanged();
        },
      },
    });
  };

  const handleSave = async () => {
    if (!row) return;
    const start = form.isAllDay ? "00:00" : form.startTime;
    const end = form.isAllDay
      ? "23:59"
      : form.unknownHours
        ? unknownHoursEnd(form.startTime)
        : form.endTime;
    if (!form.isAllDay && !form.unknownHours && end <= start) {
      toast({
        title: "End time must be after start time",
        variant: "warning",
      });
      return;
    }
    const ids =
      form.applyToAll && runLength > 1 ? runRows.map((r) => r.id) : [row.id];
    setBusy(true);
    const { error } = await assignmentsTable()
      .update({
        start_time: start,
        end_time: end,
        status: form.status,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    setBusy(false);
    if (error) {
      console.error("Failed to update assignment(s):", error);
      toast({
        title: "Couldn't save changes",
        description: describeSupabaseError(error),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: ids.length > 1 ? `Updated ${runLength} days` : "Saved",
      variant: "success",
    });
    onOpenChange(false);
    onChanged();
  };

  const label = "text-xs text-neutral-500 dark:text-neutral-400";
  const value = "font-medium text-neutral-900 dark:text-white";
  const input =
    "w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Assignment" : "Assignment Details"}</DialogTitle>
        </DialogHeader>

        {loading || !row ? (
          <div className="p-8 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-neutral-50 dark:bg-dark-200 rounded-none p-4 grid grid-cols-2 gap-3">
              <div>
                <div className={label}>Job</div>
                <p className={value}>
                  {assignment?.job?.job_number || "N/A"}{" "}
                  <span className="font-normal">
                    {maskJobTitle(assignment?.job?.title) || ""}
                  </span>
                </p>
              </div>
              <div>
                <div className={label}>Technician</div>
                <p className={value}>{displayName(assignment)}</p>
              </div>
              <div>
                <div className={label}>Date</div>
                <p className={value}>
                  {dayjs(row.assignment_date).format("ddd, MMMM D, YYYY")}
                </p>
                {runLength > 1 && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Day {dayIndex} of {runLength} ({runLabel})
                  </p>
                )}
              </div>
              {!editing && (
                <>
                  <div>
                    <div className={label}>Time</div>
                    <p className={value}>
                      {formatTimeRange(row.start_time, row.end_time)}
                    </p>
                  </div>
                  <div>
                    <div className={label}>Status</div>
                    <p className={`${value} capitalize`}>
                      {row.status || "scheduled"}
                    </p>
                  </div>
                </>
              )}
            </div>

            {!editing && row.notes && (
              <div className="bg-neutral-50 dark:bg-dark-200 rounded-none p-4">
                <div className={`${label} mb-1`}>Notes</div>
                <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">
                  {row.notes}
                </p>
              </div>
            )}

            {editing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    disabled={form.isAllDay}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                    className={input}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={form.endTime}
                    disabled={form.isAllDay || form.unknownHours}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                    className={input}
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-white">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded-none"
                      checked={form.isAllDay}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isAllDay: e.target.checked,
                          unknownHours: e.target.checked ? false : f.unknownHours,
                        }))
                      }
                    />
                    All Day
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded-none"
                      checked={form.unknownHours}
                      disabled={form.isAllDay}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, unknownHours: e.target.checked }))
                      }
                    />
                    Unknown hours
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className={`${input} capitalize`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Notes
                  </label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={3}
                    className="w-full"
                    placeholder="Optional notes"
                  />
                </div>
                {runLength > 1 && (
                  <label className="md:col-span-2 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-white">
                    <input
                      type="checkbox"
                      className="rounded-none"
                      checked={form.applyToAll}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, applyToAll: e.target.checked }))
                      }
                    />
                    Apply to all {runLength} days ({runLabel})
                  </label>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap gap-2">
                {canEdit && !editing && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleDelete([row])}
                      leftIcon={<Trash2 className="w-4 h-4" />}
                      className="text-red-600 dark:text-red-400"
                    >
                      Delete this day
                    </Button>
                    {runLength > 1 && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleDelete(runRows)}
                        leftIcon={<Trash2 className="w-4 h-4" />}
                        className="text-red-600 dark:text-red-400"
                      >
                        Delete all {runLength} days
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={busy}>
                      {busy ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                    {canEdit && (
                      <Button
                        onClick={() => setEditing(true)}
                        leftIcon={<Pencil className="w-4 h-4" />}
                      >
                        Edit
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentDetailsDialog;
