import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { companyConfig } from "@/lib/companyConfig";
import { engineeringJobPath, UNDEFINED_COLUMN } from "@/lib/engineering/engineeringCompany";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ce, chipClass } from "./engineeringTheme";

/** ?company=ce shows C&E jobs; anything else shows AMP's. */
export const COMPANY_PARAM = "company";

interface EngineeringJob {
  /** true = C&E job, false = AMP. */
  engineering_company: boolean;
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
  location: string | null;
  site_address: string | null;
  customer_id: string | null;
  project_manager_id: string | null;
  customerName: string;
  pmName: string | null;
}

type StatusGroup = "open" | "hold" | "done" | "cancelled";
type Filter = "all" | Exclude<StatusGroup, "cancelled">;

/** Label, step on the 4-step bar (0 = off the track) and filter group. */
export const STATUS: Record<string, { label: string; step: number; group: StatusGroup }> = {
  pending: { label: "Pending", step: 1, group: "open" },
  in_progress: { label: "In progress", step: 2, group: "open" },
  completed: { label: "Completed", step: 3, group: "done" },
  ready_to_bill: { label: "Ready to bill", step: 3, group: "done" },
  progress_billing: { label: "Progress billing", step: 3, group: "done" },
  billed: { label: "Billed", step: 4, group: "done" },
  on_hold: { label: "On hold", step: 0, group: "hold" },
  cancelled: { label: "Cancelled", step: 0, group: "cancelled" },
};
export const STEPS = 4;

export const statusOf = (s: string | null) => STATUS[s ?? "pending"] ?? STATUS.pending;

/** Filled steps are orange, and turn green once every step is done (billed). */
export const stepFill = (st: { step: number }) =>
  st.step === STEPS ? "bg-green-600 dark:bg-green-500" : "bg-brand";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "hold", label: "On hold" },
  { id: "done", label: "Done" },
];

const COLUMNS =
  "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.8fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_120px_64px]";

/** Days from today to a YYYY-MM-DD date, read as a local date. */
function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}

export function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return due.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

