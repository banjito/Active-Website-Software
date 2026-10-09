import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";

type CausedBy = "customer" | "contractor" | "internal" | "none";

interface JobDelay {
  id: string;
  job_id: string;
  user_id: string;
  logged_by_name: string | null;
  delay_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  crew_size: number;
  man_hours: number;
  reason: string;
  caused_by: CausedBy;
  billable: boolean;
  notes: string | null;
  created_at: string;
}

interface JobDelaysProps {
  jobId: string;
  isAdmin?: boolean;
}

const DELAY_REASONS = [
  "Waiting on access / escort",
  "Outage / switching not ready",
  "Equipment not de-energized",
  "Other trades in the way",
  "Missing drawings / info",
  "Weather",
  "Safety stand-down",
  "Equipment / parts",
  "Customer cancelled / rescheduled",
  "Other",
];

const CAUSED_BY_LABELS: Record<CausedBy, string> = {
  customer: "Customer",
  contractor: "Other contractor",
  internal: "Internal",
  none: "No one",
};

const emptyForm = () => ({
  delay_date: format(new Date(), "yyyy-MM-dd"),
  start_time: "",
  end_time: "",
  hours: "",
  crew_size: "1",
  reason: DELAY_REASONS[0],
  caused_by: "customer" as CausedBy,
  billable: false,
  notes: "",
});

