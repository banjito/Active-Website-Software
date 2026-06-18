import React, { useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Play,
  Eye,
  AlertTriangle,
  Pencil,
  X,
  Check,
} from "lucide-react";

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  status?:
    | "not started"
    | "in_progress"
    | "ready_for_review"
    | "approved"
    | "sent"
    | "issue"
    | "archived";
  urgency?: "normal" | "critical";
  submitted_at?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
}

interface SubmittalTrackerProps {
  submittalJobType: "standard" | "data_center" | null | undefined;
  submittalWindowHours: number | null | undefined;
  assets: Asset[];
  dynamicAssetNames?: Record<string, string>;
  isAdmin?: boolean;
  onUpdateSentDate?: (assetId: string, newSentDate: string) => Promise<boolean>;
}

type StatusCategory =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "issue"
  | "sent_on_time"
  | "sent_late";

interface ReportStatus {
  assetId: string;
  assetName: string;
  category: StatusCategory;
  urgency: "normal" | "critical";
  createdAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  clockStart: Date | null; // The timestamp tracking starts from (submitted_at or approved_at fallback)
  usingFallback: boolean; // True if using approved_at as fallback for clock start
  hoursToSent: number | null; // Hours from clock start to sent (for sent reports)
  hoursToApproved: number | null; // Hours from clock start to approved
  hoursSinceSubmitted: number | null; // Hours since clock start (for tracking)
  windowHours: number;
}