function dueNote(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "due today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export default function EngineeringJobsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showCe = searchParams.get(COMPANY_PARAM) === "ce";
  const [allJobs, setAllJobs] = useState<EngineeringJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pmFilter, setPmFilter] = useState("");

  const loadJobs = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const query = (cols: string) =>
        supabase
          .schema("neta_ops")
          .from("jobs")
          .select(cols)
          .eq("division", "engineering")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
      const columns =
        "id, job_number, title, status, due_date, location, site_address, customer_id, project_manager_id";
      let { data, error }: { data: any[] | null; error: any } = await query(
        `${columns}, engineering_company`,
      );
      // Before the migration runs every job is AMP.
      if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await query(columns));
      if (error) throw error;
      const rows = data || [];

      const customerIds = [...new Set(rows.map((j) => j.customer_id).filter(Boolean))];
      const pmIds = [...new Set(rows.map((j) => j.project_manager_id).filter(Boolean))];
      const [customersRes, pmsRes] = await Promise.all([
        customerIds.length
          ? supabase
              .schema("common")
              .from("customers")
              .select("id, name, company_name")
              .in("id", customerIds)
          : Promise.resolve({ data: [], error: null }),
        pmIds.length
          ? supabase
              .schema("common")
              .from("profiles")
              .select("id, full_name, email")
              .in("id", pmIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      // Names are nice-to-have; a failed lookup still shows the jobs.
      if (customersRes.error) console.warn("Error loading customers:", customersRes.error);
      if (pmsRes.error) console.warn("Error loading project managers:", pmsRes.error);

      const customerName = new Map(
        (customersRes.data || []).map((c: any) => [c.id, c.company_name || c.name || ""]),
      );
      const pmName = new Map(
        (pmsRes.data || []).map((p: any) => [p.id, (p.full_name || "").trim() || p.email]),
      );

      setAllJobs(
        rows.map((j) => ({
          ...j,
          engineering_company: !!j.engineering_company,
          customerName: (j.customer_id && customerName.get(j.customer_id)) || "",
          pmName: (j.project_manager_id && pmName.get(j.project_manager_id)) || null,
        })),
      );
    } catch (err) {
      console.error("Error loading engineering jobs:", err);
      setLoadError("Could not load engineering jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const jobs = useMemo(
    () => allJobs.filter((j) => j.engineering_company === showCe),
    [allJobs, showCe],
  );
  const ceCount = useMemo(() => allJobs.filter((j) => j.engineering_company).length, [allJobs]);

  const companies = [
    { ce: false, label: `${companyConfig.name} jobs`, count: allJobs.length - ceCount },
    { ce: true, label: `${companyConfig.engineeringName} jobs`, count: ceCount },
  ];

  const pickCompany = (ce: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (ce) next.set(COMPANY_PARAM, "ce");
    else next.delete(COMPANY_PARAM);
    setSearchParams(next, { replace: true });
    setPmFilter("");
  };

  const stats = useMemo(() => {
    const open = jobs.filter((j) => statusOf(j.status).group === "open");
    const dated = open
      .filter((j) => j.due_date)
      .map((j) => ({ job: j, days: daysUntil(j.due_date!) }));
    const dueSoon = dated
      .filter((d) => d.days >= 0 && d.days <= 7)
      .sort((a, b) => a.days - b.days);
    return {
      open: open.length,
      pending: open.filter((j) => (j.status ?? "pending") === "pending").length,
      inProgress: open.filter((j) => j.status === "in_progress").length,
      dueSoon: dueSoon.length,
      next: dueSoon[0]?.job,
      overdue: dated.filter((d) => d.days < 0).length,
    };
  }, [jobs]);

  const pmOptions = useMemo(
    () =>
      [...new Set(jobs.map((j) => j.pmName).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [jobs],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: jobs.length, open: 0, hold: 0, done: 0 };
    jobs.forEach((j) => {
      const g = statusOf(j.status).group;
      if (g !== "cancelled") c[g] += 1;
    });
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter !== "all" && statusOf(j.status).group !== filter) return false;
      if (pmFilter && j.pmName !== pmFilter) return false;
      if (!q) return true;
      return [j.job_number, j.title, j.customerName, j.location, j.site_address, j.pmName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [jobs, filter, search, pmFilter]);

  const openJob = (id: string) => navigate(engineeringJobPath(id));

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`border ${ce.border} p-8 text-center`}>
        <p className={`text-sm ${ce.muted}`}>{loadError}</p>
        <button type="button" onClick={loadJobs} className={`${ce.ghostButton} mt-4 h-10 px-4`}>
          Try again
        </button>
      </div>
    );
  }

  const statCells = [
    { label: "Open jobs", value: stats.open, note: `${stats.pending} not started` },
    { label: "In progress", value: stats.inProgress, note: "being worked" },
    {
      label: "Due in 7 days",
      value: stats.dueSoon,
      note: stats.next
        ? `next: ${stats.next.job_number || stats.next.title || "job"}, ${formatDue(stats.next.due_date!)}`
        : "nothing due",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      note: "open, past due date",
      accent: stats.overdue > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Company" className="flex flex-wrap">
        {companies.map((c, i) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={showCe === c.ce}
            onClick={() => pickCompany(c.ce)}
            className={`${chipClass(showCe === c.ce)} ${i > 0 ? "-ml-px" : ""}`}
          >
            {c.label}
            <span className="font-mono text-xs font-medium">{c.count}</span>
          </button>
        ))}
      </div>

      <div
        className={`grid grid-cols-2 md:grid-cols-4 border ${ce.border} ${ce.surface} ${ce.shadow}`}
      >
        {statCells.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-1.5 px-6 py-5 ${ce.border} ${
              i === 3 ? "" : i % 2 === 0 ? "border-r" : "md:border-r"
            } ${i < 2 ? "border-b md:border-b-0" : ""}`}
          >
            <div className={`${ce.eyebrow} ${ce.muted}`}>{s.label}</div>
            <div className={`text-3xl font-bold leading-[38px] ${s.accent ? ce.accentInk : ""}`}>
              {s.value}
            </div>
            <div className={`font-mono text-xs ${ce.muted}`}>{s.note}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={chipClass(filter === f.id)}
            >
              {f.label}
              <span className="font-mono text-xs font-medium">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex items-center">
            <Search className={`pointer-events-none absolute left-3 h-4 w-4 ${ce.muted}`} aria-hidden />
            <input
              type="search"
              aria-label="Search jobs"
              placeholder="Search jobs, customers, sites"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${ce.field} w-[300px] max-w-full pl-[38px] pr-3`}
            />
          </div>
          <select
            aria-label="Project manager"
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            className={`${ce.field} px-3`}
          >
            <option value="">All PMs</option>
            {pmOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`overflow-x-auto border ${ce.border} ${ce.surface} ${ce.shadow}`}>
        <div role="table" aria-label="Engineering jobs" className="min-w-[960px]">
          <div
            role="row"
            className={`${COLUMNS} border-b ${ce.border} ${ce.surfaceAlt} text-xs font-semibold uppercase tracking-[0.1em] ${ce.muted}`}
          >
            <div role="columnheader" className="px-4 py-3">Job</div>
            <div role="columnheader" className="px-4 py-3">Customer · Site</div>
            <div role="columnheader" className="px-4 py-3">PM</div>
            <div role="columnheader" className="px-4 py-3">Status</div>
            <div role="columnheader" className="px-4 py-3">Due</div>
            <div role="columnheader" className="px-4 py-3">
              <span className="sr-only">Open</span>
            </div>
          </div>

          {visible.map((job) => {
            const st = statusOf(job.status);
            const isOpen = st.group === "open";
            const days = job.due_date ? daysUntil(job.due_date) : null;
            const showNote = isOpen && days !== null && days <= 7;
            const site = job.location || job.site_address;
            return (
              <div
                key={job.id}
                role="row"
                onClick={() => openJob(job.id)}
                className={`${COLUMNS} cursor-pointer items-center border-b last:border-b-0 ${ce.border} ${ce.hoverAlt}`}
              >
                <div role="cell" className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5">
                  <span className={`font-mono text-xs ${ce.muted}`}>{job.job_number || "No job #"}</span>
                  <span className="truncate text-[15px] font-semibold leading-[22px]">
                    {job.title || "Untitled job"}
                  </span>
                </div>
                <div role="cell" className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5">
                  <span className="truncate text-sm">{job.customerName || "—"}</span>
                  {site && <span className={`truncate text-[13px] ${ce.muted}`}>{site}</span>}
                </div>
                <div role="cell" className="flex min-w-0 items-center gap-2.5 px-4 py-3.5">
                  {job.pmName ? (
                    <>
                      <span
                        aria-hidden
                        className={`flex h-7 w-7 shrink-0 items-center justify-center border font-mono text-[11px] font-medium ${ce.border} ${ce.surfaceAlt}`}
                      >
                        {initials(job.pmName)}
                      </span>
                      <span className="truncate text-sm">{job.pmName}</span>
                    </>
                  ) : (
                    <span className={`text-sm ${ce.muted}`}>No PM</span>
                  )}
                </div>
                <div role="cell" className="flex flex-col gap-1.5 px-4 py-3.5">
                  <div className="flex items-center gap-[3px]" aria-hidden>
                    {Array.from({ length: STEPS }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-[26px] ${i < st.step ? stepFill(st) : ce.segmentOff}`}
                      />
                    ))}
                    <span className={`ml-1.5 font-mono text-xs ${ce.muted}`}>
                      {st.step ? `${st.step}/${STEPS}` : "—"}
                    </span>
                  </div>
                  <span className="text-[13px]">{st.label}</span>
                </div>
                <div role="cell" className="flex flex-col gap-0.5 px-4 py-3.5">
                  <span className="font-mono text-[13px]">
                    {job.due_date ? formatDue(job.due_date) : "—"}
                  </span>
                  {showNote && (
                    <span className={`text-xs font-semibold ${ce.accentInk}`}>{dueNote(days!)}</span>
                  )}
                </div>
                <div role="cell" className="flex justify-end px-4 py-3.5">
                  <button
                    type="button"
                    aria-label={`Open ${job.job_number || job.title || "job"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openJob(job.id);
                    }}
                    className={`${ce.ghostButton} h-9 w-9`}
                  >
                    <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className={`px-4 py-12 text-center text-sm ${ce.muted}`}>
              {jobs.length === 0
                ? `No ${showCe ? companyConfig.engineeringName : companyConfig.name} engineering jobs yet.`
                : "No jobs match this filter."}
            </div>
          )}
        </div>
      </div>

      <p className={`text-sm ${ce.muted}`}>
        Showing {visible.length} of {jobs.length} jobs
      </p>
    </div>
  );
}
