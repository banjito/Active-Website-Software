import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  exportReports,
  listSavedReports,
  OFFLINE_JOB_ID,
  type SavedReport,
} from "./offlineReports";
import { AVAILABLE, categoryOf } from "./ReportListPage";
import type { ReportEntry } from "./reportRegistry";
import {
  cleanReportName,
  formatDate,
  Icon,
  ICONS,
  initials,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  TopBar,
} from "./ShellChrome";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  ready_for_review: "Ready for review",
};

/**
 * Most-used report types company-wide (Sept 2026 count). Quick start leads with
 * what this computer uses most, then fills in from this list.
 */
const COMPANY_TOP_SLUGS = [
  "lv-molded-case-circuit-breaker-ats25",
  "panelboard-assemblies-ats25",
  "low-voltage-cable-test-12sets",
  "metal-enclosed-busway",
  "low-voltage-circuit-breaker-electronic-trip-mts-report",
  "switchgear-switchboard-assemblies-ats25",
];
const QUICK_START_COUNT = 5;

const COLLAPSED_KEY = "amp-offline-saved-reports-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Remembering the toggle is a convenience; ignore storage failures.
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Small line above the greeting. A new one each time the home screen opens. */
const HYPE_LINES = [
  "Let's rock and roll.",
  "Rise and grind.",
  "Let's get it.",
  "Stay grounded.",
  "It's erryday, bruh.",
  "Another day, another breaker.",
  "Lookin' good.",
  "Drop it like it's hawt.",
  "Lock out and tag out, baby.",
  "High voltage!",
  "Let's trip some breakers.",
  "Good vibes only.",
  "Plug er' in.",
  "Insulation resistance is futile.",
  "Megger time.",
  "Shake and bake.",
];
const LAST_HYPE_KEY = "amp-offline-last-hype-line";

function pickHypeLine(): string {
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST_HYPE_KEY) ?? -1);
  } catch {
    // Storage blocked: a repeat now and then is fine.
  }
  let i = Math.floor(Math.random() * HYPE_LINES.length);
  if (i === last) i = (i + 1) % HYPE_LINES.length;
  try {
    localStorage.setItem(LAST_HYPE_KEY, String(i));
  } catch {
    // Same as above.
  }
  return HYPE_LINES[i];
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return formatDate(iso);
}

const DAY_GROUPS = ["Today", "Yesterday", "This week", "Earlier"] as const;

function dayGroup(iso?: string | null): (typeof DAY_GROUPS)[number] {
  if (!iso) return "Earlier";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor(
    (startOfToday.getTime() - new Date(iso).getTime()) / 86400000,
  );
  if (days < 0) return "Today";
  if (days < 1) return "Yesterday";
  if (days < 6) return "This week";
  return "Earlier";
}

