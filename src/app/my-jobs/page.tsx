import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Briefcase, ChevronRight } from "lucide-react";
import { useIsSubcontractor } from "@/lib/permissions";
import { usePageTitle } from "@/hooks/usePageTitle";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { loadMySubcontractorJobs, type SubcontractorJob } from "@/services/subcontractorService";

/**
 * Home for invited subcontractors (Roles scope item 8): the jobs they're on.
 * Everyone else goes to the portal.
 */
export default function MyJobsPage() {
  const isSub = useIsSubcontractor();
  const [jobs, setJobs] = useState<SubcontractorJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("My jobs");

  useEffect(() => {
    if (!isSub) return;
    loadMySubcontractorJobs()
      .then(setJobs)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your jobs."));
  }, [isSub]);

  if (!isSub) return <Navigate to="/portal" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">My jobs</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Open a job to see its reports, start one, or add photos.
        </p>
      </div>

      {error ? (
        <p className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : jobs === null ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : jobs.length === 0 ? (
        <p className="rounded-none border border-neutral-200 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-dark-150 dark:text-neutral-300">
          You're not on any jobs right now. Ask the person who invited you.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-none border border-neutral-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-dark-150">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                to={`/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-200"
              >
                <Briefcase className="h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-neutral-900 dark:text-white">
                    {[job.job_number, job.title].filter(Boolean).join(" · ") || "Job"}
                  </div>
                  {job.customer && (
                    <div className="truncate text-sm text-neutral-500 dark:text-neutral-400">{job.customer}</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
