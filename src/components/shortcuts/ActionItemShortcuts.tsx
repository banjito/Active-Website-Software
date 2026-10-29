import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ChevronRight, ClipboardList, Clock } from "lucide-react";
import { Badge } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  ACTION_ITEMS_CHANGED_EVENT,
  OPEN_ACTION_ITEM_STATUSES,
} from "@/services/reportActionItemService";

/**
 * Portal front page: jobs with open (Unaddressed) action items, i.e. not yet
 * formally notified to the customer, so leads and PMs can jump straight to
 * them. Same look as ApprovedShortcuts.
 */
interface JobGroup {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  division?: string;
  unaddressed: number;
  oldest: string;
}

export const ActionItemShortcuts: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<JobGroup[]>([]);

  useEffect(() => {
    fetchGroups();
    const onChanged = () => fetchGroups();
    window.addEventListener(ACTION_ITEMS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACTION_ITEMS_CHANGED_EVENT, onChanged);
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const { data: items, error: itemsError } = await supabase
        .schema("neta_ops")
        .from("report_action_items")
        .select("job_id, status, created_at")
        .in("status", OPEN_ACTION_ITEM_STATUSES);
      if (itemsError) throw itemsError;
      if (!items || items.length === 0) {
        setGroups([]);
        return;
      }

      const jobIds = Array.from(new Set(items.map((i) => i.job_id)));
      const { data: jobs, error: jobsError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id, title, job_number, division, deleted_at")
        .in("id", jobIds);
      if (jobsError) throw jobsError;
      const jobById: Record<string, any> = {};
      (jobs || []).forEach((j) => (jobById[j.id] = j));

      const groupMap: Record<string, JobGroup> = {};
      items.forEach((i) => {
        const jb = jobById[i.job_id];
        if (!jb || jb.deleted_at) return;
        if (!groupMap[i.job_id]) {
          groupMap[i.job_id] = {
            jobId: i.job_id,
            jobTitle: jb.title,
            jobNumber: jb.job_number,
            division: jb.division,
            unaddressed: 0,
            oldest: i.created_at,
          };
        }
        const g = groupMap[i.job_id];
        g.unaddressed += 1;
        if (new Date(i.created_at) < new Date(g.oldest)) g.oldest = i.created_at;
      });

      setGroups(
        Object.values(groupMap).sort(
          (a, b) => new Date(a.oldest).getTime() - new Date(b.oldest).getTime(),
        ),
      );
      setError(null);
    } catch (err: any) {
      console.error("Error fetching action item groups:", err);
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const diffInHours = Math.floor(
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60),
    );
    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  const urgencyColor = (dateString: string) => {
    const diffInHours = Math.floor(
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60),
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
        <ClipboardList className="h-5 w-5 mr-2" />
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-white py-2">
        <ClipboardList className="h-4 w-4" />
        No open action items. Every item has been formally notified, closed or
        archived.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-brand" />
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
          Jobs with Open Action Items
        </h3>
        <Badge variant="secondary" className="ml-1">
          {groups.length}
        </Badge>
      </div>
      <div className="grid gap-3">
        {groups.map((g) => (
          <div
            key={g.jobId}
            onClick={() => navigate(`/jobs/${g.jobId}?tab=action-items`)}
            className="bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none p-4 hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-neutral-900 dark:text-white truncate">
                    {g.jobNumber ? `${g.jobNumber} - ${g.jobTitle}` : g.jobTitle}
                  </h4>
                  {g.division && (
                    <Badge variant="outline" className="text-xs">
                      {g.division}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium text-brand">
                    {g.unaddressed} unaddressed
                  </span>
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

export default ActionItemShortcuts;
