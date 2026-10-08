import React, { useState } from "react";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { ChevronDown, ChevronUp, Copy, Send, Trash2 } from "lucide-react";
import {
  deleteQuickBooksTimeActivity,
  getQuickBooksTimeActivity,
} from "@/services/quickbooksService";
import {
  createQuickBooksTimeManualTimesheet,
  deleteQuickBooksTimeTimesheet,
  getQuickBooksTimeTimesheets,
  getQuickBooksTimeUsers,
  quickBooksTimeApiCall,
  saveQuickBooksTimeUserMatches,
  syncQuickBooksTime,
} from "@/services/quickbooksTimeService";

// Temporary tool for TimeStAMP build step 0: proves that a time entry written from
// outside QuickBooks shows up in a payroll run. The first try went through the
// QuickBooks Online API and payroll never saw it, so this one writes to QuickBooks Time.
// Remove once the result is known.

const STORAGE_KEY = "timestamp_qbtime_test_entries";
// Entries from the first try (QuickBooks Online API). Kept only so they can still be deleted.
const OLD_STORAGE_KEY = "timestamp_qb_test_entries";
const TEST_NOTE = "TimeStAMP TEST - delete me";
const HOUR_OPTIONS = [0.25, 0.5, 1];
const JOB_LOOKBACK_DAYS = 14;
// The snapshot only needs the shape of the job list, not all of it
const SNAPSHOT_JOB_PAGES = 4;

interface TestEntry {
  id: string;
  employeeName: string;
  date: string;
  hours: number;
  jobName?: string;
}

// Kept in the browser so the delete button survives a page reload
function loadEntries(key: string): TestEntry[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (_) {
    return [];
  }
}

function saveEntries(key: string, entries: TestEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch (_) {}
}

// Edge Function errors keep QuickBooks' reason inside the response body
async function describeError(err: any): Promise<string> {
  try {
    if (typeof err?.context?.json === "function") {
      const body = await err.context.json();
      const details =
        typeof body?.details === "string" ? body.details : JSON.stringify(body?.details ?? body);
      return body?.error ? `${body.error}: ${details}` : details;
    }
  } catch (_) {}
  return err?.message || "Unknown error";
}

function userName(user: any): string {
  return `${user.last_name || ""}, ${user.first_name || ""}`;
}

