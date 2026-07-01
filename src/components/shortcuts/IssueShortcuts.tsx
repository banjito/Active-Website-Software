import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertCircle, FileText, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface JobGroup {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  division?: string;
  count: number;
  oldest: string;
}

export const IssueShortcuts: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<JobGroup[]>([]);

  useEffect(() => {
    fetchIssueGroups();
  }, []);

  const fetchIssueGroups = async () => {
    try {
      setLoading(true);

      const { data: assets, error: assetsError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select(
          "id, name, created_at, status, submitted_at, approved_at, sent_at",
        )
        .eq("status", "issue")
        .order("created_at", { ascending: true });
      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) {
        setGroups([]);
        return;
      }

      const assetIds = assets.map((a) => a.id);
      const { data: links, error: linksError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .select("job_id, asset_id")
        .in("asset_id", assetIds);
      if (linksError) throw linksError;
      if (!links || links.length === 0) {
        setGroups([]);
        return;
      }

      const jobIds = Array.from(new Set(links.map((l) => l.job_id)));
      const { data: jobs, error: jobsError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id, title, job_number, division, deleted_at")
        .in("id", jobIds);
      if (jobsError) throw jobsError;

      const jobById: Record<
        string,
        {
          id: string;
          title: string;
          job_number?: string;
          division?: string;
          deleted_at?: string | null;
        }
      > = {};
      (jobs || []).forEach((j) => (jobById[j.id] = j));

      const jobIdByAsset: Record<string, string> = {};
      links.forEach((l) => {
        jobIdByAsset[l.asset_id] = l.job_id;
      });

      const groupMap: Record<string, JobGroup> = {};
      assets.forEach((a) => {
        const jid = jobIdByAsset[a.id];
        const jb = jobById[jid];
        if (!jb || jb.deleted_at) return;
        if (!groupMap[jid]) {
          groupMap[jid] = {
            jobId: jid,
            jobTitle: jb.title,
            jobNumber: jb.job_number,
            division: jb.division,
            count: 0,
            oldest: a.created_at,
          };
        }
        groupMap[jid].count += 1;
        if (new Date(a.created_at) < new Date(groupMap[jid].oldest))
          groupMap[jid].oldest = a.created_at;
      });

      const grouped = Object.values(groupMap).sort(
        (a, b) => new Date(a.oldest).getTime() - new Date(b.oldest).getTime(),
      );
      setGroups(grouped);
    } catch (err: any) {
      console.error("Error fetching issue groups:", err);
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );
    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const urgencyColor = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );
    if (diffInHours >= 72) return "text-red-600 dark:text-red-400";
    if (diffInHours >= 24) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-6 text-red-600 dark:text-red-400">
        <AlertCircle className="h-5 w-5 mr-2" />
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-white py-2">
        <AlertCircle className="h-4 w-4" />
        No reports currently marked as issue.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-red-600" />
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
          Jobs with Reports Marked Issue
        </h3>
        <Badge variant="secondary" className="ml-1">
          {groups.length}
        </Badge>
      </div>
      <div className="grid gap-3">
        {groups.map((g) => (
          <div
            key={g.jobId}
            onClick={() => navigate(`/jobs/${g.jobId}?tab=assets&filter=issue`)}
            className="bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none p-4 hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-neutral-900 dark:text-white truncate">
                    {g.jobNumber
                      ? `${g.jobNumber} - ${g.jobTitle}`
                      : g.jobTitle}
                  </h4>
                  {g.division && (
                    <Badge variant="outline" className="text-xs">
                      {g.division}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 text-neutral-400 mr-1" />
                    <span className="text-neutral-600 dark:text-white">
                      {g.count} report{g.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-neutral-400 mr-1" />
                    <span className={`font-medium ${urgencyColor(g.oldest)}`}>
                      Oldest: {formatTimeAgo(g.oldest)}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-neutral-400 flex-shrink-0 ml-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IssueShortcuts;
