import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/components/theme/theme-provider";
import { REPORTS, type ReportEntry } from "./reportRegistry";
import logoUrl from "./assets/ampOSOFFLINE.svg";

/** Light/dark toggle. A global app CSS rule hides <header>/[class*=header],
 *  so the shell deliberately uses plain <div>s for its top bar. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:border-amp-orange-400 hover:text-amp-orange-600 dark:border-neutral-700 dark:text-neutral-300"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

/** Bucket a report by its display name into a coarse category. */
function categoryOf(name: string): string {
  if (/\bMTS\b/.test(name)) return "Maintenance Testing";
  if (/\bATS\b/.test(name)) return "Acceptance Testing";
  return "Other Reports";
}

const CATEGORY_META: Record<string, { abbr: string }> = {
  "Acceptance Testing": { abbr: "ATS" },
  "Maintenance Testing": { abbr: "MTS" },
  "Other Reports": { abbr: "—" },
};
const CATEGORY_ORDER = [
  "Acceptance Testing",
  "Maintenance Testing",
  "Other Reports",
];

/** A short initialism for a report, shown in the card's accent tile. */
function initials(name: string): string {
  const cleaned = name.replace(/^[0-9.\-\s]+/, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "R").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

export default function ReportListPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = REPORTS.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (activeCat && categoryOf(r.name) !== activeCat) return false;
      return true;
    });
    const byCat = new Map<string, ReportEntry[]>();
    for (const r of filtered) {
      const cat = categoryOf(r.name);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(r);
    }
    for (const list of byCat.values())
      list.sort((a, b) => a.name.localeCompare(b.name));
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      category: c,
      items: byCat.get(c)!,
    }));
  }, [query, activeCat]);

  const total = REPORTS.length;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Top bar — plain <div> (a global app rule hides <header> elements). */}
      <div className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/85 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/85">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="sr-only">ampOS Offline</h1>
              <img
                src={logoUrl}
                alt="ampOS Offline"
                className="h-8 w-auto dark:invert"
              />
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {total} report types · works fully offline · saved locally
              </p>
            </div>
            <ThemeToggle />
          </div>

          {/* Search + category filter */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports…"
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-amp-orange-500 focus:ring-2 focus:ring-amp-orange-500/30 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <div className="flex gap-1.5">
              <FilterChip
                label="All"
                active={activeCat === null}
                onClick={() => setActiveCat(null)}
              />
              {CATEGORY_ORDER.map((c) => (
                <FilterChip
                  key={c}
                  label={CATEGORY_META[c].abbr}
                  active={activeCat === c}
                  onClick={() => setActiveCat(activeCat === c ? null : c)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {groups.length === 0 && (
          <p className="text-sm text-neutral-500">No reports match “{query}”.</p>
        )}
        {groups.map(({ category, items }) => (
          <section key={category} className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-4 w-1 rounded-full bg-amp-orange-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                {category}
              </h2>
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {items.length}
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <li key={r.slug}>
                  <button
                    onClick={() => navigate(`/jobs/offline/${r.slug}`)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amp-orange-400 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-amp-orange-600"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amp-orange-50 text-xs font-bold text-amp-orange-700 transition-colors group-hover:bg-amp-orange-600 group-hover:text-white dark:bg-neutral-800 dark:text-amp-orange-500">
                      {initials(r.name)}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-100">
                      {r.name}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-amp-orange-600 dark:text-neutral-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-lg px-3 py-2 text-xs font-semibold transition " +
        (active
          ? "bg-amp-orange-600 text-white shadow-sm shadow-amp-orange-700/30"
          : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700")
      }
    >
      {label}
    </button>
  );
}
