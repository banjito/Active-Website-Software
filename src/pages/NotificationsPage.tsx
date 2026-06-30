import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  Bell,
  BellOff,
  Briefcase,
  Check,
  CheckCircle,
  Filter,
  Gauge,
  Inbox,
  RefreshCw,
} from "lucide-react";
import PageLayout from "@/components/ui/PageLayout";
import Card, { CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { canAccessReportApprovals } from "@/lib/reviewShortcuts";

type StatusKey = "ready_for_review" | "issue" | "approved";
type FeedFilter = "all" | "unread" | "read";

type ReportNotification = {
  kind: "report";
  id: string;
  status: StatusKey;
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  assetName: string;
  createdAt: string;
  urgency?: "normal" | "critical";
};

type CalibrationNotification = {
  kind: "calibration";
  id: string;
  status: "needs_calibration" | "equipment_out_of_cal";
  equipmentName: string;
  dueDate: string;
  serialNumber: string | null;
  ampId: string | null;
};

type PortalNotification = ReportNotification | CalibrationNotification;

type LastSeenByStatus = Record<StatusKey, string>;

type ReportSummary = Record<
  StatusKey,
  { jobCount: number; reportCount: number; unreadCount: number }
>;

const HIDDEN_NOTIF_JOB_IDS_KEY = "hiddenNotificationJobIds";
const NOTIF_LAST_SEEN_KEY = "notifLastSeenByStatus";
const CALIBRATION_SEEN_KEY = "notifSeenCalibrationIds";
const MANUALLY_READ_KEY = "notifManuallyRead";
// Per-item "force unread" override. Needed because a report can be read via the
// lastSeen threshold and a calibration item via the seen set — neither of which
// a single "Mark unread" click can undo. This set wins over every read signal.
const MANUAL_UNREAD_KEY = "notifManualUnread";
// Fired after any read/unread change so the navbar bell badge (and other tabs)
// update instantly. The HeaderBar listens for this and for the "storage" event.
const NOTIF_UPDATED_EVENT = "notificationsUpdated";

function emitNotificationsUpdated() {
  window.dispatchEvent(new CustomEvent(NOTIF_UPDATED_EVENT));
}

const DEFAULT_LAST_SEEN: LastSeenByStatus = {
  ready_for_review: "",
  issue: "",
  approved: "",
};

// A notifications feed only needs recent, actionable items. Without these
// bounds the page fetches every asset of a status (the "approved" set grows
// without limit), plus all of their job links and jobs — slow and unbounded.
const MAX_REPORTS_PER_STATUS = 200;
// "approved" is informational and high-volume, so only surface recent ones.
// Pending/issue reports stay unbounded by date (just capped) so old ones that
// still need action are never hidden.
const APPROVED_RECENT_DAYS = 90;

const STATUS_LABELS: Record<StatusKey, string> = {
  ready_for_review: "Report approvals",
  issue: "Report issues",
  approved: "Reports approved",
};

function getStoredLastSeen(): LastSeenByStatus {
  try {
    const raw = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
    if (!raw) return { ...DEFAULT_LAST_SEEN };
    return { ...DEFAULT_LAST_SEEN, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LAST_SEEN };
  }
}

function persistLastSeen(lastSeen: LastSeenByStatus) {
  try {
    localStorage.setItem(NOTIF_LAST_SEEN_KEY, JSON.stringify(lastSeen));
  } catch {
    // no-op
  }
}

function getStoredSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSet(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    // no-op
  }
}

