import React, { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/AuthContext";
import { HrDashboard } from "@/pages/HrDashboard";
import TimeClockSettings from "@/pages/hr/TimeClockSettings";
import {
  approveTimeWeek,
  denyTimeWeek,
  getMyTimeReviews,
  getTimeWeekDetail,
  getTimeWeekSendStatus,
  pullTimeWeekFromQuickBooks,
  reopenTimeWeek,
  sendTimeWeekToQuickBooks,
  TimeReviewRow,
  TimeWeekDetail,
} from "@/services/timeReviewService";

// Same list the database uses for "sees everyone's time"
const PAYROLL_ROLES = ["Admin", "Super Admin", "HR", "HR Rep", "HR Representative"];

const STATUS_LABEL: Record<string, string> = {
  open: "Not submitted",
  submitted: "Submitted",
  approved: "Approved",
  denied: "Sent back",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// Day strings are YYYY-MM-DD. Built from parts so the browser's time zone can't shift the day.
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, count: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + count);
  return toYmd(d);
};
// Review happens the Monday after, so the page opens on last week (Sunday to Saturday)
const lastWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() - 7);
  return toYmd(d);
};

const shortDay = (s: string) => parseYmd(s).toLocaleDateString([], { month: "short", day: "numeric" });
const longDay = (s: string) =>
  parseYmd(s).toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
const clockTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now";
const jobName = (job: any) => (job ? `${job.customer_name ? `${job.customer_name}: ` : ""}${job.name}` : "Unknown job");

