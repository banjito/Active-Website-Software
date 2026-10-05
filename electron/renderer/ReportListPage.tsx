import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { REPORTS, type ReportEntry } from "./reportRegistry";
import { Icon, ICONS, SearchBox, SectionHeading, TopBar } from "./ShellChrome";

/** Bucket a report by its display name into a coarse category. */
function categoryOf(name: string): string {
  if (/\bMTS\b/.test(name)) return "Maintenance Testing";
  if (/\bATS\b/.test(name)) return "Acceptance Testing";
  return "Other Reports";
}

const CATEGORY_META: Record<string, { abbr: string }> = {
  "Acceptance Testing": { abbr: "ATS" },
  "Maintenance Testing": { abbr: "MTS" },
  "Other Reports": { abbr: "Other" },
};
const CATEGORY_ORDER = [
  "Acceptance Testing",
  "Maintenance Testing",
  "Other Reports",
];

/** Report types that have been superseded. They stay in the registry so an
 *  existing saved report still opens by slug, but they are not offered as a
 *  starting point for new work. `switchgear-report` is the 2021 ATS sheet,
 *  replaced by `switchgear-switchboard-assemblies-ats25`. */
const RETIRED_SLUGS = new Set(["switchgear-report"]);

/** The report types a tech can actually start from. */
const AVAILABLE = REPORTS.filter((r) => !RETIRED_SLUGS.has(r.slug));

/** A short initialism for a report, shown in the card's accent tile. */
function initials(name: string): string {
  const cleaned = name.replace(/^[0-9.\-\s]+/, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "R").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

/** Picks a report type to start under the job in the URL (/jobs/:id/new). */
export default function ReportListPage() {
  const { id: jobId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = AVAILABLE.filter((r) => {
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

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar
        back={{ label: "Back to job", to: `/jobs/${jobId}` }}
        subtitle={`New report · ${AVAILABLE.length} report types`}
      >
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search reports…" />
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
      </TopBar>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {groups.length === 0 && (
          <p className="text-sm text-neutral-500">No reports match “{query}”.</p>
        )}
        {groups.map(({ category, items }) => (
          <section key={category} className="mb-10">
            <SectionHeading title={category} count={items.length} />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <li key={r.slug}>
                  <button
                    onClick={() => navigate(`/jobs/${jobId}/${r.slug}`)}
                    className="group flex w-full items-center gap-3 rounded-none border border-neutral-200 bg-white p-3 text-left transition hover:border-brand dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-brand/10 text-xs font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-white dark:bg-neutral-800">
                      {initials(r.name)}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-100">
                      {r.name}
                    </span>
                    <span className="text-neutral-300 transition group-hover:text-brand dark:text-neutral-600">
                      <Icon d={ICONS.chevron} />
                    </span>
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
        "rounded-none px-3 py-2 text-xs font-semibold transition " +
        (active
          ? "bg-brand text-white"
          : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700")
      }
    >
      {label}
    </button>
  );
}
