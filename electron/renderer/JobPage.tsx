import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import JobFormDialog from "./JobFormDialog";
import {
  getJob,
  listJobReports,
  UNASSIGNED_JOB_ID,
  type OfflineJob,
  type OfflineJobReport,
} from "./offlineJobs";
import {
  formatDate,
  Icon,
  ICONS,
  primaryButtonClass,
  secondaryButtonClass,
  SectionHeading,
  TopBar,
} from "./ShellChrome";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  ready_for_review: "Ready for review",
};

/**
 * One job: its details and saved reports. Reports' own Back/Cancel buttons
 * navigate to /jobs/<id>, so this page is also where they land.
 */
export default function JobPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isUnassigned = id === UNASSIGNED_JOB_ID;
  const [job, setJob] = useState<OfflineJob | null | undefined>(undefined);
  const [reports, setReports] = useState<OfflineJobReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [j, r] = await Promise.all([
        isUnassigned ? Promise.resolve(null) : getJob(id),
        listJobReports(id),
      ]);
      setJob(j);
      setReports(r);
    } catch (err) {
      console.error("Failed to load job:", err);
      setLoadError("Could not load this job.");
    }
  }, [id, isUnassigned]);

  useEffect(() => {
    void load();
  }, [load]);

  const notFound = !isUnassigned && job === null;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar
        back={{ label: "All jobs", to: "/" }}
        actions={
          job && (
            <>
              <button onClick={() => setEditing(true)} className={secondaryButtonClass}>
                <Icon d={ICONS.edit} />
                Edit job
              </button>
              <button onClick={() => navigate(`/jobs/${id}/new`)} className={primaryButtonClass}>
                <Icon d={ICONS.plus} />
                New report
              </button>
            </>
          )
        }
      >
        <div className="mt-3">
          {isUnassigned && (
            <>
              <p className="text-xl font-semibold">Reports without a job</p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Saved before jobs were added. Their Customer and Job # stay blank.
              </p>
            </>
          )}
          {job && (
            <>
              <p className="text-xl font-semibold">
                #{job.job_number}
                {job.title && (
                  <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
                    {job.title}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm">{job.customerName}</p>
              {job.site_address && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{job.site_address}</p>
              )}
            </>
          )}
        </div>
      </TopBar>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
        {notFound && (
          <p className="text-sm text-neutral-500">This job isn't on this computer.</p>
        )}

        {reports && !notFound && (
          <section>
            <SectionHeading title="Reports" count={reports.length} />
            {reports.length === 0 ? (
              <div className="rounded-none border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
                <p className="font-medium">No reports yet</p>
                {job && (
                  <button
                    onClick={() => navigate(`/jobs/${id}/new`)}
                    className={`${primaryButtonClass} mx-auto mt-5`}
                  >
                    <Icon d={ICONS.plus} />
                    New report
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200 border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {reports.map((r) => (
                  <li key={r.assetId}>
                    <button
                      onClick={() => navigate(r.route)}
                      className="group flex w-full items-center gap-4 rounded-none px-4 py-3 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {r.reportTypeName}
                          {r.created_at && ` · Started ${formatDate(r.created_at)}`}
                        </div>
                      </div>
                      {r.status && (
                        <span
                          className={
                            "shrink-0 rounded-none px-2 py-0.5 text-xs font-medium " +
                            (r.status === "ready_for_review"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300")
                          }
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      )}
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
      </main>

      {editing && job && (
        <JobFormDialog
          job={job}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