const Timesheets: React.FC = () => {
  const { user } = useAuth();
  const isPayroll = PAYROLL_ROLES.includes(user?.user_metadata?.role || "");

  const [weekStart, setWeekStart] = useState(lastWeekStart);
  const [rows, setRows] = useState<TimeReviewRow[]>([]);
  // Per person: did the approved hours reach QuickBooks Time
  const [sendInfo, setSendInfo] = useState<Record<string, { qb_sent_at: string | null; qb_error: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TimeWeekDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The note box under a row, for sending a week back or reopening it
  const [noteFor, setNoteFor] = useState<{ id: string; mode: "deny" | "reopen" } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviews, sends] = await Promise.all([getMyTimeReviews(weekStart), getTimeWeekSendStatus(weekStart)]);
      setRows(reviews);
      setSendInfo(sends);
    } catch (error: any) {
      console.error("[Timesheets] Load failed:", error);
      toast({ title: "Couldn't load timesheets", description: error?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    setOpenId(null);
    setDetail(null);
    setNoteFor(null);
    if (isPayroll) load();
  }, [isPayroll, load]);

  const toggleRow = async (profileId: string) => {
    if (openId === profileId) {
      setOpenId(null);
      return;
    }
    setOpenId(profileId);
    setDetail(null);
    try {
      setDetail(await getTimeWeekDetail(profileId, weekStart));
    } catch (error: any) {
      console.error("[Timesheets] Detail failed:", error);
      toast({ title: "Couldn't load the week", description: error?.message, variant: "destructive" });
    }
  };

  // The database enforces every rule (who, when, locked weeks) and its message says which one failed
  const run = async (row: TimeReviewRow, action: () => Promise<void>, done: string) => {
    setBusyId(row.profile_id);
    try {
      await action();
      toast({ title: done, description: row.full_name || undefined, variant: "success" });
      setNoteFor(null);
      setNote("");
    } catch (error: any) {
      console.error("[Timesheets] Action failed:", error);
      toast({ title: "That didn't go through", description: error?.message, variant: "destructive", persistent: true });
    } finally {
      setBusyId(null);
    }
    // Reload even after a failure: an approval can stick while the QuickBooks send fails
    await load();
  };

  const sendNote = (row: TimeReviewRow) => {
    if (!noteFor || !note.trim()) return;
    if (noteFor.mode === "deny") {
      run(row, () => denyTimeWeek(row.profile_id, weekStart, note.trim()), "Sent back");
    } else {
      // The hours come back out of QuickBooks Time first, so a fixed week isn't sent on top of the old one
      run(
        row,
        async () => {
          await pullTimeWeekFromQuickBooks(row.profile_id, weekStart);
          await reopenTimeWeek(row.profile_id, weekStart, note.trim());
        },
        "Reopened"
      );
    }
  };

  // Admin-only while TimeStAMP is being built. Everyone else keeps the page they had.
  if (!isPayroll) return <HrDashboard />;

  const toReview = rows.filter((r) => r.status !== "approved").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Timesheets</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {loading ? "Loading..." : `${toReview} to review, ${rows.length - toReview} approved`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Week before"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center text-sm font-medium text-neutral-900 dark:text-white">
            {shortDay(weekStart)} to {shortDay(addDays(weekStart, 6))}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Week after"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3 text-right">Per diem</th>
              <th className="px-4 py-3 text-right">Miles</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-500 dark:text-neutral-400">
                  No time clocked this week.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const flags = [
                row.hours > 40 && "Over 40",
                row.no_lunch_days > 0 && `No lunch x${row.no_lunch_days}`,
                row.fixes > 0 && `${row.fixes} fixed`,
                row.clocked_in && "Clocked in",
                row.is_late && "Late",
              ].filter(Boolean) as string[];
              const isOpen = openId === row.profile_id;
              const busy = busyId === row.profile_id;

              return (
                <React.Fragment key={row.profile_id}>
                  <tr
                    className="cursor-pointer text-neutral-900 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800/60"
                    onClick={() => toggleRow(row.profile_id)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                        {row.full_name || "No name"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-none px-2 py-1 text-xs font-medium ${STATUS_STYLE[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.status === "approved" && (
                        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          {sendInfo[row.profile_id]?.qb_sent_at ? "In QuickBooks" : "Not in QuickBooks"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(row.hours).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.per_diem_days || ""}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(row.miles) || ""}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {flags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-none bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {row.status === "approved" && !sendInfo[row.profile_id]?.qb_sent_at && (
                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Send className="h-4 w-4" />}
                            isLoading={busy}
                            onClick={() =>
                              run(row, () => sendTimeWeekToQuickBooks(row.profile_id, weekStart), "Sent to QuickBooks")
                            }
                          >
                            Send to QuickBooks
                          </Button>
                        )}
                        {row.status === "approved" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<RotateCcw className="h-4 w-4" />}
                            onClick={() => setNoteFor({ id: row.profile_id, mode: "reopen" })}
                          >
                            Reopen
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<X className="h-4 w-4" />}
                              disabled={!row.is_ready || busy}
                              onClick={() => setNoteFor({ id: row.profile_id, mode: "deny" })}
                            >
                              Send back
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={<Check className="h-4 w-4" />}
                              disabled={!row.is_ready || row.clocked_in}
                              isLoading={busy}
                              onClick={() =>
                                run(
                                  row,
                                  async () => {
                                    await approveTimeWeek(row.profile_id, weekStart, Number(row.hours));
                                    await sendTimeWeekToQuickBooks(row.profile_id, weekStart);
                                  },
                                  "Approved and sent to QuickBooks"
                                )
                              }
                            >
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {noteFor?.id === row.profile_id && (
                    <tr className="bg-neutral-50 dark:bg-neutral-800/60">
                      <td colSpan={7} className="px-4 py-3">
                        <label className="form-label" htmlFor={`note-${row.profile_id}`}>
                          {noteFor.mode === "deny" ? "What needs fixing?" : "Why reopen this week?"}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <input
                            id={`note-${row.profile_id}`}
                            className="form-input min-w-[16rem] flex-1 rounded-none"
                            value={note}
                            autoFocus
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendNote(row)}
                          />
                          <Button variant="primary" size="sm" disabled={!note.trim()} isLoading={busy} onClick={() => sendNote(row)}>
                            {noteFor.mode === "deny" ? "Send back" : "Reopen"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setNoteFor(null);
                              setNote("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isOpen && (
                    <tr className="bg-neutral-50 dark:bg-neutral-900/40">
                      <td colSpan={7} className="px-4 py-4">
                        {!detail ? (
                          <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
                        ) : (
                          <div className="space-y-3">
                            {sendInfo[row.profile_id]?.qb_error && (
                              <p className="text-red-700 dark:text-red-300">
                                QuickBooks refused: {sendInfo[row.profile_id]?.qb_error}
                              </p>
                            )}
                            {row.status === "denied" && row.denied_note && (
                              <p className="text-red-700 dark:text-red-300">Sent back: {row.denied_note}</p>
                            )}
                            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
                              const punches = detail.entries.filter((e) => e.work_date === day);
                              const extra = detail.extras.find((x) => x.work_date === day);
                              const hasExtra = extra && (extra.per_diem || Number(extra.miles) > 0);
                              if (punches.length === 0 && !hasExtra) return null;
                              const dayHours = punches.reduce((sum, e) => sum + Number(e.hours || 0), 0);

                              return (
                                <div key={day} className="text-neutral-800 dark:text-neutral-200">
                                  <div className="flex justify-between font-medium">
                                    <span>{longDay(day)}</span>
                                    <span className="tabular-nums">{dayHours.toFixed(2)} h</span>
                                  </div>
                                  {punches.map((e) => (
                                    <div key={e.id} className="flex flex-wrap justify-between gap-2 pl-4 text-neutral-600 dark:text-neutral-400">
                                      <span>
                                        {clockTime(e.counted_in_at)} to {clockTime(e.counted_out_at)}
                                        {e.ended_for === "lunch" ? " (lunch)" : ""}
                                        {" · "}
                                        {jobName(e.time_jobs)}
                                        {e.fixed_at ? " · fixed" : ""}
                                      </span>
                                      <span className="tabular-nums">{e.hours != null ? Number(e.hours).toFixed(2) : "on the clock"}</span>
                                    </div>
                                  ))}
                                  {hasExtra && (
                                    <div className="pl-4 text-neutral-600 dark:text-neutral-400">
                                      {[extra.per_diem && "Per diem", Number(extra.miles) > 0 && `${Number(extra.miles)} miles`]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {detail.changes.length > 0 && (
                              <div className="border-t border-neutral-200 pt-3 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                                <div className="font-medium text-neutral-800 dark:text-neutral-200">Punch fixes</div>
                                {detail.changes.map((c) => (
                                  <div key={c.id} className="pl-4">
                                    {longDay(c.work_date)}: {c.action === "fix" ? "changed" : c.action === "add" ? "added" : "removed"}, "{c.reason}"
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <TimeClockSettings />
    </div>
  );
};

export default Timesheets;
