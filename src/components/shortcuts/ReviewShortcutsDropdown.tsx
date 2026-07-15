import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock, FileText, Flag } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchJobsWithReportsForReview,
  formatReviewTimeAgo,
  getJobReviewPath,
  getReviewUrgencyColorClass,
  type JobWithReportsReadyForReview,
} from "@/lib/reviewShortcuts";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/supabase";

interface ReviewShortcutsDropdownProps {
  onNavigate: (url: string) => void;
  openFlagCount?: number;
}

type ReviewDropdownJob = JobWithReportsReadyForReview & {
  openFlagCount?: number;
  flagOnly?: boolean;
};

type FlagJobInfo = {
  count: number;
  oldestFlagDate: string;
};

export const ReviewShortcutsDropdown: React.FC<
  ReviewShortcutsDropdownProps
> = ({ onNavigate, openFlagCount = 0 }) => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<ReviewDropdownJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenFlagCountsByJob = async (): Promise<
    Record<string, FlagJobInfo>
  > => {
    const { data: flags, error: flagsError } = await supabase
      .schema("common")
      .from("report_flags")
      .select("asset_id, created_at")
      .eq("status", "open");

    if (flagsError) throw flagsError;
    if (!flags || flags.length === 0) return {};

    const assetIds = Array.from(new Set(flags.map((flag) => flag.asset_id)));
    const { data: links, error: linksError } = await supabase
      .schema("neta_ops")
      .from("job_assets")
      .select("job_id, asset_id")
      .in("asset_id", assetIds);

    if (linksError) throw linksError;

    const jobIdByAssetId = new Map(
      (links || []).map((link) => [link.asset_id, link.job_id]),
    );

    return flags.reduce<Record<string, FlagJobInfo>>((acc, flag) => {
      const jobId = jobIdByAssetId.get(flag.asset_id);
      if (!jobId) return acc;

      const current = acc[jobId];
      if (!current) {
        acc[jobId] = { count: 1, oldestFlagDate: flag.created_at };
        return acc;
      }

      current.count += 1;
      if (new Date(flag.created_at) < new Date(current.oldestFlagDate)) {
        current.oldestFlagDate = flag.created_at;
      }
      return acc;
    }, {});
  };

  const fetchFlagOnlyJobs = async (
    flagCountsByJob: Record<string, FlagJobInfo>,
    existingJobIds: Set<string>,
  ): Promise<ReviewDropdownJob[]> => {
    const missingJobIds = Object.keys(flagCountsByJob).filter(
      (jobId) => !existingJobIds.has(jobId),
    );
    if (missingJobIds.length === 0) return [];

    const { data: jobsData, error: jobsError } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .select("id, title, job_number, division, customer_id")
      .in("id", missingJobIds)
      .is("deleted_at", null);

    if (jobsError) throw jobsError;
    if (!jobsData || jobsData.length === 0) return [];

    return Promise.all(
      jobsData.map(async (job) => {
        let customerData: { name?: string; company_name?: string } | null =
          null;
        if (job.customer_id) {
          const { data: customer } = await supabase
            .schema("common")
            .from("customers")
            .select("name, company_name")
            .eq("id", job.customer_id)
            .maybeSingle();
          customerData = customer;
        }

        const flagInfo = flagCountsByJob[job.id];
        return {
          id: job.id,
          title: job.title,
          job_number: job.job_number,
          division: job.division,
          customer_name: customerData?.name,
          company_name: customerData?.company_name,
          reports_count: 0,
          oldest_report_date: flagInfo.oldestFlagDate,
          reports: [],
          openFlagCount: flagInfo.count,
          flagOnly: true,
        };
      }),
    );
  };

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJobsWithReportsForReview();
      const flagCountsByJob = await fetchOpenFlagCountsByJob();
      const reviewJobs: ReviewDropdownJob[] = data.map((job) => ({
        ...job,
        openFlagCount: flagCountsByJob[job.id]?.count || 0,
      }));
      const flagOnlyJobs = await fetchFlagOnlyJobs(
        flagCountsByJob,
        new Set(reviewJobs.map((job) => job.id)),
      );
      setJobs([...reviewJobs, ...flagOnlyJobs]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Error fetching jobs with reports for review:", err);
      setError(`Failed to load: ${message}`);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [user, loadJobs]);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [openFlagCount, user, loadJobs]);

  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      if (
        [
          "ready_for_review",
          "in_progress",
          "approved",
          "issue",
          "rejected",
          "sent",
          "archived",
        ].includes(newStatus)
      ) {
        void loadJobs();
      }
    };

    window.addEventListener(
      "assetStatusChanged",
      handleAssetStatusChange as EventListener,
    );
    return () => {
      window.removeEventListener(
        "assetStatusChanged",
        handleAssetStatusChange as EventListener,
      );
    };
  }, [loadJobs]);

  const handleJobClick = (jobId: string) => {
    onNavigate(getJobReviewPath(jobId, user));
  };

  return (
    <div className="w-[min(24rem,calc(100vw-1.5rem))] rounded-none bg-white dark:bg-dark-150 shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Jobs with Reports Ready for Review
          </h3>
        </div>
        {!loading && !error && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
            {openFlagCount > 0 && (
              <span>
                {" "}
                · {openFlagCount} customer flag
                {openFlagCount !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="xs" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              All caught up
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              No reports awaiting review or customer flags right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => handleJobClick(job.id)}
                  className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {job.job_number
                        ? `${job.job_number} — ${job.title}`
                        : job.title}
                    </p>
                    {!!job.openFlagCount && job.openFlagCount > 0 && (
                      <span
                        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-none bg-yellow-400 px-1.5 text-[11px] font-bold leading-none text-yellow-950 shadow-sm"
                        title={`${job.openFlagCount} open customer flag${job.openFlagCount === 1 ? "" : "s"} on this job`}
                        aria-label={`${job.openFlagCount} open customer flag${job.openFlagCount === 1 ? "" : "s"} on this job`}
                      >
                        <Flag className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  {(job.company_name || job.customer_name) && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 truncate mt-0.5">
                      {job.company_name || job.customer_name}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{job.division}</span>
                    {job.flagOnly ? (
                      <span>
                        customer flag{job.openFlagCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span>
                        {job.reports_count} report
                        {job.reports_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-0.5 font-medium ${getReviewUrgencyColorClass(job.oldest_report_date)}`}
                    >
                      <Clock className="h-3 w-3" />
                      {formatReviewTimeAgo(job.oldest_report_date)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReviewShortcutsDropdown;
