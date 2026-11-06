/**
 * Admin Dashboard → Report time. How long people actually spend in each report,
 * counted in the background while a report is open and being edited
 * (src/lib/useReportTimer.ts). Data: database/migrations/report_time.sql.
 */
import React, { useEffect, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { REPORT_NAMES } from "@/components/reports/reportMappings";

interface ByType {
  report_type: string;
  reports: number;
  people: number;
  median_minutes: number | null;
  p75_minutes: number | null;
  median_open_minutes: number | null;
  total_hours: number | null;
}

interface ByPerson {
  user_id: string;
  full_name: string | null;
  reports: number;
  median_minutes: number | null;
  total_hours: number | null;
}

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const TH = "px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400";
const TD = "px-3 py-2";
const NUM = "px-3 py-2 text-right tabular-nums";

const reportName = (slug: string) =>
  REPORT_NAMES[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const minutes = (n: number | null) => (n == null ? "" : `${Number(n).toLocaleString()} min`);

const sinceDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// Quote every cell, and stop spreadsheet apps from running a cell that starts like a formula.
function csvCell(value: string | number | null | undefined) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const PAGE = 1000;

/**
 * One row per report per person for the range: minutes active and open, when they
 * started and last worked on it, and how many times they opened it.
 */
async function exportCsv(days: number) {
  const since = sinceDate(days);
  const sessions: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .schema("common")
      .from("report_time_sessions")
      .select("user_id, job_id, report_type, report_id, started_at, last_seen_at, active_seconds, open_seconds")
      .gte("started_at", since)
      .not("report_id", "is", null)
      .order("started_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    sessions.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  if (sessions.length === 0) throw new Error("Nothing to export for this range yet.");

  const userIds = [...new Set(sessions.map((r) => r.user_id))];
  const jobIds = [...new Set(sessions.map((r) => r.job_id).filter(Boolean))];
  const names = new Map<string, string>();
  const jobs = new Map<string, { number: string; title: string }>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase.schema("common").from("profiles").select("id, full_name, email").in("id", userIds.slice(i, i + 200));
    for (const p of data ?? []) names.set(p.id, p.full_name || p.email || "");
  }
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data } = await supabase.schema("neta_ops").from("jobs").select("id, job_number, title").in("id", jobIds.slice(i, i + 200));
    for (const j of data ?? []) jobs.set(j.id, { number: j.job_number ?? "", title: j.title ?? "" });
  }

  // Combine sessions into one row per report per person
  const rows = new Map<string, any>();
  for (const s of sessions) {
    const key = `${s.report_type}|${s.report_id}|${s.user_id}`;
    const row = rows.get(key) ?? {
      ...s,
      active_seconds: 0,
      open_seconds: 0,
      sessions: 0,
      first: s.started_at,
      last: s.last_seen_at,
    };
    row.active_seconds += s.active_seconds;
    row.open_seconds += s.open_seconds;
    row.sessions += 1;
    if (s.started_at < row.first) row.first = s.started_at;
    if (s.last_seen_at > row.last) row.last = s.last_seen_at;
    rows.set(key, row);
  }

  const header = [
    "Report type", "Report", "Job number", "Job", "Person", "Active minutes", "Open minutes",
    "Times opened", "First opened", "Last worked", "Report ID",
  ];
  const lines = [...rows.values()]
    .sort((a, b) => a.first.localeCompare(b.first))
    .map((r) => {
      const job = jobs.get(r.job_id);
      return [
        r.report_type,
        reportName(r.report_type),
        job?.number ?? "",
        job?.title ?? "",
        names.get(r.user_id) ?? "",
        Math.round((r.active_seconds / 60) * 10) / 10,
        Math.round((r.open_seconds / 60) * 10) / 10,
        r.sessions,
        new Date(r.first).toLocaleString(),
        new Date(r.last).toLocaleString(),
        r.report_id,
      ]
        .map(csvCell)
        .join(",");
    });

  const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-time-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportTimeCard() {
  const [days, setDays] = useState(90);
  const [byType, setByType] = useState<ByType[]>([]);
  const [byPerson, setByPerson] = useState<ByPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      await exportCsv(days);
    } catch (e: any) {
      toast({ title: "Couldn't export", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = sinceDate(days);
    Promise.all([
      supabase.schema("common").rpc("report_time_by_type", { p_since: since }),
      supabase.schema("common").rpc("report_time_by_person", { p_since: since }),
    ])
      .then(([t, p]) => {
        if (cancelled) return;
        const err = t.error ?? p.error;
        if (err) {
          setError(
            err.code === "PGRST202" || err.code === "42883"
              ? "Run database/migrations/report_time.sql to start counting."
              : err.message,
          );
          return;
        }
        setByType((t.data ?? []) as ByType[]);
        setByPerson((p.data ?? []) as ByPerson[]);
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Could not load report time"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
          Time spent in each report, counted in the background while a report is open, on screen and
          being edited. Active time stops after 5 minutes without a touch. Only saved reports with at
          least a minute count.
        </p>
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              role="radio"
              aria-checked={days === r.days}
              onClick={() => setDays(r.days)}
              className={`-ml-px border px-3 py-1.5 text-sm first:ml-0 ${
                days === r.days
                  ? "relative z-10 border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download className="h-4 w-4" />}
          isLoading={exporting}
          disabled={loading || !!error || byType.length === 0}
          onClick={onExport}
        >
          Export CSV
        </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      ) : byType.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nothing counted yet. Numbers show up as people fill in reports.
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">By report type</h2>
            <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className={TH}>Report</th>
                    <th className={`${TH} text-right`}>Reports</th>
                    <th className={`${TH} text-right`}>Typical</th>
                    <th className={`${TH} text-right`}>Slow ones</th>
                    <th className={`${TH} text-right`}>Open (typical)</th>
                    <th className={`${TH} text-right`}>People</th>
                    <th className={`${TH} text-right`}>Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((r) => (
                    <tr key={r.report_type} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className={`${TD} text-neutral-900 dark:text-white`}>{reportName(r.report_type)}</td>
                      <td className={NUM}>{r.reports}</td>
                      <td className={`${NUM} font-medium text-neutral-900 dark:text-white`}>{minutes(r.median_minutes)}</td>
                      <td className={NUM}>{minutes(r.p75_minutes)}</td>
                      <td className={`${NUM} text-neutral-500 dark:text-neutral-400`}>{minutes(r.median_open_minutes)}</td>
                      <td className={NUM}>{r.people}</td>
                      <td className={NUM}>{r.total_hours ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Typical is the middle report; slow ones is the 75th percentile. Open counts all time on screen
              in edit mode, touched or not.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">By person</h2>
            <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className={TH}>Name</th>
                    <th className={`${TH} text-right`}>Reports</th>
                    <th className={`${TH} text-right`}>Typical</th>
                    <th className={`${TH} text-right`}>Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {byPerson.map((p) => (
                    <tr key={p.user_id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className={`${TD} text-neutral-900 dark:text-white`}>{p.full_name || "Unknown"}</td>
                      <td className={NUM}>{p.reports}</td>
                      <td className={NUM}>{minutes(p.median_minutes)}</td>
                      <td className={NUM}>{p.total_hours ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