/** Hours between two "HH:mm" times on the same day, or null if not both set / not in order */
function hoursBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  if (!(minutes > 0)) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const fmtHours = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function JobDelays({ jobId, isAdmin = false }: JobDelaysProps) {
  const { user } = useAuth();
  const [delays, setDelays] = useState<JobDelay[]>([]);
  const [onsiteHours, setOnsiteHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [reasonFilter, setReasonFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JobDelay | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadDelays = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("job_delays")
        .select("*")
        .eq("job_id", jobId)
        .order("delay_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        // Table not created yet: the migration has not been run
        if (error.code === "42P01" || error.code === "PGRST205") {
          setTableMissing(true);
          return;
        }
        throw error;
      }
      setTableMissing(false);
      setDelays(
        (data || []).map((d: any) => ({
          ...d,
          hours: Number(d.hours),
          man_hours: Number(d.man_hours),
        })),
      );
    } catch (error: any) {
      console.error("Error loading delays:", error);
      toast({
        title: "Error",
        description: `Could not load delays: ${describeSupabaseError(error)}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadOnsiteHours = useCallback(async () => {
    // Comes from the time clock. Missing clock data is normal, so fail quietly
    const { data, error } = await supabase
      .schema("neta_ops")
      .rpc("job_onsite_hours", { p_job_id: jobId });
    if (error || data == null) {
      setOnsiteHours(null);
      return;
    }
    setOnsiteHours(Number(data));
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    loadDelays();
    loadOnsiteHours();
  }, [loadDelays, loadOnsiteHours]);

  const summary = useMemo(() => {
    const delayManHours = delays.reduce((sum, d) => sum + d.man_hours, 0);
    const billableManHours = delays
      .filter((d) => d.billable)
      .reduce((sum, d) => sum + d.man_hours, 0);
    const byReason = new Map<string, number>();
    delays.forEach((d) =>
      byReason.set(d.reason, (byReason.get(d.reason) || 0) + d.man_hours),
    );
    const topReason =
      [...byReason.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const percentLost =
      onsiteHours && onsiteHours > 0
        ? (delayManHours / onsiteHours) * 100
        : null;
    return { delayManHours, billableManHours, topReason, percentLost };
  }, [delays, onsiteHours]);

  const reasonOptions = useMemo(() => {
    // Include any reason already saved on this job, even if it left the list
    const all = new Set([...DELAY_REASONS, ...delays.map((d) => d.reason)]);
    return [...all].map((r) => ({ value: r, label: r }));
  }, [delays]);

  const visibleDelays =
    reasonFilter === "all"
      ? delays
      : delays.filter((d) => d.reason === reasonFilter);

  const timedHours = hoursBetween(form.start_time, form.end_time);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (delay: JobDelay) => {
    setEditing(delay);
    setForm({
      delay_date: delay.delay_date,
      start_time: delay.start_time?.slice(0, 5) || "",
      end_time: delay.end_time?.slice(0, 5) || "",
      hours: String(delay.hours),
      crew_size: String(delay.crew_size),
      reason: delay.reason,
      caused_by: delay.caused_by,
      billable: delay.billable,
      notes: delay.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (form.start_time && form.end_time && timedHours == null) {
      toast({
        title: "Error",
        description: "End time must be after start time",
        variant: "destructive",
      });
      return;
    }
    const hours = timedHours ?? parseFloat(form.hours);
    const crewSize = parseInt(form.crew_size, 10);
    if (!form.delay_date || !(hours > 0) || !(crewSize > 0)) {
      toast({
        title: "Error",
        description: "Please enter a date, the hours lost, and the crew size",
        variant: "destructive",
      });
      return;
    }

    const fields = {
      delay_date: form.delay_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      hours,
      crew_size: crewSize,
      reason: form.reason,
      caused_by: form.caused_by,
      billable: form.billable,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        const { error, status } = await withWriteRetry(
          () =>
            supabase
              .schema("neta_ops")
              .from("job_delays")
              .update({ ...fields, updated_at: new Date().toISOString() })
              .eq("id", editing.id),
          { label: "update job delay" },
        );
        if (error) throw new Error(describeSupabaseError(error, status));
      } else {
        // The id is made here so a retried save cannot create a second row
        const id = crypto.randomUUID();
        const { error, status } = await withWriteRetry(
          () =>
            supabase
              .schema("neta_ops")
              .from("job_delays")
              .upsert(
                {
                  ...fields,
                  id,
                  job_id: jobId,
                  user_id: user.id,
                  logged_by_name:
                    user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    user.email ||
                    null,
                },
                { onConflict: "id" },
              ),
          { label: "add job delay" },
        );
        if (error) throw new Error(describeSupabaseError(error, status));
      }
      setShowForm(false);
      await loadDelays();
    } catch (error: any) {
      console.error("Error saving delay:", error);
      toast({
        title: "Error",
        description: `Could not save delay: ${error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (delay: JobDelay) => {
    if (
      !window.confirm(
        `Delete this ${fmtHours(delay.hours)} hour delay? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(delay.id);
    try {
      const { error, status } = await withWriteRetry(
        () =>
          supabase
            .schema("neta_ops")
            .from("job_delays")
            .delete()
            .eq("id", delay.id),
        { label: "delete job delay" },
      );
      if (error) throw new Error(describeSupabaseError(error, status));
      await loadDelays();
    } catch (error: any) {
      console.error("Error deleting delay:", error);
      toast({
        title: "Error",
        description: `Could not delete delay: ${error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const tiles = [
    {
      label: "Delay man-hours",
      value: fmtHours(summary.delayManHours),
    },
    {
      label: "On-site man-hours",
      value: onsiteHours != null ? fmtHours(onsiteHours) : "No clock data",
    },
    {
      label: "Time lost",
      value:
        summary.percentLost != null
          ? `${summary.percentLost.toFixed(1)}%`
          : "N/A",
    },
    {
      label: "Billable man-hours",
      value: fmtHours(summary.billableManHours),
    },
    {
      label: "Top reason",
      value: summary.topReason
        ? `${summary.topReason[0]} (${fmtHours(summary.topReason[1])} hrs)`
        : "None",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-brand" />
            <span>Delays</span>
          </CardTitle>
          {!tableMissing && (
            <Button onClick={openAdd} leftIcon={<Plus className="h-4 w-4" />}>
              Log Delay
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : tableMissing ? (
          <div className="text-center py-8 text-neutral-500 dark:text-white">
            <p>Delay tracking is not set up in the database yet.</p>
            <p className="text-sm">
              Run database/migrations/add_job_delays.sql, then reload.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-none border border-neutral-200 dark:border-neutral-700 p-3"
                >
                  <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                    {tile.value}
                  </p>
                </div>
              ))}
            </div>

            {delays.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 dark:text-white">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No delays logged yet</p>
                <p className="text-sm">
                  Log time the crew lost waiting, and why
                </p>
              </div>
            ) : (
              <>
                <div className="max-w-xs">
                  <Select
                    aria-label="Filter by reason"
                    size="sm"
                    value={reasonFilter}
                    onChange={(e) => setReasonFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All reasons" },
                      ...reasonOptions,
                    ]}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Crew</TableHead>
                      <TableHead className="text-right">Man-hrs</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Caused by</TableHead>
                      <TableHead>Billable</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Logged by</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDelays.map((delay) => {
                      const canEdit = isAdmin || delay.user_id === user?.id;
                      return (
                        <TableRow key={delay.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(delay.delay_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {delay.start_time && delay.end_time
                              ? `${formatTime(delay.start_time)} - ${formatTime(delay.end_time)}`
                              : ""}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtHours(delay.hours)}
                          </TableCell>
                          <TableCell className="text-right">
                            {delay.crew_size}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtHours(delay.man_hours)}
                          </TableCell>
                          <TableCell>{delay.reason}</TableCell>
                          <TableCell>
                            {CAUSED_BY_LABELS[delay.caused_by] ||
                              delay.caused_by}
                          </TableCell>
                          <TableCell>{delay.billable ? "Yes" : "No"}</TableCell>
                          <TableCell className="max-w-xs whitespace-pre-wrap">
                            {delay.notes}
                          </TableCell>
                          <TableCell>{delay.logged_by_name}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {canEdit && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  aria-label="Edit delay"
                                  onClick={() => openEdit(delay)}
                                  disabled={busyId === delay.id}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  aria-label="Delete delay"
                                  onClick={() => handleDelete(delay)}
                                  disabled={busyId === delay.id}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Delay" : "Log Delay"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-date">
                  Date
                </label>
                <Input
                  id="delay-date"
                  type="date"
                  value={form.delay_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, delay_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-start">
                  Start (optional)
                </label>
                <Input
                  id="delay-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, start_time: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-end">
                  End (optional)
                </label>
                <Input
                  id="delay-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, end_time: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-hours">
                  Hours lost
                </label>
                <Input
                  id="delay-hours"
                  type="number"
                  step="0.25"
                  min="0"
                  value={timedHours != null ? String(timedHours) : form.hours}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, hours: e.target.value }))
                  }
                  placeholder="e.g. 1.5"
                  disabled={timedHours != null}
                />
                {timedHours != null && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Worked out from start and end time
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-crew">
                  Crew size
                </label>
                <Input
                  id="delay-crew"
                  type="number"
                  step="1"
                  min="1"
                  value={form.crew_size}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, crew_size: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-reason">
                  Reason
                </label>
                <Select
                  id="delay-reason"
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  options={reasonOptions}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="delay-caused">
                  Caused by
                </label>
                <Select
                  id="delay-caused"
                  value={form.caused_by}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      caused_by: e.target.value as CausedBy,
                    }))
                  }
                  options={(Object.keys(CAUSED_BY_LABELS) as CausedBy[]).map(
                    (key) => ({ value: key, label: CAUSED_BY_LABELS[key] }),
                  )}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-none accent-[var(--brand)]"
                checked={form.billable}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, billable: e.target.checked }))
                }
              />
              Billable to customer
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="delay-notes">
                Notes
              </label>
              <Textarea
                id="delay-notes"
                rows={3}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="What happened, who was told"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Log Delay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