function getMaxCreatedAt(items: ReportNotification[]): string {
  if (items.length === 0) return "";
  return items.reduce(
    (max, item) =>
      new Date(item.createdAt).getTime() > new Date(max).getTime()
        ? item.createdAt
        : max,
    items[0].createdAt,
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    ready_for_review: { jobCount: 0, reportCount: 0, unreadCount: 0 },
    issue: { jobCount: 0, reportCount: 0, unreadCount: 0 },
    approved: { jobCount: 0, reportCount: 0, unreadCount: 0 },
  });
  const [lastSeen, setLastSeen] = useState<LastSeenByStatus>(() =>
    getStoredLastSeen(),
  );
  const [seenCalibrationIds, setSeenCalibrationIds] = useState<Set<string>>(
    () => getStoredSet(CALIBRATION_SEEN_KEY),
  );
  const [manualReadIds, setManualReadIds] = useState<Set<string>>(() =>
    getStoredSet(MANUALLY_READ_KEY),
  );
  const [manualUnreadIds, setManualUnreadIds] = useState<Set<string>>(() =>
    getStoredSet(MANUAL_UNREAD_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | StatusKey | "calibration">("all");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [isNotifFilterOpen, setIsNotifFilterOpen] = useState(false);
  const [isNotifSortOpen, setIsNotifSortOpen] = useState(false);
  const notifFilterRef = useRef<HTMLDivElement>(null);
  const notifSortRef = useRef<HTMLDivElement>(null);

  const canApproveReports = canAccessReportApprovals(user);

  /** Combine auto + manual read state for a single item. */
  const isRead = useCallback(
    (item: PortalNotification) => {
      // Force-unread wins over every other signal.
      if (manualUnreadIds.has(item.id)) return false;
      if (manualReadIds.has(item.id)) return true;
      if (item.kind === "report") {
        const threshold = lastSeen[item.status]
          ? new Date(lastSeen[item.status]).getTime()
          : 0;
        return new Date(item.createdAt).getTime() <= threshold;
      }
      return seenCalibrationIds.has(item.id);
    },
    [lastSeen, manualReadIds, manualUnreadIds, seenCalibrationIds],
  );

  const loadReportItems = useCallback(
    async (status: StatusKey, hiddenJobIds: Set<string>) => {
      let assetsQuery = supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, created_at, status, urgency")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(MAX_REPORTS_PER_STATUS);

      if (status === "approved") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - APPROVED_RECENT_DAYS);
        assetsQuery = assetsQuery.gte("created_at", cutoff.toISOString());
      }

      const { data: assetsData, error: assetsError } = await assetsQuery;

      if (assetsError) throw assetsError;
      if (!assetsData || assetsData.length === 0) {
        return {
          items: [] as ReportNotification[],
          jobCount: 0,
          reportCount: 0,
        };
      }

      const assetIds = assetsData.map((asset) => asset.id);
      const { data: links, error: linksError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .select("job_id, asset_id")
        .in("asset_id", assetIds);

      if (linksError) throw linksError;
      if (!links || links.length === 0) {
        return {
          items: [] as ReportNotification[],
          jobCount: 0,
          reportCount: 0,
        };
      }

      const jobIdByAsset = new Map<string, string>();
      links.forEach((link) => jobIdByAsset.set(link.asset_id, link.job_id));

      const jobIds = Array.from(new Set(links.map((link) => link.job_id)));
      const { data: jobs, error: jobsError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id, title, job_number, deleted_at")
        .in("id", jobIds);

      if (jobsError) throw jobsError;
      const jobById = new Map<
        string,
        {
          id: string;
          title: string;
          job_number?: string;
          deleted_at?: string | null;
        }
      >();
      (jobs || []).forEach((job) => jobById.set(job.id, job));

      const reportItems = assetsData
        .map((asset): ReportNotification | null => {
          const jobId = jobIdByAsset.get(asset.id);
          if (!jobId || hiddenJobIds.has(jobId)) return null;
          const job = jobById.get(jobId);
          if (!job || job.deleted_at) return null;
          return {
            kind: "report",
            id: asset.id,
            status,
            jobId,
            jobTitle: job.title || "Job",
            jobNumber: job.job_number,
            assetName: asset.name || "Report",
            createdAt: asset.created_at,
            urgency: asset.urgency || "normal",
          };
        })
        .filter((item): item is ReportNotification => Boolean(item));

      return {
        items: reportItems,
        jobCount: new Set(reportItems.map((item) => item.jobId)).size,
        reportCount: reportItems.length,
      };
    },
    [],
  );

  const loadCalibrationItems = useCallback(async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dueInOneMonth = new Date(today);
    dueInOneMonth.setMonth(dueInOneMonth.getMonth() + 1);
    const dueInOneMonthStr = dueInOneMonth.toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .schema("neta_ops")
      .from("field_equipment")
      .select(
        "id, equipment_name, calibration_due_date, in_service, serial_number, amp_id",
      )
      .not("calibration_due_date", "is", null);

    if (error) throw error;

    return (rows || [])
      .filter((row: { in_service?: boolean }) => row.in_service !== false)
      .flatMap((row: any): CalibrationNotification[] => {
        const due = row.calibration_due_date
          ? String(row.calibration_due_date).slice(0, 10)
          : "";
        if (!due || due > dueInOneMonthStr) return [];
        const status =
          due < todayStr ? "equipment_out_of_cal" : "needs_calibration";
        const id = `${status}:${row.id}`;
        return [
          {
            kind: "calibration",
            id,
            status,
            equipmentName: row.equipment_name || "Equipment",
            dueDate: due,
            serialNumber: row.serial_number ?? null,
            ampId: row.amp_id ?? null,
          },
        ];
      });
  }, []);

  const loadNotifications = useCallback(
    async ({ silent = false } = {}) => {
      if (!user) return;

      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const hiddenJobIds = getStoredSet(HIDDEN_NOTIF_JOB_IDS_KEY);
      const currentLastSeen = getStoredLastSeen();
      const currentSeenCalibrationIds = getStoredSet(CALIBRATION_SEEN_KEY);
      const currentManualReadIds = getStoredSet(MANUALLY_READ_KEY);
      const currentManualUnreadIds = getStoredSet(MANUAL_UNREAD_KEY);
      setLastSeen(currentLastSeen);
      setSeenCalibrationIds(currentSeenCalibrationIds);
      setManualReadIds(currentManualReadIds);
      setManualUnreadIds(currentManualUnreadIds);

      try {
        const nextSummary: ReportSummary = {
          ready_for_review: { jobCount: 0, reportCount: 0, unreadCount: 0 },
          issue: { jobCount: 0, reportCount: 0, unreadCount: 0 },
          approved: { jobCount: 0, reportCount: 0, unreadCount: 0 },
        };

        const reportResults = canApproveReports
          ? await Promise.all(
              (["ready_for_review", "issue", "approved"] as StatusKey[]).map(
                async (status) => {
                  const result = await loadReportItems(status, hiddenJobIds);
                  const lastSeenTime = currentLastSeen[status]
                    ? new Date(currentLastSeen[status]).getTime()
                    : 0;
                  nextSummary[status] = {
                    jobCount: result.jobCount,
                    reportCount: result.reportCount,
                    unreadCount: result.items.filter(
                      (item) =>
                        currentManualUnreadIds.has(item.id) ||
                        (!currentManualReadIds.has(item.id) &&
                          new Date(item.createdAt).getTime() > lastSeenTime),
                    ).length,
                  };
                  return result.items;
                },
              ),
            )
          : [];

        const calibrationItems = await loadCalibrationItems();

        const allItems: PortalNotification[] = [
          ...reportResults.flat(),
          ...calibrationItems,
        ];

        // Sort: unread first (by date desc), then read (by date desc)
        const sortTime = (item: PortalNotification): number =>
          item.kind === "report"
            ? new Date(item.createdAt).getTime()
            : new Date(`${item.dueDate}T00:00:00`).getTime();

        const tempRead = (item: PortalNotification) => {
          if (currentManualUnreadIds.has(item.id)) return false;
          if (currentManualReadIds.has(item.id)) return true;
          if (item.kind === "report") {
            const threshold = currentLastSeen[item.status]
              ? new Date(currentLastSeen[item.status]).getTime()
              : 0;
            return new Date(item.createdAt).getTime() <= threshold;
          }
          return currentSeenCalibrationIds.has(item.id);
        };

        allItems.sort((a, b) => {
          const aRead = tempRead(a);
          const bRead = tempRead(b);
          if (aRead !== bRead) return aRead ? 1 : -1; // unread first, read last
          return sortTime(b) - sortTime(a); // newer first within group
        });

        setSummary(nextSummary);
        setItems(allItems);
      } catch (err) {
        console.error("Error loading portal notifications:", err);
        setError("Failed to load notifications.");
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canApproveReports, loadCalibrationItems, loadReportItems, user],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Reflect read-state changes made elsewhere (the navbar bell, or another tab)
  // without refetching the feed — just re-read the shared localStorage signals.
  useEffect(() => {
    const syncReadState = () => {
      setLastSeen(getStoredLastSeen());
      setManualReadIds(getStoredSet(MANUALLY_READ_KEY));
      setManualUnreadIds(getStoredSet(MANUAL_UNREAD_KEY));
      setSeenCalibrationIds(getStoredSet(CALIBRATION_SEEN_KEY));
    };
    window.addEventListener(NOTIF_UPDATED_EVENT, syncReadState);
    window.addEventListener("storage", syncReadState);
    return () => {
      window.removeEventListener(NOTIF_UPDATED_EVENT, syncReadState);
      window.removeEventListener("storage", syncReadState);
    };
  }, []);

  useEffect(() => {
    if (!isNotifFilterOpen && !isNotifSortOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifFilterRef.current && !notifFilterRef.current.contains(e.target as Node))
        setIsNotifFilterOpen(false);
      if (notifSortRef.current && !notifSortRef.current.contains(e.target as Node))
        setIsNotifSortOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNotifFilterOpen, isNotifSortOpen]);

  const typeCounts = useMemo(() => ({
    ready_for_review: items.filter((i) => i.kind === "report" && i.status === "ready_for_review").length,
    issue: items.filter((i) => i.kind === "report" && i.status === "issue").length,
    approved: items.filter((i) => i.kind === "report" && i.status === "approved").length,
    calibration: items.filter((i) => i.kind === "calibration").length,
  }), [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filter === "unread") result = result.filter((item) => !isRead(item));
    else if (filter === "read") result = result.filter((item) => isRead(item));
    if (typeFilter !== "all") {
      if (typeFilter === "calibration") {
        result = result.filter((item) => item.kind === "calibration");
      } else {
        result = result.filter((item) => item.kind === "report" && item.status === typeFilter);
      }
    }
    if (sortDirection === "asc") {
      const sortTime = (item: PortalNotification): number =>
        item.kind === "report"
          ? new Date(item.createdAt).getTime()
          : new Date(`${item.dueDate}T00:00:00`).getTime();
      result = [...result].sort((a, b) => {
        const aRead = isRead(a);
        const bRead = isRead(b);
        if (aRead !== bRead) return aRead ? 1 : -1;
        return sortTime(a) - sortTime(b);
      });
    }
    return result;
  }, [filter, typeFilter, sortDirection, items, isRead]);

  const unreadCount = items.filter((item) => !isRead(item)).length;
  const readCount = items.length - unreadCount;

  const markReportStatusRead = (status: StatusKey) => {
    const related = items.filter(
      (item): item is ReportNotification =>
        item.kind === "report" && item.status === status,
    );
    const nextManual = new Set(manualReadIds);
    const nextManualUnread = new Set(manualUnreadIds);
    related.forEach((item) => {
      nextManual.add(item.id);
      nextManualUnread.delete(item.id);
    });

    const latest = getMaxCreatedAt(related);
    const nextLastSeen = latest ? { ...lastSeen, [status]: latest } : lastSeen;

    setLastSeen(nextLastSeen);
    setManualReadIds(nextManual);
    setManualUnreadIds(nextManualUnread);
    persistLastSeen(nextLastSeen);
    persistSet(MANUALLY_READ_KEY, nextManual);
    persistSet(MANUAL_UNREAD_KEY, nextManualUnread);
    emitNotificationsUpdated();
    const itemRead = (x: PortalNotification) =>
      !nextManualUnread.has(x.id) &&
      (nextManual.has(x.id) ||
        (x.kind === "report" &&
          new Date(x.createdAt).getTime() <=
            (nextLastSeen[x.status]
              ? new Date(nextLastSeen[x.status]).getTime()
              : 0)) ||
        seenCalibrationIds.has(x.id));
    setItems((current) =>
      [...current].sort((a, b) => {
        const aRead = itemRead(a);
        const bRead = itemRead(b);
        if (aRead !== bRead) return aRead ? 1 : -1;
        const aTime =
          a.kind === "report"
            ? new Date(a.createdAt).getTime()
            : new Date(
                `${(a as CalibrationNotification).dueDate}T00:00:00`,
              ).getTime();
        const bTime =
          b.kind === "report"
            ? new Date(b.createdAt).getTime()
            : new Date(
                `${(b as CalibrationNotification).dueDate}T00:00:00`,
              ).getTime();
        return bTime - aTime;
      }),
    );
  };

  const toggleRead = (item: PortalNotification) => {
    const currentlyRead = isRead(item);
    const nextManual = new Set(manualReadIds);
    const nextManualUnread = new Set(manualUnreadIds);

    if (currentlyRead) {
      // Force unread — overrides lastSeen / seenCalibration / manual-read.
      nextManual.delete(item.id);
      nextManualUnread.add(item.id);
    } else {
      nextManual.add(item.id);
      nextManualUnread.delete(item.id);
    }

    setManualReadIds(nextManual);
    setManualUnreadIds(nextManualUnread);
    persistSet(MANUALLY_READ_KEY, nextManual);
    persistSet(MANUAL_UNREAD_KEY, nextManualUnread);
    emitNotificationsUpdated();

    setItems((current) => {
      const updated = [...current];
      // Re-sort: unread first (by date desc), then read (by date desc)
      const sortTime = (i: PortalNotification): number =>
        i.kind === "report"
          ? new Date(i.createdAt).getTime()
          : new Date(`${i.dueDate}T00:00:00`).getTime();

      const itemRead = (i: PortalNotification) => {
        if (nextManualUnread.has(i.id)) return false;
        if (nextManual.has(i.id)) return true;
        if (i.kind === "report") {
          const threshold = lastSeen[i.status]
            ? new Date(lastSeen[i.status]).getTime()
            : 0;
          return new Date(i.createdAt).getTime() <= threshold;
        }
        return seenCalibrationIds.has(i.id);
      };

      updated.sort((a, b) => {
        const aRead = itemRead(a);
        const bRead = itemRead(b);
        if (aRead !== bRead) return aRead ? 1 : -1;
        return sortTime(b) - sortTime(a);
      });
      return updated;
    });
  };

  const markAllRead = () => {
    const nextManual = new Set(manualReadIds);
    const nextManualUnread = new Set(manualUnreadIds);
    items.forEach((item) => {
      nextManual.add(item.id);
      nextManualUnread.delete(item.id);
    });

    const nextLastSeen = { ...lastSeen };
    (["ready_for_review", "issue", "approved"] as StatusKey[]).forEach(
      (status) => {
        const latest = getMaxCreatedAt(
          items.filter(
            (item) => item.kind === "report" && item.status === status,
          ) as ReportNotification[],
        );
        if (latest) nextLastSeen[status] = latest;
      },
    );

    const nextSeenCalibration = new Set(seenCalibrationIds);
    items.forEach((item) => {
      if (item.kind === "calibration") nextSeenCalibration.add(item.id);
    });

    setManualReadIds(nextManual);
    setManualUnreadIds(nextManualUnread);
    setLastSeen(nextLastSeen);
    setSeenCalibrationIds(nextSeenCalibration);
    persistSet(MANUALLY_READ_KEY, nextManual);
    persistSet(MANUAL_UNREAD_KEY, nextManualUnread);
    persistLastSeen(nextLastSeen);
    persistSet(CALIBRATION_SEEN_KEY, nextSeenCalibration);
    emitNotificationsUpdated();
  };

  /** Inverse of markAllRead: clear every read signal for the current items. */
  const markAllUnread = () => {
    const itemIds = new Set(items.map((item) => item.id));

    // Force every shown item unread — this wins over lastSeen / seenCalibration.
    const nextManual = new Set(manualReadIds);
    const nextManualUnread = new Set(manualUnreadIds);
    itemIds.forEach((id) => {
      nextManual.delete(id);
      nextManualUnread.add(id);
    });

    // Also reset the per-status thresholds so newly-arriving reports aren't
    // auto-read against an old "last seen" timestamp.
    const nextLastSeen = { ...lastSeen };
    (["ready_for_review", "issue", "approved"] as StatusKey[]).forEach(
      (status) => {
        nextLastSeen[status] = "";
      },
    );

    // Drop the "seen" marks for the calibration items currently shown.
    const nextSeenCalibration = new Set(seenCalibrationIds);
    items.forEach((item) => {
      if (item.kind === "calibration") nextSeenCalibration.delete(item.id);
    });

    setManualReadIds(nextManual);
    setManualUnreadIds(nextManualUnread);
    setLastSeen(nextLastSeen);
    setSeenCalibrationIds(nextSeenCalibration);
    persistSet(MANUALLY_READ_KEY, nextManual);
    persistSet(MANUAL_UNREAD_KEY, nextManualUnread);
    persistLastSeen(nextLastSeen);
    persistSet(CALIBRATION_SEEN_KEY, nextSeenCalibration);
    emitNotificationsUpdated();
  };

  const openItem = (item: PortalNotification) => {
    if (!isRead(item)) toggleRead(item);
    if (item.kind === "report") {
      // Report notifications are admin-only (canAccessReportApprovals), so deep
      // link straight to the Report Approvals tab where they can act on it.
      navigate(`/jobs/${item.jobId}?tab=reports`);
    } else {
      const equipmentId = item.id.split(":").slice(1).join(":");
      navigate(`/neta/field-equipment?open=${encodeURIComponent(equipmentId)}`);
    }
  };

  return (
    <PageLayout
      title="Notifications"
      subtitle="Review report approvals, report status changes, and calibration alerts from the navbar bell."
      breadcrumbs={[
        { label: "Portal", to: "/portal" },
        { label: "Notifications" },
      ]}
      actions={
        <>
          <Button
            variant="outline"
            leftIcon={
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            }
            onClick={() => void loadNotifications({ silent: true })}
            disabled={loading || refreshing}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            leftIcon={<BellOff className="h-4 w-4" />}
            onClick={markAllUnread}
            disabled={readCount === 0}
          >
            Mark all unread
          </Button>
          <Button
            leftIcon={<CheckCircle className="h-4 w-4" />}
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {canApproveReports && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === "all"
                  ? "bg-[#f26722] text-white"
                  : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100"
              }`}
            >
              All
            </button>
            {(["ready_for_review", "issue", "approved"] as StatusKey[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setTypeFilter(status)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  typeFilter === status
                    ? "bg-[#f26722] text-white"
                    : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100"
                }`}
              >
                {STATUS_LABELS[status]}
                {summary[status].unreadCount > 0 && (
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                      typeFilter === status
                        ? "bg-white/25 text-white"
                        : "bg-[#f26722]/10 text-[#f26722]"
                    }`}
                  >
                    {summary[status].unreadCount > 99 ? "99+" : summary[status].unreadCount}
                  </span>
                )}
              </button>
            ))}
            {typeCounts.calibration > 0 && (
              <button
                type="button"
                onClick={() => setTypeFilter("calibration")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  typeFilter === "calibration"
                    ? "bg-[#f26722] text-white"
                    : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100"
                }`}
              >
                Calibration
              </button>
            )}
            {typeFilter !== "all" && typeFilter !== "calibration" && summary[typeFilter as StatusKey].unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markReportStatusRead(typeFilter as StatusKey)}
                className="ml-1 text-sm text-[#f26722] hover:text-[#f26722]/80"
              >
                Mark section read
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-5">
          <div className="flex items-center gap-1.5">
            <Inbox className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Total</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">{items.length}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Bell className="h-4 w-4 shrink-0 text-orange-400" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Unread</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">{unreadCount}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Read</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">{readCount}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {filteredItems.length} notification{filteredItems.length !== 1 ? "s" : ""}
              {filter !== "all" && <span> · {filter}</span>}
            </p>
            <div className="flex items-center gap-1">
              <div className="relative" ref={notifSortRef}>
                <button
                  type="button"
                  onClick={() => { setIsNotifSortOpen((p) => !p); setIsNotifFilterOpen(false); }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                    sortDirection !== "desc"
                      ? "text-[#f26722]"
                      : "text-neutral-700 hover:text-[#f26722] dark:text-white dark:hover:text-[#f26722]"
                  }`}
                  title="Sort"
                >
                  <ArrowDownWideNarrow className="h-5 w-5" />
                </button>
                {isNotifSortOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                      Order
                    </div>
                    {([
                      { value: "desc", label: "Newest first" },
                      { value: "asc", label: "Oldest first" },
                    ] as { value: "asc" | "desc"; label: string }[]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setSortDirection(opt.value); setIsNotifSortOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-tight focus:outline-none ${
                          sortDirection === opt.value
                            ? "bg-orange-50 text-[#f26722] dark:bg-orange-900/20"
                            : "text-neutral-700 hover:bg-neutral-50 dark:text-white dark:hover:bg-dark-100"
                        }`}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {sortDirection === opt.value && <Check className="h-4 w-4" />}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={notifFilterRef}>
                <button
                  type="button"
                  onClick={() => { setIsNotifFilterOpen((p) => !p); setIsNotifSortOpen(false); }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                    filter !== "all"
                      ? "text-[#f26722]"
                      : "text-neutral-700 hover:text-[#f26722] dark:text-white dark:hover:text-[#f26722]"
                  }`}
                  title="Filter"
                >
                  <Filter className="h-5 w-5" />
                </button>
                {isNotifFilterOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                      Status
                    </div>
                    {([
                      { value: "all", label: `All (${items.length})` },
                      { value: "unread", label: `Unread (${unreadCount})` },
                      { value: "read", label: `Read (${readCount})` },
                    ] as { value: FeedFilter; label: string }[]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setFilter(opt.value); setIsNotifFilterOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-tight focus:outline-none ${
                          filter === opt.value
                            ? "bg-orange-50 text-[#f26722] dark:bg-orange-900/20"
                            : "text-neutral-700 hover:bg-neutral-50 dark:text-white dark:hover:bg-dark-100"
                        }`}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {filter === opt.value && <Check className="h-4 w-4" />}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<BellOff className="h-4 w-4" />}
                onClick={markAllUnread}
                disabled={readCount === 0}
              >
                Mark all unread
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<CheckCircle className="h-4 w-4" />}
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                Mark all read
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-red-600 dark:text-red-300">
              <AlertTriangle className="h-8 w-8" />
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => void loadNotifications()}
              >
                Try again
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-neutral-500 dark:text-neutral-400">
              <Inbox className="h-10 w-10" />
              <div>
                <p className="text-sm">
                  {filter === "all"
                    ? "You're all caught up."
                    : `No ${filter} notifications to show.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredItems.map((item) => {
                const itemRead = isRead(item);
                return (
                  <div
                    key={item.id}
                    className={`flex gap-4 p-4 transition-colors ${
                      itemRead
                        ? "bg-white dark:bg-neutral-900"
                        : "bg-orange-50/70 dark:bg-orange-950/10"
                    }`}
                  >
                    <div className="mt-1 flex-shrink-0">
                      {item.kind === "report" ? (
                        <Briefcase className="h-5 w-5 text-[#f26722]" />
                      ) : item.status === "needs_calibration" ? (
                        <Gauge className="h-5 w-5 text-amber-500" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium text-neutral-900 dark:text-white">
                          {item.kind === "report"
                            ? item.assetName
                            : item.equipmentName}
                        </h2>
                        {!itemRead && (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
                            Unread
                          </Badge>
                        )}
                        <Badge variant="secondary">
                          {item.kind === "report"
                            ? STATUS_LABELS[item.status]
                            : item.status === "needs_calibration"
                              ? "Needs calibration"
                              : "Equipment out of cal"}
                        </Badge>
                        {item.kind === "report" &&
                          item.urgency === "critical" && (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200">
                              Critical
                            </Badge>
                          )}
                      </div>

                      {item.kind === "report" ? (
                        <>
                          <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                            {item.jobNumber ? `Job ${item.jobNumber}` : "Job"} •{" "}
                            {item.jobTitle}
                          </p>
                          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            Created {formatDateTime(item.createdAt)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                            {(item.ampId || item.serialNumber) && (
                              <span>
                                {item.ampId ? `AMP ID: ${item.ampId}` : ""}
                                {item.ampId && item.serialNumber ? " • " : ""}
                                {item.serialNumber
                                  ? `SN: ${item.serialNumber}`
                                  : ""}
                              </span>
                            )}
                          </p>
                          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            Due {formatDate(item.dueDate)}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openItem(item)}
                      >
                        View
                      </Button>
                      {itemRead ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<BellOff className="h-4 w-4" />}
                          onClick={() => toggleRead(item)}
                        >
                          Mark unread
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<CheckCircle className="h-4 w-4" />}
                          onClick={() => toggleRead(item)}
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