// Format date with time
const formatDateTime = (date: Date | null): string => {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// Format just time
const formatTime = (date: Date | null): string => {
  if (!date) return "-";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// Format date for input field (YYYY-MM-DD)
const formatDateForInput = (date: Date | null): string => {
  if (!date) return "";
  return date.toISOString().split("T")[0];
};

// Format time for input field (HH:MM)
const formatTimeForInput = (date: Date | null): string => {
  if (!date) return "";
  return date.toTimeString().slice(0, 5);
};

export const SubmittalTracker: React.FC<SubmittalTrackerProps> = ({
  submittalJobType,
  submittalWindowHours,
  assets,
  dynamicAssetNames = {},
  isAdmin = false,
  onUpdateSentDate,
}) => {
  const [reportStatuses, setReportStatuses] = useState<ReportStatus[]>([]);
  const [counts, setCounts] = useState<Record<StatusCategory, number>>({
    not_started: 0,
    in_progress: 0,
    ready_for_review: 0,
    approved: 0,
    issue: 0,
    sent_on_time: 0,
    sent_late: 0,
  });
  const [activeFilter, setActiveFilter] = useState<StatusCategory | "all">(
    "all",
  );
  const [onTimePercentage, setOnTimePercentage] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // State for editing sent date
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingSentDate, setEditingSentDate] = useState<string>("");
  const [editingSentTime, setEditingSentTime] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Determine the submittal window in hours
  const getWindowHours = (): number => {
    if (submittalWindowHours) return submittalWindowHours;
    if (submittalJobType === "data_center") return 72; // Default 72 hours for data center
    return 168; // Default 7 days (168 hours) for standard
  };

  // Listen for asset status changes to refresh the tracker
  useEffect(() => {
    const handleAssetStatusChanged = () => {
      console.log("[SubmittalTracker] Asset status changed, refreshing...");
      setRefreshKey((prev) => prev + 1);
    };

    window.addEventListener("assetStatusChanged", handleAssetStatusChanged);
    return () => {
      window.removeEventListener(
        "assetStatusChanged",
        handleAssetStatusChanged,
      );
    };
  }, []);

  useEffect(() => {
    const windowHours = getWindowHours();
    const statuses: ReportStatus[] = [];
    const newCounts: Record<StatusCategory, number> = {
      not_started: 0,
      in_progress: 0,
      ready_for_review: 0,
      approved: 0,
      issue: 0,
      sent_on_time: 0,
      sent_late: 0,
    };

    // Filter assets that are reports (have file_url starting with 'report:') and exclude archived
    const reportAssets = assets.filter(
      (asset) =>
        asset.file_url?.startsWith("report:") && asset.status !== "archived",
    );

    const now = new Date();

    reportAssets.forEach((asset) => {
      const createdAt = asset.created_at ? new Date(asset.created_at) : null;
      const submittedAt = asset.submitted_at
        ? new Date(asset.submitted_at)
        : null;
      const approvedAt = asset.approved_at ? new Date(asset.approved_at) : null;
      const sentAt = asset.sent_at ? new Date(asset.sent_at) : null;

      // Use submitted_at as clock start, fall back to approved_at for legacy reports
      const clockStart = submittedAt || approvedAt;

      let category: StatusCategory;
      let hoursToSent: number | null = null;
      let hoursToApproved: number | null = null;
      let hoursSinceSubmitted: number | null = null;

      // Calculate hours from clock start to approved
      if (clockStart && approvedAt && clockStart !== approvedAt) {
        hoursToApproved =
          (approvedAt.getTime() - clockStart.getTime()) / (1000 * 60 * 60);
      }

      // Calculate hours since clock start
      if (clockStart) {
        hoursSinceSubmitted =
          (now.getTime() - clockStart.getTime()) / (1000 * 60 * 60);
      }

      if (asset.status === "sent") {
        // Determine if sent on time or late based on time from clock start to SENT
        if (clockStart && sentAt) {
          hoursToSent =
            (sentAt.getTime() - clockStart.getTime()) / (1000 * 60 * 60);
          category = hoursToSent <= windowHours ? "sent_on_time" : "sent_late";
        } else if (sentAt) {
          // Sent without any timestamp - treat as on time
          category = "sent_on_time";
          hoursToSent = 0;
        } else {
          category = "sent_on_time";
        }
      } else if (asset.status === "not started") {
        category = "not_started";
      } else if (asset.status === "in_progress" || !asset.status) {
        category = "in_progress";
      } else if (asset.status === "ready_for_review") {
        category = "ready_for_review";
      } else if (asset.status === "approved") {
        category = "approved";
      } else if (asset.status === "issue") {
        category = "issue";
      } else {
        category = "in_progress"; // Fallback
      }

      newCounts[category]++;

      statuses.push({
        assetId: asset.id,
        assetName: dynamicAssetNames[asset.id] || asset.name,
        category,
        urgency: asset.urgency || "normal",
        createdAt,
        submittedAt,
        approvedAt,
        sentAt,
        clockStart,
        usingFallback: !submittedAt && !!approvedAt,
        hoursToSent,
        hoursToApproved,
        hoursSinceSubmitted,
        windowHours,
      });
    });

    setReportStatuses(statuses);
    setCounts(newCounts);

    // Calculate on-time percentage based on sent reports only
    const totalSent = newCounts.sent_on_time + newCounts.sent_late;
    if (totalSent > 0) {
      setOnTimePercentage(
        Math.round((newCounts.sent_on_time / totalSent) * 100),
      );
    } else {
      setOnTimePercentage(0);
    }
  }, [
    assets,
    submittalWindowHours,
    submittalJobType,
    refreshKey,
    dynamicAssetNames,
  ]);

  const windowHours = getWindowHours();
  const windowDays = windowHours / 24;
  const totalReports = reportStatuses.length;

  // If there are no reports, don't show the tracker
  if (totalReports === 0) {
    return null;
  }

  // Filter reports based on active filter
  const filteredReports =
    activeFilter === "all"
      ? reportStatuses
      : reportStatuses.filter((r) => r.category === activeFilter);

  // Determine the color based on percentage
  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 90) return "text-green-600 dark:text-green-400";
    if (percentage >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getJobTypeLabel = (): string => {
    if (submittalJobType === "data_center") return "Data Center";
    return "Standard";
  };

  const getCategoryIcon = (category: StatusCategory) => {
    switch (category) {
      case "not_started":
        return (
          <FileText className="w-5 h-5 text-neutral-400 dark:text-neutral-500 flex-shrink-0" />
        );
      case "in_progress":
        return (
          <Play className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        );
      case "ready_for_review":
        return (
          <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        );
      case "approved":
        return (
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        );
      case "issue":
        return (
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        );
      case "sent_on_time":
        return (
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        );
      case "sent_late":
        return (
          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        );
    }
  };

  const getCategoryBadge = (category: StatusCategory) => {
    switch (category) {
      case "not_started":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400">
            Not Started
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            In Progress
          </span>
        );
      case "ready_for_review":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Ready for Review
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Approved
          </span>
        );
      case "issue":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Issue
          </span>
        );
      case "sent_on_time":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Sent on time
          </span>
        );
      case "sent_late":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Sent late
          </span>
        );
    }
  };

  const statusFilters: {
    key: StatusCategory | "all";
    label: string;
    count: number;
  }[] = [
    { key: "all", label: "All", count: totalReports },
    { key: "not_started", label: "Not Started", count: counts.not_started },
    { key: "in_progress", label: "In Progress", count: counts.in_progress },
    {
      key: "ready_for_review",
      label: "Ready for Review",
      count: counts.ready_for_review,
    },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "issue", label: "Issue", count: counts.issue },
    { key: "sent_on_time", label: "Sent on time", count: counts.sent_on_time },
    { key: "sent_late", label: "Sent late", count: counts.sent_late },
  ];

  const getFilterButtonClass = (key: StatusCategory | "all") => {
    const isActive = activeFilter === key;
    let baseClass =
      "px-3 py-2 text-sm font-medium rounded-md transition-colors ";

    if (isActive) {
      if (key === "sent_on_time") {
        return baseClass + "bg-green-600 text-white shadow-sm";
      } else if (key === "sent_late" || key === "issue") {
        return baseClass + "bg-red-600 text-white shadow-sm";
      } else if (key === "ready_for_review") {
        return baseClass + "bg-blue-600 text-white shadow-sm";
      } else {
        return (
          baseClass +
          "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
        );
      }
    }
    return (
      baseClass +
      "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
    );
  };

  const formatHours = (hours: number | null): string => {
    if (hours === null) return "-";
    const totalMinutes = Math.round(hours * 60);
    const d = Math.floor(totalMinutes / (24 * 60));
    const h = Math.floor((totalMinutes % (24 * 60)) / 60);
    const m = totalMinutes % 60;

    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);

    return parts.join(" ");
  };

  // Handle starting to edit a sent date
  const handleStartEditSentDate = (
    assetId: string,
    currentSentAt: Date | null,
  ) => {
    setEditingAssetId(assetId);
    setEditingSentDate(formatDateForInput(currentSentAt));
    setEditingSentTime(formatTimeForInput(currentSentAt));
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingAssetId(null);
    setEditingSentDate("");
    setEditingSentTime("");
  };

  // Handle saving the new sent date
  const handleSaveSentDate = async () => {
    if (!editingAssetId || !editingSentDate || !onUpdateSentDate) return;

    setIsSaving(true);
    try {
      // Combine date and time into ISO string
      const dateTimeString = `${editingSentDate}T${editingSentTime || "12:00"}:00`;
      const newDate = new Date(dateTimeString);
      const isoString = newDate.toISOString();

      const success = await onUpdateSentDate(editingAssetId, isoString);

      if (success) {
        // Trigger refresh
        setRefreshKey((prev) => prev + 1);
        handleCancelEdit();
      }
    } catch (error) {
      console.error("Error updating sent date:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Remote Submittal Tracking
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {getJobTypeLabel()} • {windowDays} day window (from submission to
            delivery)
          </p>
        </div>
      </div>

      {/* KPI Card - On-Time Delivery */}
      <div className="bg-white dark:bg-dark-150 rounded-lg border border-neutral-200 dark:border-neutral-700 p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2">
              On-Time Delivery
            </p>
            <p
              className={`text-5xl font-bold ${getPercentageColor(onTimePercentage)}`}
            >
              {onTimePercentage}%
            </p>
          </div>
          <div className="flex items-center gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {counts.sent_on_time}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Sent on time
              </p>
            </div>
            <div className="w-px h-12 bg-neutral-200 dark:bg-neutral-700"></div>
            <div>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {counts.sent_late}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Sent late
              </p>
            </div>
            <div className="w-px h-12 bg-neutral-200 dark:bg-neutral-700"></div>
            <div>
              <p className="text-3xl font-bold text-neutral-600 dark:text-neutral-400">
                {totalReports - counts.sent_on_time - counts.sent_late}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Pending
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {counts.sent_on_time + counts.sent_late > 0 ? (
              <>
                {counts.sent_on_time} of{" "}
                {counts.sent_on_time + counts.sent_late} sent reports delivered
                within {windowDays} days of submission
              </>
            ) : (
              <>No reports sent yet</>
            )}
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex space-x-1 bg-neutral-100 dark:bg-dark-150 p-1 rounded-lg overflow-x-auto">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={getFilterButtonClass(filter.key)}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      {/* Report List */}
      {filteredReports.length > 0 && (
        <div className="bg-white dark:bg-dark-150 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white uppercase tracking-wide">
              Report Status
            </h3>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {filteredReports.map((status) => (
              <div
                key={status.assetId}
                className="px-6 py-4 hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getCategoryIcon(status.category)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                        {status.assetName}
                      </p>

                      {/* Timestamps section */}
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 space-y-0.5">
                        {status.createdAt && (
                          <p>Created: {formatDateTime(status.createdAt)}</p>
                        )}
                        {status.submittedAt && (
                          <p>Submitted: {formatDateTime(status.submittedAt)}</p>
                        )}
                        {status.approvedAt && (
                          <p>
                            Approved: {formatDateTime(status.approvedAt)}
                            {status.hoursToApproved !== null &&
                              status.hoursToApproved > 0 && (
                                <span className="ml-2 text-neutral-400">
                                  ({formatHours(status.hoursToApproved)} to
                                  approve)
                                </span>
                              )}
                          </p>
                        )}
                        {status.sentAt && (
                          <div className="flex items-center gap-1">
                            {editingAssetId === status.assetId ? (
                              // Inline editing mode
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-neutral-500 dark:text-neutral-400">
                                  Sent:
                                </span>
                                <input
                                  type="date"
                                  value={editingSentDate}
                                  onChange={(e) =>
                                    setEditingSentDate(e.target.value)
                                  }
                                  className="px-2 py-0.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                                />
                                <input
                                  type="time"
                                  value={editingSentTime}
                                  onChange={(e) =>
                                    setEditingSentTime(e.target.value)
                                  }
                                  className="px-2 py-0.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                                />
                                <button
                                  onClick={handleSaveSentDate}
                                  disabled={isSaving || !editingSentDate}
                                  className="p-0.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSaving}
                                  className="p-0.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              // Display mode
                              <p className="flex items-center gap-1">
                                Sent: {formatDateTime(status.sentAt)}
                                {status.hoursToSent !== null && (
                                  <span
                                    className={`ml-2 font-medium ${status.hoursToSent <= status.windowHours ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                  >
                                    ({formatHours(status.hoursToSent)} total)
                                  </span>
                                )}
                                {isAdmin && onUpdateSentDate && (
                                  <button
                                    onClick={() =>
                                      handleStartEditSentDate(
                                        status.assetId,
                                        status.sentAt,
                                      )
                                    }
                                    className="ml-2 p-0.5 text-neutral-400 hover:text-[#f26722] dark:hover:text-[#f26722] transition-colors"
                                    title="Edit sent date"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Show elapsed time for pending reports */}
                        {(status.category === "ready_for_review" ||
                          status.category === "approved") &&
                          status.hoursSinceSubmitted !== null && (
                            <p
                              className={`font-medium ${status.hoursSinceSubmitted > status.windowHours ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400"}`}
                            >
                              ⏳ {formatHours(status.hoursSinceSubmitted)}{" "}
                              elapsed
                              {status.hoursSinceSubmitted >
                                status.windowHours && " • PAST DEADLINE!"}
                            </p>
                          )}

                        {/* Note for legacy reports without submitted_at */}
                        {status.usingFallback &&
                          (status.category === "sent_on_time" ||
                            status.category === "sent_late") && (
                            <p className="text-neutral-400 italic">
                              * Time calculated from approval (no submission
                              date recorded)
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4 flex items-center gap-2">
                    {getCategoryBadge(status.category)}
                    {status.urgency === "critical" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                        <AlertTriangle className="w-3 h-3" />
                        Critical
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        Normal
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredReports.length === 0 && (
        <div className="bg-white dark:bg-dark-150 rounded-lg border border-neutral-200 dark:border-neutral-700 p-8 text-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            No reports in this category
          </p>
        </div>
      )}
    </div>
  );
};
