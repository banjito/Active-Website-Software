import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { REPORTS, type ReportEntry } from "./reportRegistry";

/** Bucket a report by its display name into a coarse category. */
function categoryOf(name: string): string {
  if (/\bMTS\b/.test(name)) return "Maintenance Testing (MTS)";
  if (/\bATS\b/.test(name)) return "Acceptance Testing (ATS)";
  return "Other Reports";
}

const CATEGORY_ORDER = [
  "Acceptance Testing (ATS)",
  "Maintenance Testing (MTS)",
  "Other Reports",
];

/**
 * Landing page: a searchable, grouped list of every report type. Selecting one
 * opens a new blank report of that type at /jobs/offline/<slug>. The synthetic
 * "offline" job id means the report starts with an empty (editable) header.
 */
export default function ReportListPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = REPORTS.filter((r) =>
      q ? r.name.toLowerCase().includes(q) : true
    );
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
  }, [query]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-8 py-5">
        <h1 className="text-xl font-semibold">AmpOfflineReports</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Select a report to begin. Reports are saved locally and work without
          an internet connection.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports…"
          className="mt-3 w-full max-w-md rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </header>

      <main className="px-8 py-6">
        {groups.length === 0 && (
          <p className="text-neutral-500">No reports match “{query}”.</p>
        )}
        {groups.map(({ category, items }) => (
          <section key={category} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {category}{" "}
              <span className="font-normal text-neutral-400">
                ({items.length})
              </span>
            </h2>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <li key={r.slug}>
                  <button
                    onClick={() => navigate(`/jobs/offline/${r.slug}`)}
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-left text-sm font-medium shadow-sm transition hover:border-blue-400 hover:shadow"
                  >
                    {r.name}
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