/** Home screen: hero + stats, quick start tiles, and the collapsible saved-reports list. */
export default function SavedReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [hypeLine] = useState(pickHypeLine);
  const searchRef = useRef<HTMLInputElement>(null);
  // Export mode: rows become checkboxes and a bar at the bottom exports them.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await listSavedReports());
    } catch (err) {
      console.error("Failed to load saved reports:", err);
      setLoadError("Could not load saved reports from this computer.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const startSelecting = () => {
    setSelecting(true);
    setCollapsed(false);
    writeCollapsed(false);
  };

  const toggleSelected = (assetId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });

  // Esc leaves export mode.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const handleExport = async () => {
    if (!selected.size) return;
    setExporting(true);
    try {
      const res = await exportReports([...selected]);
      if (res.ok) {
        toast.success(
          `Exported ${res.count} report${res.count === 1 ? "" : "s"}. In ampOS, open the job and use Upload Offline Report.`,
          { duration: 6000 },
        );
        if (res.skipped?.length) {
          toast(`Left out ${res.skipped.length} with nothing saved yet: ${res.skipped.join(", ")}`, {
            duration: 6000,
          });
        }
        stopSelecting();
        await load();
      } else if (res.error !== "canceled") {
        toast.error(res.error || "Export failed.");
      }
    } finally {
      setExporting(false);
    }
  };

  // "/" jumps to search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if (e.key !== "/" || typing || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      setCollapsed(false);
      writeCollapsed(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  };

  const all = reports ?? [];
  const q = query.trim().toLowerCase();
  const isOpen = !collapsed || !!q;

  const groups = useMemo(() => {
    const matches = q
      ? all.filter((r) => `${r.name} ${r.reportTypeName}`.toLowerCase().includes(q))
      : all;
    return DAY_GROUPS.map((label) => ({
      label,
      items: matches.filter((r) => dayGroup(r.created_at) === label),
    })).filter((g) => g.items.length > 0);
  }, [all, q]);
  const matchCount = groups.reduce((n, g) => n + g.items.length, 0);

  const stats = useMemo(
    () => ({
      total: all.length,
      inProgress: all.filter((r) => r.status !== "ready_for_review").length,
      ready: all.filter((r) => r.status === "ready_for_review").length,
      last: relativeTime(all[0]?.created_at) || "None yet",
    }),
    [all],
  );

  const quickStart = useMemo(() => {
    const uses = new Map<string, number>();
    for (const r of all) uses.set(r.slug, (uses.get(r.slug) ?? 0) + 1);
    const ranked = [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
    const slugs = [...new Set([...ranked, ...COMPANY_TOP_SLUGS])];
    return slugs
      .map((slug) => AVAILABLE.find((r) => r.slug === slug))
      .filter((r): r is ReportEntry => !!r)
      .slice(0, QUICK_START_COUNT)
      .map((entry) => ({ entry, uses: uses.get(entry.slug) ?? 0 }));
  }, [all]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar
        actions={
          <button onClick={() => navigate("/new")} className={primaryButtonClass}>
            <Icon d={ICONS.plus} />
            New report
          </button>
        }
      />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(var(--brand-rgb) / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--brand-rgb) / 0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse at 15% 0%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 15% 0%, black 30%, transparent 75%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-10">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            <span className="h-2 w-2 rounded-none bg-brand" />
            {hypeLine}
          </p>
          <h2 className="font-bitcount mt-3 text-4xl sm:text-6xl">
            {greeting()}.
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-px border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 sm:grid-cols-4">
            <Stat label="Saved reports" value={reports ? stats.total : "…"} />
            <Stat label="In progress" value={reports ? stats.inProgress : "…"} />
            <Stat label="Ready for review" value={reports ? stats.ready : "…"} accent={stats.ready > 0} />
            <Stat label="Last started" value={reports ? stats.last : "…"} small />
          </div>
        </div>
      </div>

      <main className={`mx-auto max-w-6xl px-6 py-8 ${selecting ? "pb-28" : ""}`}>
        {loadError && <p className="mb-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

        {/* Quick start */}
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Start a report
              </h3>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {all.length ? "Most used reports..." : "The most used report types"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickStart.map(({ entry, uses }) => (
              <button
                key={entry.slug}
                onClick={() => navigate(`/jobs/${OFFLINE_JOB_ID}/${entry.slug}`)}
                className="group relative flex items-center gap-4 overflow-hidden rounded-none border border-neutral-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg hover:shadow-brand/10 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100" />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-brand/10 text-sm font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  {initials(entry.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">
                    {cleanReportName(entry.name)}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <TypeTag name={entry.name} />
                    {uses > 0 && <span>Used {uses}×</span>}
                  </span>
                </span>
                <span className="text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-brand dark:text-neutral-600">
                  <Icon d={ICONS.chevron} />
                </span>
              </button>
            ))}
            <button
              onClick={() => navigate("/new")}
              className="group flex items-center justify-center gap-2 rounded-none border border-dashed border-neutral-300 p-4 text-sm font-medium text-neutral-600 transition hover:border-brand hover:bg-brand/5 hover:text-brand dark:border-neutral-700 dark:text-neutral-300"
            >
              Browse all {AVAILABLE.length} report types
              <span className="transition group-hover:translate-x-0.5">
                <Icon d={ICONS.chevron} />
              </span>
            </button>
          </div>
        </section>

        {/* Saved reports (collapsible) */}
        <section className="border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              onClick={toggleCollapsed}
              aria-expanded={isOpen}
              aria-controls="saved-reports-panel"
              className="group -mx-1 flex flex-1 items-center gap-3 rounded-none px-1 py-1 text-left"
            >
              <span
                className={`text-neutral-400 transition-transform duration-200 group-hover:text-brand ${isOpen ? "rotate-90" : ""}`}
              >
                <Icon d={ICONS.chevron} />
              </span>
              <span className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Saved reports
              </span>
              <span className="rounded-none bg-neutral-100 px-2 py-0.5 text-xs font-medium tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {q ? `${matchCount} of ${all.length}` : all.length}
              </span>
            </button>
            {all.length > 0 && !selecting && (
              <button onClick={startSelecting} className={secondaryButtonClass}>
                <Icon d={ICONS.export} />
                Export
              </button>
            )}
            {all.length > 0 && (
              <div className="relative w-full sm:w-72">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <Icon d={ICONS.search} />
                </span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search saved reports"
                  className={`${inputClass} py-1.5 pl-9 pr-9`}
                />
                {!query && (
                  <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-none border border-neutral-300 px-1.5 text-[10px] font-medium text-neutral-400 dark:border-neutral-700">
                    /
                  </kbd>
                )}
              </div>
            )}
          </div>

          <div
            id="saved-reports-panel"
            className={`grid transition-[grid-template-rows,visibility] duration-300 ease-out ${isOpen ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-neutral-200 dark:border-neutral-800">
                {reports && all.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    Nothing saved yet. Start a report above and it shows up here.
                  </p>
                )}
                {q && matchCount === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-neutral-500">
                    No reports match “{query}”.
                  </p>
                )}
                {groups.map((group) => (
                  <div key={group.label}>
                    <p className="bg-neutral-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:bg-neutral-950/60 dark:text-neutral-400">
                      {group.label}
                    </p>
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {group.items.map((r) => (
                        <li key={r.assetId}>
                          <ReportRow
                            report={r}
                            selecting={selecting}
                            checked={selected.has(r.assetId)}
                            onOpen={() =>
                              selecting ? toggleSelected(r.assetId) : navigate(r.route)
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-sm font-semibold tabular-nums">{selected.size} selected</span>
            <button
              onClick={() => setSelected(new Set(all.map((r) => r.assetId)))}
              className="text-sm text-brand hover:underline"
            >
              Select all
            </button>
            <button
              onClick={() =>
                setSelected(new Set(all.filter((r) => !r.exported_at).map((r) => r.assetId)))
              }
              className="text-sm text-brand hover:underline"
            >
              Not yet exported
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-sm text-neutral-500 hover:underline"
              >
                Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={stopSelecting} className={secondaryButtonClass}>
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!selected.size || exporting}
                className={primaryButtonClass}
              >
                <Icon d={ICONS.export} />
                {exporting
                  ? "Exporting…"
                  : `Export ${selected.size || ""} report${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-4 dark:bg-neutral-900">
      <div
        className={`font-bold tabular-nums tracking-tight ${small ? "pt-1.5 text-lg" : "text-3xl"} ${accent ? "text-green-600 dark:text-green-400" : ""}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  );
}

function TypeTag({ name }: { name: string }) {
  const cat = categoryOf(name);
  const label = cat === "Acceptance Testing" ? "ATS" : cat === "Maintenance Testing" ? "MTS" : "Other";
  return (
    <span className="rounded-none border border-neutral-200 px-1.5 py-px text-[10px] font-semibold tracking-wider text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {label}
    </span>
  );
}

function ReportRow({
  report,
  onOpen,
  selecting,
  checked,
}: {
  report: SavedReport;
  onOpen: () => void;
  selecting: boolean;
  checked: boolean;
}) {
  const ready = report.status === "ready_for_review";
  return (
    <button
      onClick={onOpen}
      role={selecting ? "checkbox" : undefined}
      aria-checked={selecting ? checked : undefined}
      className={`group relative flex w-full items-center gap-4 rounded-none px-4 py-3 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${checked ? "bg-brand/5 dark:bg-brand/10" : ""}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 transition-colors ${checked ? "bg-brand" : ready ? "bg-green-500" : "bg-transparent group-hover:bg-brand"}`}
      />
      {selecting ? (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-2 transition-colors ${checked ? "border-brand bg-brand text-white" : "border-neutral-300 text-transparent group-hover:border-brand dark:border-neutral-600"}`}
        >
          <Icon d={ICONS.check} className="h-5 w-5" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-neutral-100 text-[11px] font-bold text-neutral-600 transition-colors group-hover:bg-brand group-hover:text-white dark:bg-neutral-800 dark:text-neutral-300">
          {initials(report.reportTypeName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{report.name}</div>
        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {cleanReportName(report.reportTypeName)}
          {report.created_at && ` · Started ${relativeTime(report.created_at)}`}
        </div>
      </div>
      {report.status && (
        <span
          className={
            "hidden shrink-0 rounded-none px-2 py-0.5 text-xs font-medium sm:inline " +
            (ready
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300")
          }
        >
          {STATUS_LABELS[report.status] ?? report.status}
        </span>
      )}
      {report.exported_at && (
        <span
          title={`Exported ${formatDate(report.exported_at)}`}
          className="hidden shrink-0 items-center gap-1 rounded-none border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500 sm:flex dark:border-neutral-700 dark:text-neutral-400"
        >
          <Icon d={ICONS.check} className="h-3 w-3" />
          Exported
        </span>
      )}
      {!selecting && (
        <span className="flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
          Open
          <Icon d={ICONS.chevron} />
        </span>
      )}
    </button>
  );
}
