import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import JobFormDialog from "./JobFormDialog";
import { listJobs, reportCountsByJob, UNASSIGNED_JOB_ID, type OfflineJob } from "./offlineJobs";
import {
  Icon,
  ICONS,
  primaryButtonClass,
  SearchBox,
  SectionHeading,
  TopBar,
} from "./ShellChrome";

/** Home screen: the jobs on this computer. Reports always belong to a job. */
export default function JobListPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OfflineJob[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listJobs(), reportCountsByJob()])
      .then(([j, c]) => {
        if (cancelled) return;
        setJobs(j);
        setCounts(c);
      })
      .catch((err) => {
        console.error("Failed to load jobs:", err);
        if (!cancelled) setLoadError("Could not load jobs from this computer.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!jobs) return [];
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.job_number, j.title, j.customerName, j.site_address]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [jobs, query]);

  const unassignedCount = counts.get(UNASSIGNED_JOB_ID) ?? 0;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar
        subtitle="Works fully offline · saved on this computer"
        actions={
          <button onClick={() => setCreating(true)} className={primaryButtonClass}>
            <Icon d={ICONS.plus} />
            New job
          </button>
        }
      >
        {jobs && jobs.length > 0 && (
          <div className="mt-4">
            <SearchBox value={query} onChange={setQuery} placeholder="Search jobs…" />
          </div>
        )}
      </TopBar>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

        {jobs && jobs.length === 0 && (
          <div className="rounded-none border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <p className="font-medium">No jobs yet</p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Create a job first. Its Job #, customer and site fill in every report you
              start under it.
            </p>
            <button
              onClick={() => setCreating(true)}
              className={`${primaryButtonClass} mx-auto mt-5`}
            >
              <Icon d={ICONS.plus} />
              New job
            </button>
          </div>
        )}

        {jobs && jobs.length > 0 && (
          <section className="mb-10">
            <SectionHeading title="Jobs" count={filtered.length} />
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-500">No jobs match “{query}”.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filtered.map((job) => (
                  <li key={job.id}>
                    <button
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="group flex w-full items-center gap-4 rounded-none border border-neutral-200 bg-white p-4 text-left transition hover:border-brand dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold">#{job.job_number}</span>
                          {job.title && (
                            <span className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                              {job.title}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-sm">{job.customerName}</div>
                        {job.site_address && (
                          <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {job.site_address}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                        {counts.get(job.id) ?? 0} reports
                      </span>
                      <span className="text-neutral-300 transition group-hover:text-brand dark:text-neutral-600">
                        <Icon d={ICONS.chevron} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {unassignedCount > 0 && (
          <button
            onClick={() => navigate(`/jobs/${UNASSIGNED_JOB_ID}`)}
            className="flex w-full items-center justify-between rounded-none border border-neutral-200 bg-white p-4 text-left text-sm transition hover:border-brand dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span>
              <span className="font-medium">Reports without a job</span>
              <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                Saved before jobs were added ({unassignedCount})
              </span>
            </span>
            <Icon d={ICONS.chevron} />
          </button>
        )}
      </main>

      {creating && (
        <JobFormDialog
          onClose={() => setCreating(false)}
          onSaved={(id) => navigate(`/jobs/${id}`)}
        />
      )}
    </div>
  );
}