const QuickBooksTimeEntryTest: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [hours, setHours] = useState(0.25);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TestEntry[]>(() => loadEntries(STORAGE_KEY));
  const [oldEntries, setOldEntries] = useState<TestEntry[]>(() => loadEntries(OLD_STORAGE_KEY));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  // QuickBooks Time user id -> chosen ampOS login id ("" = leave unmatched)
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [savingMatches, setSavingMatches] = useState(false);

  const pendingCount = entries.length + oldEntries.length;

  // Team members load on first open, not on every dashboard visit
  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || users.length > 0) return;
    setLoadingUsers(true);
    try {
      const list = await getQuickBooksTimeUsers();
      setUsers(list.sort((a, b) => userName(a).localeCompare(userName(b))));
    } catch (err) {
      console.error("[QB Time test] User load failed:", err);
      setMessage({ ok: false, text: `Could not load team members. ${await describeError(err)}` });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSend = async () => {
    const user = users.find((u) => String(u.id) === userId);
    if (!user) return;
    setSending(true);
    setMessage(null);
    try {
      // Reuse the job (and any required custom fields) from this person's latest real
      // entry, so the test lands exactly where their normal time does
      const from = new Date(`${date}T00:00:00`);
      from.setDate(from.getDate() - JOB_LOOKBACK_DAYS);
      const { timesheets, jobcodes } = await getQuickBooksTimeTimesheets(
        user.id,
        from.toLocaleDateString("en-CA"),
        date
      );
      const latest = timesheets
        .filter((t) => t.jobcode_id && (jobcodes[t.jobcode_id]?.type ?? "regular") === "regular")
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      if (!latest) {
        throw new Error(
          "This person has no job time in the last two weeks. Pick someone who has clocked in."
        );
      }

      const hasCustomFields = latest.customfields && Object.keys(latest.customfields).length > 0;
      const created = await createQuickBooksTimeManualTimesheet({
        user_id: user.id,
        jobcode_id: latest.jobcode_id,
        date,
        duration: Math.round(hours * 3600),
        notes: TEST_NOTE,
        ...(hasCustomFields ? { customfields: latest.customfields } : {}),
      });

      const jobName = jobcodes[latest.jobcode_id]?.name || `job ${latest.jobcode_id}`;
      const next = [
        ...entries,
        { id: String(created.id), employeeName: userName(user), date, hours, jobName },
      ];
      setEntries(next);
      saveEntries(STORAGE_KEY, next);
      setMessage({
        ok: true,
        text: `Sent. QuickBooks Time saved it as entry ${created.id} on ${jobName}.`,
      });
    } catch (err) {
      console.error("[QB Time test] Create failed:", err);
      setMessage({
        ok: false,
        text: `QuickBooks Time did not take the entry. ${await describeError(err)}`,
      });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (entry: TestEntry) => {
    setDeletingId(entry.id);
    setMessage(null);
    try {
      await deleteQuickBooksTimeTimesheet(entry.id);
      const next = entries.filter((e) => e.id !== entry.id);
      setEntries(next);
      saveEntries(STORAGE_KEY, next);
      setMessage({ ok: true, text: `Deleted test entry ${entry.id} from QuickBooks Time.` });
    } catch (err) {
      console.error("[QB Time test] Delete failed:", err);
      setMessage({
        ok: false,
        text: `Could not delete entry ${entry.id}. Remove it in QuickBooks by hand. ${await describeError(err)}`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteOld = async (entry: TestEntry) => {
    setDeletingId(entry.id);
    setMessage(null);
    try {
      // Read it first: the SyncToken changes whenever QuickBooks touches the entry
      const current = await getQuickBooksTimeActivity(entry.id);
      if (!current) throw new Error("QuickBooks did not return the entry");
      await deleteQuickBooksTimeActivity(entry.id, current.SyncToken);
      const next = oldEntries.filter((e) => e.id !== entry.id);
      setOldEntries(next);
      saveEntries(OLD_STORAGE_KEY, next);
      setMessage({ ok: true, text: `Deleted test entry ${entry.id} from QuickBooks.` });
    } catch (err) {
      console.error("[QB time test] Delete failed:", err);
      setMessage({
        ok: false,
        text: `Could not delete entry ${entry.id}. Remove it in QuickBooks by hand. ${await describeError(err)}`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Read-only summary of how QuickBooks Time is set up, so the TimeStAMP tables can be
  // designed around what is really there (who has an email, how jobs nest, required fields)
  const handleSnapshot = async () => {
    setLoadingSnapshot(true);
    setMessage(null);
    try {
      const jobcodes: any[] = [];
      let moreJobs = false;
      for (let page = 1; page <= SNAPSHOT_JOB_PAGES; page++) {
        const res = await quickBooksTimeApiCall(`/jobcodes?active=yes&page=${page}`);
        jobcodes.push(...Object.values(res?.results?.jobcodes ?? {}));
        moreJobs = !!res?.more;
        if (!moreJobs) break;
      }
      const fieldsRes = await quickBooksTimeApiCall("/customfields");
      const customfields: any[] = Object.values(fieldsRes?.results?.customfields ?? {});

      let sampleTimesheet: any = null;
      if (userId) {
        const from = new Date(`${date}T00:00:00`);
        from.setDate(from.getDate() - JOB_LOOKBACK_DAYS);
        const { timesheets } = await getQuickBooksTimeTimesheets(
          userId,
          from.toLocaleDateString("en-CA"),
          date
        );
        const sample = timesheets[0];
        if (sample) {
          sampleTimesheet = {
            keys: Object.keys(sample),
            type: sample.type,
            locked: sample.locked,
            customfields: sample.customfields,
          };
        }
      }

      const jobsById = new Map(jobcodes.map((j) => [j.id, j]));
      const byType: Record<string, number> = {};
      jobcodes.forEach((j) => {
        byType[j.type] = (byType[j.type] || 0) + 1;
      });

      setSnapshot(
        JSON.stringify(
          {
            users: {
              count: users.length,
              withEmail: users.filter((u) => u.email).length,
              withPayrollId: users.filter((u) => u.payroll_id).length,
              keys: Object.keys(users[0] ?? {}),
            },
            jobcodes: {
              fetched: jobcodes.length,
              moreExist: moreJobs,
              byType,
              topLevel: jobcodes.filter((j) => !j.parent_id).length,
              startWithNumber: jobcodes.filter((j) => /^\d/.test(j.name || "")).length,
              keys: Object.keys(jobcodes[0] ?? {}),
              samples: jobcodes
                .filter((j) => j.parent_id)
                .slice(0, 8)
                .map((j) => ({
                  name: j.name,
                  parent: jobsById.get(j.parent_id)?.name ?? j.parent_id,
                  type: j.type,
                  has_children: j.has_children,
                })),
            },
            customfields: customfields.map((f) => ({
              id: f.id,
              name: f.name,
              required: f.required,
              applies_to: f.applies_to,
              type: f.type,
              active: f.active,
            })),
            sampleTimesheet,
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error("[QB Time test] Snapshot failed:", err);
      setMessage({ ok: false, text: `Could not read the setup. ${await describeError(err)}` });
    } finally {
      setLoadingSnapshot(false);
    }
  };

  // Copies the job list and matches people into the TimeStAMP tables. Safe to repeat.
  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncQuickBooksTime();
      setSyncResult(result);
      // Start each person on the suggested login, if the sync found one
      const suggested: Record<string, string> = {};
      (result?.people?.unmatched ?? []).forEach((person: any) => {
        suggested[String(person.qb_time_user_id)] = person.suggestedProfileId || "";
      });
      setPicks(suggested);
    } catch (err) {
      console.error("[QB Time test] Sync failed:", err);
      setMessage({ ok: false, text: `Sync failed. ${await describeError(err)}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveMatches = async () => {
    const unmatched: any[] = syncResult?.people?.unmatched ?? [];
    const rows = unmatched
      .filter((person) => picks[String(person.qb_time_user_id)])
      .map((person) => ({
        profile_id: picks[String(person.qb_time_user_id)],
        qb_time_user_id: Number(person.qb_time_user_id),
        // Hourly staff clock in. Salaried people only approve.
        clocks_in: !person.salaried,
      }));
    if (rows.length === 0) return;
    if (new Set(rows.map((row) => row.profile_id)).size !== rows.length) {
      setMessage({ ok: false, text: "One ampOS login is picked for two people. Fix that first." });
      return;
    }
    setSavingMatches(true);
    setMessage(null);
    try {
      await saveQuickBooksTimeUserMatches(rows);
      await handleSync();
      setMessage({ ok: true, text: `Saved ${rows.length} matches.` });
    } catch (err) {
      console.error("[QB Time test] Saving matches failed:", err);
      setMessage({ ok: false, text: `Could not save matches. ${await describeError(err)}` });
    } finally {
      setSavingMatches(false);
    }
  };

  const handleCopySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(snapshot);
      setMessage({ ok: true, text: "Snapshot copied." });
    } catch (_) {
      setMessage({ ok: false, text: "Could not copy. Select the text in the box and copy it by hand." });
    }
  };

  const renderEntry = (entry: TestEntry, onDelete: (entry: TestEntry) => void) => (
    <div
      key={entry.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-neutral-200 dark:border-neutral-700 p-3"
    >
      <span className="text-sm">
        {entry.employeeName} · {entry.date} · {entry.hours.toFixed(2)} h
        {entry.jobName ? ` · ${entry.jobName}` : ""} · ID {entry.id}
      </span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => onDelete(entry)}
        isLoading={deletingId === entry.id}
        leftIcon={<Trash2 className="h-4 w-4" />}
      >
        Delete from QuickBooks
      </Button>
    </div>
  );

  return (
    <Card className="rounded-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>TimeStAMP payroll test</CardTitle>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                {pendingCount} test {pendingCount === 1 ? "entry" : "entries"} to delete
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              rightIcon={open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            >
              {open ? "Hide" : "Open"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Sends one small test time entry to QuickBooks Time so you can check that payroll picks
            it up. It goes on the same job as that person's latest entry. Delete it when you are
            done.
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            This is a real entry on a real employee. If payroll runs before you delete it, that
            person gets paid for it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label" htmlFor="qb-test-employee">
                Employee
              </label>
              <select
                id="qb-test-employee"
                className="form-select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={loadingUsers}
              >
                <option value="">{loadingUsers ? "Loading..." : "Pick an employee"}</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {userName(u)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="qb-test-date">
                Date
              </label>
              <input
                id="qb-test-date"
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="qb-test-hours">
                Hours
              </label>
              <select
                id="qb-test-hours"
                className="form-select"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={handleSend}
            isLoading={sending}
            disabled={!userId || !date}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Send test entry
          </Button>

          {message && (
            <p
              className={`text-sm ${
                message.ok
                  ? "text-green-700 dark:text-green-300"
                  : "text-red-700 dark:text-red-300"
              }`}
            >
              {message.text}
            </p>
          )}

          <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Setup snapshot: reads how QuickBooks Time is set up (people count, job layout, custom
              fields). It changes nothing. Pick an employee first to include one sample entry.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleSnapshot}
                isLoading={loadingSnapshot}
                disabled={users.length === 0}
              >
                Read setup snapshot
              </Button>
              {snapshot && (
                <Button
                  variant="outline"
                  onClick={handleCopySnapshot}
                  leftIcon={<Copy className="h-4 w-4" />}
                >
                  Copy
                </Button>
              )}
            </div>
            {snapshot && (
              <textarea
                id="qb-test-snapshot"
                readOnly
                rows={12}
                className="form-input font-mono text-xs"
                value={snapshot}
              />
            )}
          </div>

          <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Sync: copies the QuickBooks Time job list into ampOS and matches people to their
              ampOS login by email. It changes nothing in QuickBooks. Safe to run again.
            </p>
            <Button variant="outline" onClick={handleSync} isLoading={syncing}>
              Sync jobs and people
            </Button>
            {syncResult && (
              <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
                <p>
                  Jobs: {syncResult.jobs?.copied} copied, {syncResult.jobs?.linkedToAmposJobs} linked
                  to ampOS jobs, {syncResult.jobs?.timeOffCodes} time-off codes,{" "}
                  {syncResult.jobs?.markedInactive} marked inactive.
                </p>
                {syncResult.jobs?.timeOffError && (
                  <p className="text-red-700 dark:text-red-300">
                    Time-off codes did not load: {syncResult.jobs.timeOffError}
                  </p>
                )}
                <p>
                  People: {syncResult.people?.newlyMatched} matched now,{" "}
                  {syncResult.people?.alreadyMatched} already matched,{" "}
                  {syncResult.people?.movedToActiveRecord ?? 0} moved to their active record,{" "}
                  {syncResult.people?.unmatched?.length ?? 0} need matching by hand.
                </p>
                {syncResult.people?.unmatched?.length > 0 && (
                  <div className="space-y-2">
                    <p>
                      ampOS has {syncResult.people.amposLogins} logins. Pick the right one for each
                      person, or leave it on "No match" to skip them. Check every guess before
                      saving.
                    </p>
                    {syncResult.people.unmatched.map((person: any) => (
                      <div
                        key={person.qb_time_user_id}
                        className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center border-b border-neutral-200 dark:border-neutral-700 pb-2"
                      >
                        <label htmlFor={`qb-match-${person.qb_time_user_id}`}>
                          {person.name}
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                            {person.reason}
                            {person.suggestedBy ? `. Guessed by ${person.suggestedBy}.` : ""}
                          </span>
                        </label>
                        <select
                          id={`qb-match-${person.qb_time_user_id}`}
                          className="form-select"
                          value={picks[String(person.qb_time_user_id)] || ""}
                          onChange={(e) =>
                            setPicks({ ...picks, [String(person.qb_time_user_id)]: e.target.value })
                          }
                        >
                          <option value="">No match</option>
                          {(syncResult.people.amposPeople ?? []).map((login: any) => (
                            <option key={login.id} value={login.id}>
                              {login.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <Button variant="primary" onClick={handleSaveMatches} isLoading={savingMatches}>
                      Save matches
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <ol className="list-decimal pl-5 space-y-1 text-sm text-neutral-700 dark:text-neutral-200">
                <li>In QuickBooks, open Time, then Time entries. Is the test entry listed?</li>
                <li>
                  Open Payroll, Run payroll, Approve time. Filter to this person. Is it there? Do
                  not approve it.
                </li>
                <li>Come back here and delete the test entry.</li>
              </ol>
              {entries.map((entry) => renderEntry(entry, handleDelete))}
            </div>
          )}

          {oldEntries.length > 0 && (
            <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-200">
                Left over from the first test. Payroll cannot see these, but delete them too.
              </p>
              {oldEntries.map((entry) => renderEntry(entry, handleDeleteOld))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default QuickBooksTimeEntryTest;
