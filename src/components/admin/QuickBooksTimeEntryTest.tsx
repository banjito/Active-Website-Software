import React, { useState } from "react";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { ChevronDown, ChevronUp, Send, Trash2 } from "lucide-react";
import {
  createQuickBooksTimeActivity,
  deleteQuickBooksTimeActivity,
  getQuickBooksEmployees,
  getQuickBooksTimeActivity,
} from "@/services/quickbooksService";

// Temporary tool for TimeStAMP build step 0: proves that a time entry written
// from outside QuickBooks shows up in a payroll run. Remove once that is confirmed.

const STORAGE_KEY = "timestamp_qb_test_entries";
const TEST_DESCRIPTION = "TimeStAMP TEST - delete me";
const HOUR_OPTIONS = [0.25, 0.5, 1];

interface TestEntry {
  id: string;
  employeeName: string;
  date: string;
  hours: number;
}

// Kept in the browser so the delete button survives a page reload
function loadEntries(): TestEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveEntries(entries: TestEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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

const QuickBooksTimeEntryTest: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [hours, setHours] = useState(0.25);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TestEntry[]>(loadEntries);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Employees load on first open, not on every dashboard visit, to save QuickBooks reads
  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || employees.length > 0) return;
    setLoadingEmployees(true);
    try {
      const list = await getQuickBooksEmployees();
      setEmployees(
        list
          .filter((e) => e.Active !== false)
          .sort((a, b) => String(a.DisplayName || "").localeCompare(String(b.DisplayName || "")))
      );
    } catch (err) {
      console.error("[QB time test] Employee load failed:", err);
      setMessage({ ok: false, text: `Could not load employees. ${await describeError(err)}` });
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleSend = async () => {
    const employee = employees.find((e) => e.Id === employeeId);
    if (!employee) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await createQuickBooksTimeActivity({
        TxnDate: date,
        NameOf: "Employee",
        EmployeeRef: { value: employee.Id },
        Hours: Math.floor(hours),
        Minutes: Math.round((hours % 1) * 60),
        Description: TEST_DESCRIPTION,
      });
      const created = response?.TimeActivity;
      if (!created?.Id) throw new Error("QuickBooks did not return an entry ID");
      const next = [
        ...entries,
        { id: created.Id, employeeName: employee.DisplayName, date, hours },
      ];
      setEntries(next);
      saveEntries(next);
      setMessage({ ok: true, text: `Sent. QuickBooks saved it as time entry ${created.Id}.` });
    } catch (err) {
      console.error("[QB time test] Create failed:", err);
      setMessage({ ok: false, text: `QuickBooks did not take the entry. ${await describeError(err)}` });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (entry: TestEntry) => {
    setDeletingId(entry.id);
    setMessage(null);
    try {
      // Read it first: the SyncToken changes whenever QuickBooks touches the entry
      const current = await getQuickBooksTimeActivity(entry.id);
      if (!current) throw new Error("QuickBooks did not return the entry");
      await deleteQuickBooksTimeActivity(entry.id, current.SyncToken);
      const next = entries.filter((e) => e.id !== entry.id);
      setEntries(next);
      saveEntries(next);
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

  return (
    <Card className="rounded-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>TimeStAMP payroll test</CardTitle>
          <div className="flex items-center gap-3">
            {entries.length > 0 && (
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                {entries.length} test {entries.length === 1 ? "entry" : "entries"} to delete
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
            Sends one small test time entry to QuickBooks so you can check that payroll picks it up.
            Delete it when you are done.
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
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={loadingEmployees}
              >
                <option value="">{loadingEmployees ? "Loading..." : "Pick an employee"}</option>
                {employees.map((e) => (
                  <option key={e.Id} value={e.Id}>
                    {e.DisplayName}
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
            disabled={!employeeId || !date}
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

          {entries.length > 0 && (
            <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <ol className="list-decimal pl-5 space-y-1 text-sm text-neutral-700 dark:text-neutral-200">
                <li>In QuickBooks, open Payroll and start a pay run.</li>
                <li>Find the employee below. The test hours should be there.</li>
                <li>Leave the pay run without submitting it.</li>
                <li>Come back here and delete the test entry.</li>
              </ol>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-neutral-200 dark:border-neutral-700 p-3"
                >
                  <span className="text-sm">
                    {entry.employeeName} · {entry.date} · {entry.hours.toFixed(2)} h · QuickBooks ID{" "}
                    {entry.id}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(entry)}
                    isLoading={deletingId === entry.id}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  >
                    Delete from QuickBooks
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default QuickBooksTimeEntryTest;
