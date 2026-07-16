import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  User as UserIcon,
  Settings,
  LogOut,
  Eye,
  EyeOff,
  Phone,
  Gauge,
  AlertTriangle,
  Bookmark,
  ClipboardCheck,
  Flag,
  ChevronLeft,
  ShieldCogCorner,
  Moon,
  Sun,
  BookOpen,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/components/theme/theme-provider";
import { useDemoMode } from "@/lib/DemoModeContext";
import { useDivision } from "@/App";
import { SettingsSubmenu } from "@/components/ui/SettingsSubmenu";
import { ProfileView } from "@/components/profile/ProfileView";
import { AboutPopup } from "@/components/ui/AboutPopup";
import { ShortcutService, Shortcut } from "@/services/ShortcutService";
import { ShortcutsDropdown } from "@/components/shortcuts/ShortcutsDropdown";
import { ReviewShortcutsDropdown } from "@/components/shortcuts/ReviewShortcutsDropdown";
import {
  canAccessReportApprovals,
  fetchJobsWithReportsForReview,
  fetchJobAssetLinksByAssetIds,
} from "@/lib/reviewShortcuts";
import { supabase } from "@/lib/supabase";
import { fetchAmpContacts } from "@/services/ampContactsService";
import type { AmpContact } from "@/services/ampContactsService";
import { CommunityBoardPopover } from "@/components/community/CommunityBoardPopover";
import { QuickLogInteraction } from "@/components/sales/QuickLogInteraction";
import { canLogInteractions } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { navigateFromShortcut } from "@/lib/shortcutNavigation";
import { cn } from "@/lib/utils";
import { useSiteLogos } from "@/services/siteThemeService";

type ReviewNotification = {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  assetId: string;
  assetName: string;
  createdAt: string;
  status?: "ready_for_review" | "approved" | "issue";
  urgency?: "normal" | "critical";
};

type NotificationSummary = {
  status: "ready_for_review" | "issue" | "approved";
  jobCount: number;
  reportCount: number;
};

type JobGroup = {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  count: number;
  oldest: string;
  hasCritical: boolean;
};

const HIDDEN_NOTIF_JOB_IDS_KEY = "hiddenNotificationJobIds";
const NOTIF_LAST_SEEN_KEY = "notifLastSeenByStatus";
// Shared with NotificationsPage so the bell badge and the page agree on which
// items are read. The page persists these; the bell reads them.
const MANUALLY_READ_KEY = "notifManuallyRead";
const MANUAL_UNREAD_KEY = "notifManualUnread";
const CALIBRATION_SEEN_KEY = "notifSeenCalibrationIds";
// Fired by either surface after any read/unread change so the other updates
// instantly (no refetch, no poll wait).
const NOTIF_UPDATED_EVENT = "notificationsUpdated";

function readStoredSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

type StatusKey = "ready_for_review" | "issue" | "approved";

type CalibrationDetailStatus = "needs_calibration" | "equipment_out_of_cal";
type NotificationDetailStatus =
  | NotificationSummary["status"]
  | CalibrationDetailStatus
  | null;

type CalibrationEquipmentItem = {
  id: string;
  equipment_name: string;
  calibration_due_date: string;
  serial_number: string | null;
  amp_id: string | null;
};

const headerIconButtonClass =
  "rounded-none w-10 h-10 p-0 flex items-center justify-center text-neutral-600 dark:text-white hover:text-brand dark:hover:text-brand bg-transparent hover:bg-transparent focus:outline-none focus:text-brand focus:bg-brand/10 focus:ring-2 focus:ring-brand/30";

const headerIconButtonActiveClass =
  "text-brand bg-brand/10 ring-2 ring-brand/30";

type HeaderTooltip = {
  text: string;
  x: number;
  y: number;
} | null;

export interface HeaderBarProps {
  onEnterEditMode?: () => void;
  className?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onEnterEditMode,
  className,
}) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { iconUrl } = useSiteLogos();
  const { isDemoMode, toggleDemoMode, maskJobTitle } = useDemoMode();
  const { setDivision } = useDivision();
  const { theme, setTheme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggleDarkMode = () => setTheme(isDark ? "light" : "dark");

  const canSeeDemoMode = !!user;
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [headerTooltip, setHeaderTooltip] = useState<HeaderTooltip>(null);

  const showTooltip = (e: React.MouseEvent, text: string) => {
    setHeaderTooltip({ text, x: e.clientX - 12, y: e.clientY + 14 });
  };
  const hideTooltip = () => setHeaderTooltip(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<ReviewNotification[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<
    NotificationSummary[]
  >([]);
  const [detailStatus, setDetailStatus] =
    useState<NotificationDetailStatus>(null);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [calibrationNeedsList, setCalibrationNeedsList] = useState<
    CalibrationEquipmentItem[]
  >([]);
  const [calibrationOutList, setCalibrationOutList] = useState<
    CalibrationEquipmentItem[]
  >([]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSettingsSubmenuOpen, setIsSettingsSubmenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [headerShortcuts, setHeaderShortcuts] = useState<Shortcut[]>([]);
  const [isShortcutMenuOpen, setIsShortcutMenuOpen] = useState(false);
  const [isReviewMenuOpen, setIsReviewMenuOpen] = useState(false);
  const [reviewJobCount, setReviewJobCount] = useState(0);
  const [openReportFlagCount, setOpenReportFlagCount] = useState(0);
  const [hiddenShortcutCount, setHiddenShortcutCount] = useState(0);
  const shortcutsBarRef = useRef<HTMLDivElement>(null);
  const shortcutMenuRef = useRef<HTMLDivElement>(null);
  const reviewMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const contactsRef = useRef<HTMLDivElement>(null);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [ampContacts, setAmpContacts] = useState<AmpContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsSearch, setContactsSearch] = useState("");
  const contactsQuery = contactsSearch.trim().toLowerCase();
  const filteredAmpContacts = contactsQuery
    ? ampContacts.filter((c) =>
        [c.name, c.role, c.email, c.work_phone].some((v) =>
          v.toLowerCase().includes(contactsQuery),
        ),
      )
    : ampContacts;
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<StatusKey, string>>({
    ready_for_review: "",
    issue: "",
    approved: "",
  });
  const [unseenCounts, setUnseenCounts] = useState<Record<StatusKey, number>>({
    ready_for_review: 0,
    issue: 0,
    approved: 0,
  });
  // Read-state shared with NotificationsPage (kept in sync via localStorage +
  // the NOTIF_UPDATED_EVENT) plus the raw report assets behind each status, so
  // the badge can honor per-item manual reads without refetching.
  const [manualReadIds, setManualReadIds] = useState<Set<string>>(() =>
    readStoredSet(MANUALLY_READ_KEY),
  );
  const [manualUnreadIds, setManualUnreadIds] = useState<Set<string>>(() =>
    readStoredSet(MANUAL_UNREAD_KEY),
  );
  const [seenCalibrationIds, setSeenCalibrationIds] = useState<Set<string>>(
    () => readStoredSet(CALIBRATION_SEEN_KEY),
  );
  const [reportAssetsByStatus, setReportAssetsByStatus] = useState<
    Record<StatusKey, { id: string; createdAt: string }[]>
  >({ ready_for_review: [], issue: [], approved: [] });
  const rtDebounceRef = useRef<number | null>(null);

  const canApproveReports = canAccessReportApprovals(user);
  const canSeeAdminPortal = canAccessReportApprovals(user);
  // Total calibration items in the dropdown lists (used only to decide whether
  // to show the bell at all — not the unread badge number).
  const calibrationNotificationCount =
    calibrationNeedsList.length + calibrationOutList.length;

  // Unread counts that match NotificationsPage exactly: a report is unread when
  // it's newer than its status' last-seen AND not manually marked read; a
  // calibration item is unread when it isn't in the seen set or manual-read set.
  const reportUnseenCount = canApproveReports
    ? (["ready_for_review", "issue", "approved"] as StatusKey[]).reduce(
        (sum, status) => {
          const threshold = lastSeen[status]
            ? new Date(lastSeen[status]).getTime()
            : 0;
          return (
            sum +
            reportAssetsByStatus[status].filter((asset) =>
              manualUnreadIds.has(asset.id)
                ? true
                : !manualReadIds.has(asset.id) &&
                  new Date(asset.createdAt).getTime() > threshold,
            ).length
          );
        },
        0,
      )
    : 0;

  const isCalibrationUnread = (pid: string) =>
    manualUnreadIds.has(pid)
      ? true
      : !manualReadIds.has(pid) && !seenCalibrationIds.has(pid);

  const calibrationUnreadCount =
    calibrationNeedsList.filter((item) =>
      isCalibrationUnread(`needs_calibration:${item.id}`),
    ).length +
    calibrationOutList.filter((item) =>
      isCalibrationUnread(`equipment_out_of_cal:${item.id}`),
    ).length;

  const totalUnreadCount =
    (canApproveReports ? reportUnseenCount : 0) + calibrationUnreadCount;

  const showNotificationBell =
    canApproveReports ||
    calibrationNotificationCount > 0 ||
    reportUnseenCount > 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
        setIsSettingsSubmenuOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        contactsRef.current &&
        !contactsRef.current.contains(event.target as Node)
      ) {
        setIsContactsOpen(false);
      }
      if (
        shortcutMenuRef.current &&
        !shortcutMenuRef.current.contains(event.target as Node)
      ) {
        setIsShortcutMenuOpen(false);
      }
      if (
        reviewMenuRef.current &&
        !reviewMenuRef.current.contains(event.target as Node)
      ) {
        setIsReviewMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.href = "/login";
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleViewProfile = () => {
    setIsProfileMenuOpen(false);
    setIsProfileViewOpen(true);
  };

  const handleSettingsToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsSubmenuOpen((open) => !open);
  };

  const handleAbout = () => {
    setIsProfileMenuOpen(false);
    setIsSettingsSubmenuOpen(false);
    setIsAboutOpen(true);
  };

  const loadHeaderShortcuts = async () => {
    if (!user) return;
    try {
      const data = await ShortcutService.getUserShortcuts(user.id);
      setHeaderShortcuts(data);
    } catch (err) {
      console.error("Error loading header shortcuts:", err);
    }
  };

  useEffect(() => {
    if (user) {
      loadHeaderShortcuts();
    }
  }, [user]);

  const loadReviewJobCount = async () => {
    if (!user || !canAccessReportApprovals(user)) {
      setReviewJobCount(0);
      return;
    }
    try {
      const jobs = await fetchJobsWithReportsForReview();
      setReviewJobCount(jobs.length);
    } catch {
      setReviewJobCount(0);
    }
  };

  const loadOpenReportFlagCount = async () => {
    if (!user || !canAccessReportApprovals(user)) {
      setOpenReportFlagCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .schema("common")
        .from("report_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");

      if (error) throw error;
      setOpenReportFlagCount(count || 0);
    } catch (error) {
      console.warn("[HeaderBar] Failed to load open report flag count:", error);
      setOpenReportFlagCount(0);
    }
  };

  useEffect(() => {
    void loadReviewJobCount();
    void loadOpenReportFlagCount();
    if (!canAccessReportApprovals(user)) return;
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
        void loadReviewJobCount();
        void loadOpenReportFlagCount();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!isReviewMenuOpen) {
      void loadReviewJobCount();
      void loadOpenReportFlagCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewMenuOpen]);

  const handleHeaderShortcutClick = (url: string) => {
    navigateFromShortcut(url, navigate, setDivision);
  };

  // Refresh the header shortcut tabs whenever the dropdown closes (edits made inside it)
  useEffect(() => {
    if (!isShortcutMenuOpen) loadHeaderShortcuts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShortcutMenuOpen]);

  useEffect(() => {
    const container = shortcutsBarRef.current;
    if (!container) return;

    const calculate = () => {
      const buttons = container.querySelectorAll("[data-shortcut-tab]");
      const containerRight = container.getBoundingClientRect().right;
      let hidden = 0;
      buttons.forEach((btn) => {
        if (
          (btn as HTMLElement).getBoundingClientRect().right >
          containerRight + 1
        ) {
          hidden++;
        }
      });
      setHiddenShortcutCount(hidden);
    };

    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    requestAnimationFrame(calculate);

    return () => observer.disconnect();
  }, [headerShortcuts]);

  const fetchAssetsByStatus = async (
    status: "ready_for_review" | "approved" | "issue",
  ) => {
    const { data: assetsData, error: assetsError } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select("id, name, created_at, status, urgency")
      .eq("status", status)
      .order("created_at", { ascending: true });
    if (assetsError) throw assetsError;
    if (!assetsData || assetsData.length === 0)
      return { assets: [], groups: [] as JobGroup[] };

    const assetIds = assetsData.map((a) => a.id);
    const links = await fetchJobAssetLinksByAssetIds(assetIds);
    if (links.length === 0)
      return { assets: [], groups: [] as JobGroup[] };

    const jobIdByAsset: Record<string, string> = {};
    links.forEach((l) => {
      jobIdByAsset[l.asset_id] = l.job_id;
    });
    const jobIds = Array.from(new Set(links.map((l) => l.job_id)));

    const { data: jobs, error: jobsError } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .select("id, title, job_number, deleted_at")
      .in("id", jobIds);
    if (jobsError) throw jobsError;
    const jobById: Record<
      string,
      {
        id: string;
        title: string;
        job_number?: string;
        deleted_at?: string | null;
      }
    > = {};
    (jobs || []).forEach((j) => {
      jobById[j.id] = j;
    });

    const groupMap: Record<string, JobGroup> = {};
    assetsData.forEach((a) => {
      const jid = jobIdByAsset[a.id];
      if (!jid) return;
      const jb = jobById[jid];
      if (!jb) return;
      if (jb.deleted_at) return;
      if (hiddenJobIds.has(jid)) return;
      if (!groupMap[jid]) {
        groupMap[jid] = {
          jobId: jid,
          jobTitle: maskJobTitle(jb?.title) || "Job",
          jobNumber: jb?.job_number,
          count: 0,
          oldest: a.created_at,
          hasCritical: false,
        };
      }
      groupMap[jid].count += 1;
      if (a.urgency === "critical") {
        groupMap[jid].hasCritical = true;
      }
      if (new Date(a.created_at) < new Date(groupMap[jid].oldest)) {
        groupMap[jid].oldest = a.created_at;
      }
    });

    const groups: JobGroup[] = Object.values(groupMap).sort(
      (a, b) => new Date(a.oldest).getTime() - new Date(b.oldest).getTime(),
    );

    const assets: ReviewNotification[] = assetsData
      .filter((a) => {
        const jid = jobIdByAsset[a.id];
        const jb = jobById[jid];
        return jb && !jb.deleted_at && !hiddenJobIds.has(jid);
      })
      .map((a) => ({
        jobId: jobIdByAsset[a.id],
        jobTitle: maskJobTitle(jobById[jobIdByAsset[a.id]]?.title) || "Job",
        jobNumber: jobById[jobIdByAsset[a.id]]?.job_number,
        assetId: a.id,
        assetName: a.name,
        createdAt: a.created_at,
        status: status,
        urgency: a.urgency || "normal",
      }));

    return { assets, groups };
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<StatusKey, string>>;
        setLastSeen((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // no-op
    }
  }, []);

  // Re-read the shared read-state whenever NotificationsPage (or another tab)
  // changes it, so the badge updates instantly without waiting for the poll or
  // a refetch. The underlying report/calibration data stays cached; only the
  // read signals are re-read, and the badge counts are derived from both.
  useEffect(() => {
    const syncReadState = () => {
      setManualReadIds(readStoredSet(MANUALLY_READ_KEY));
      setManualUnreadIds(readStoredSet(MANUAL_UNREAD_KEY));
      setSeenCalibrationIds(readStoredSet(CALIBRATION_SEEN_KEY));
      try {
        const raw = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
        const parsed = raw
          ? (JSON.parse(raw) as Partial<Record<StatusKey, string>>)
          : {};
        setLastSeen((prev) => ({ ...prev, ...parsed }));
      } catch {
        // no-op
      }
    };
    window.addEventListener(NOTIF_UPDATED_EVENT, syncReadState);
    window.addEventListener("storage", syncReadState);
    return () => {
      window.removeEventListener(NOTIF_UPDATED_EVENT, syncReadState);
      window.removeEventListener("storage", syncReadState);
    };
  }, []);

  const persistLastSeen = (map: Record<StatusKey, string>) => {
    try {
      localStorage.setItem(NOTIF_LAST_SEEN_KEY, JSON.stringify(map));
    } catch {
      // no-op
    }
  };

  const getMaxCreatedAt = (assets: ReviewNotification[]): string => {
    if (assets.length === 0) return "";
    return assets.reduce(
      (max, a) => (new Date(a.createdAt) > new Date(max) ? a.createdAt : max),
      assets[0].createdAt,
    );
  };

  const loadNotificationSummary = async () => {
    if (!user) return;
    const canApprove = canAccessReportApprovals(user);
    try {
      setNotifLoading(true);
      const summary: NotificationSummary[] = [];
      const unseen: Record<StatusKey, number> = {
        ready_for_review: 0,
        issue: 0,
        approved: 0,
      };

      const nextReportAssets: Record<
        StatusKey,
        { id: string; createdAt: string }[]
      > = { ready_for_review: [], issue: [], approved: [] };

      if (canApprove) {
        const statuses: StatusKey[] = ["ready_for_review", "issue", "approved"];
        for (const s of statuses) {
          const { assets, groups } = await fetchAssetsByStatus(s);
          summary.push({
            status: s,
            jobCount: groups.length,
            reportCount: assets.length,
          });
          nextReportAssets[s] = assets.map((a) => ({
            id: a.assetId,
            createdAt: a.createdAt,
          }));
          const ls = lastSeen[s] ? new Date(lastSeen[s]).getTime() : 0;
          const countNew = assets.filter(
            (a) => new Date(a.createdAt).getTime() > ls,
          ).length;
          unseen[s] = countNew;
        }
      }
      setReportAssetsByStatus(nextReportAssets);
      setNotificationSummary(summary);

      try {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const dueInOneMonth = new Date(today);
        dueInOneMonth.setMonth(dueInOneMonth.getMonth() + 1);
        const dueInOneMonthStr = dueInOneMonth.toISOString().slice(0, 10);

        const { data: equipmentRows } = await supabase
          .schema("neta_ops")
          .from("field_equipment")
          .select(
            "id, equipment_name, calibration_due_date, in_service, serial_number, amp_id",
          )
          .not("calibration_due_date", "is", null);

        const inServiceFiltered = (equipmentRows || []).filter(
          (r: { in_service?: boolean }) => r.in_service !== false,
        ) as {
          id: string;
          equipment_name: string;
          calibration_due_date: string;
          serial_number: string | null;
          amp_id: string | null;
        }[];

        const needs: CalibrationEquipmentItem[] = [];
        const out: CalibrationEquipmentItem[] = [];
        for (const r of inServiceFiltered) {
          const due = r.calibration_due_date
            ? String(r.calibration_due_date).slice(0, 10)
            : "";
          if (!due) continue;
          const item: CalibrationEquipmentItem = {
            id: r.id,
            equipment_name: r.equipment_name,
            calibration_due_date: due,
            serial_number: r.serial_number ?? null,
            amp_id: r.amp_id ?? null,
          };
          if (due < todayStr) out.push(item);
          else if (due <= dueInOneMonthStr) needs.push(item);
        }
        setCalibrationNeedsList(needs);
        setCalibrationOutList(out);
      } catch (calErr) {
        console.error("Failed to load calibration summary:", calErr);
        setCalibrationNeedsList([]);
        setCalibrationOutList([]);
      }

      setUnseenCounts(unseen);
      setDetailStatus(null);
      setJobGroups([]);
      setNotifications([]);
    } catch (err) {
      console.error("Failed to load notification summary:", err);
      setNotificationSummary(
        canApprove
          ? [
              { status: "ready_for_review", jobCount: 0, reportCount: 0 },
              { status: "issue", jobCount: 0, reportCount: 0 },
              { status: "approved", jobCount: 0, reportCount: 0 },
            ]
          : [],
      );
      setCalibrationNeedsList([]);
      setCalibrationOutList([]);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    void loadNotificationSummary();
    const id = setInterval(() => {
      void loadNotificationSummary();
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hiddenJobIds]);

  useEffect(() => {
    if (!user || !canAccessReportApprovals(user)) return;
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
        void loadNotificationSummary();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStatusSeen = (status: StatusKey, assets: ReviewNotification[]) => {
    const latest = getMaxCreatedAt(assets);
    if (!latest) return;
    setLastSeen((prev) => {
      const next = { ...prev, [status]: latest };
      persistLastSeen(next);
      return next;
    });
    setUnseenCounts((prev) => ({ ...prev, [status]: 0 }));
    // Clear any force-unread overrides on these reports so they actually read.
    setManualUnreadIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      assets.forEach((a) => next.delete(a.assetId));
      try {
        localStorage.setItem(MANUAL_UNREAD_KEY, JSON.stringify([...next]));
      } catch {
        // no-op
      }
      return next;
    });
    // Let an open NotificationsPage reflect this immediately.
    window.dispatchEvent(new CustomEvent(NOTIF_UPDATED_EVENT));
  };

  const loadDetailForStatus = async (status: NotificationSummary["status"]) => {
    if (!user || !canAccessReportApprovals(user)) return;
    try {
      setNotifLoading(true);
      const { assets, groups } = await fetchAssetsByStatus(status);
      setNotifications(assets);
      setJobGroups(groups);
      setDetailStatus(status);
    } catch (err) {
      console.error("Failed to load notification details:", err);
      setNotifications([]);
      setJobGroups([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const goToJobAssets = (jobId: string) => {
    navigate(`/jobs/${jobId}?tab=assets`);
    setIsNotificationsOpen(false);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_NOTIF_JOB_IDS_KEY);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        setHiddenJobIds(new Set(arr));
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!user || !canAccessReportApprovals(user)) return;
    const channel = supabase
      .channel("notif-assets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "neta_ops", table: "assets" },
        (payload) => {
          const s = (payload.new as { status?: StatusKey })?.status;
          if (
            s &&
            (s === "ready_for_review" || s === "issue" || s === "approved")
          ) {
            if (rtDebounceRef.current)
              window.clearTimeout(rtDebounceRef.current);
            rtDebounceRef.current = window.setTimeout(() => {
              void loadNotificationSummary();
              void loadOpenReportFlagCount();
              rtDebounceRef.current = null;
            }, 250);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "common", table: "report_flags" },
        () => {
          if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
          rtDebounceRef.current = window.setTimeout(() => {
            void loadOpenReportFlagCount();
            rtDebounceRef.current = null;
          }, 250);
        },
      )
      .subscribe();

    return () => {
      try {
        if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
        supabase.removeChannel(channel);
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markAllSeenInCurrentStatus = () => {
    if (!detailStatus || notifications.length === 0) return;
    if (
      detailStatus === "needs_calibration" ||
      detailStatus === "equipment_out_of_cal"
    )
      return;
    markStatusSeen(detailStatus, notifications);
  };

  const markJobSeenInCurrentStatus = (jobId: string) => {
    if (!detailStatus || notifications.length === 0) return;
    if (
      detailStatus === "needs_calibration" ||
      detailStatus === "equipment_out_of_cal"
    )
      return;
    const related = notifications.filter((n) => n.jobId === jobId);
    if (related.length > 0) {
      markStatusSeen(detailStatus, related);
    }
  };

  const tooltipHandlers = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => showTooltip(e, text),
    onMouseMove: (e: React.MouseEvent) => showTooltip(e, text),
    onMouseLeave: hideTooltip,
  });

  return (
    <>
      {headerTooltip && (
        <div
          className="pointer-events-none fixed z-[100] rounded-none border border-orange-200 dark:border-orange-700 bg-white px-3 py-1 text-xs font-medium text-neutral-900 shadow-sm dark:bg-dark-150 dark:text-white"
          style={{
            left: headerTooltip.x,
            top: headerTooltip.y,
            transform: "translateX(-100%)",
          }}
        >
          {headerTooltip.text}
        </div>
      )}
      <div
        className={`bg-white dark:bg-dark-150 p-4 border-none ${className ?? ""}`}
      >
        <div className="flex items-center w-full min-w-0">
          <Link to="/portal" className="shrink-0" aria-label="Back to home">
            <img
              src={iconUrl}
              alt="AMP Logo"
              className="h-12 cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>

          <div className="hidden sm:flex items-center justify-center flex-1 min-w-0 ml-4 border-none">
            <div ref={shortcutsBarRef} className="flex items-center gap-0.5">
              {headerShortcuts.slice(0, 8).map((shortcut) => (
                <button
                  key={shortcut.id}
                  data-shortcut-tab
                  onClick={() => handleHeaderShortcutClick(shortcut.url)}
                  className="px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-brand dark:hover:text-brand hover:bg-orange-50 dark:hover:bg-dark-200 rounded-none transition-colors whitespace-nowrap border border-transparent hover:border-orange-200 dark:hover:border-orange-900/30"
                  title={shortcut.url}
                >
                  {shortcut.title}
                </button>
              ))}
              {hiddenShortcutCount + Math.max(0, headerShortcuts.length - 8) >
                0 && (
                <span className="shrink-0 px-2 py-1 text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                  +
                  {hiddenShortcutCount +
                    Math.max(0, headerShortcuts.length - 8)}{" "}
                  more
                </span>
              )}
            </div>
          </div>

          <div
            className="flex shrink-0 ml-4 items-center justify-center gap-3 sm:gap-4"
            role="toolbar"
            aria-label="Portal shortcuts and account"
          >
            {canSeeAdminPortal && (
              <div className="relative flex h-10 w-10 items-center justify-center">
                <button
                  type="button"
                  aria-label="Admin Portal"
                  {...tooltipHandlers("Admin Portal")}
                  onClick={() => {
                    setIsShortcutMenuOpen(false);
                    setIsReviewMenuOpen(false);
                    setIsContactsOpen(false);
                    setIsNotificationsOpen(false);
                    setIsProfileMenuOpen(false);
                    navigate("/admin-dashboard");
                  }}
                  className={headerIconButtonClass}
                >
                  <ShieldCogCorner className="h-5 w-5" />
                </button>
              </div>
            )}
            <div
              className="relative flex h-10 w-10 items-center justify-center"
              ref={shortcutMenuRef}
            >
              <button
                type="button"
                aria-label="Shortcuts menu"
                aria-haspopup="true"
                aria-expanded={isShortcutMenuOpen}
                {...tooltipHandlers("Shortcuts")}
                onClick={() => {
                  const next = !isShortcutMenuOpen;
                  setIsShortcutMenuOpen(next);
                  if (next) {
                    setIsReviewMenuOpen(false);
                    setIsContactsOpen(false);
                    setIsNotificationsOpen(false);
                    setIsProfileMenuOpen(false);
                  }
                }}
                className={cn(
                  headerIconButtonClass,
                  isShortcutMenuOpen && headerIconButtonActiveClass,
                )}
              >
                <Bookmark className="h-5 w-5" />
              </button>

              {isShortcutMenuOpen && (
                <div className="absolute top-full right-0 mt-2 z-50">
                  <ShortcutsDropdown
                    onNavigate={(url) => {
                      setIsShortcutMenuOpen(false);
                      handleHeaderShortcutClick(url);
                    }}
                  />
                </div>
              )}
            </div>
            {canApproveReports && (
              <div
                className="relative flex h-10 w-10 items-center justify-center"
                ref={reviewMenuRef}
              >
                <button
                  type="button"
                  aria-label="Reports ready for review"
                  aria-haspopup="true"
                  aria-expanded={isReviewMenuOpen}
                  {...tooltipHandlers("Report Review")}
                  onClick={() => {
                    const next = !isReviewMenuOpen;
                    setIsReviewMenuOpen(next);
                    if (next) {
                      setIsShortcutMenuOpen(false);
                      setIsContactsOpen(false);
                      setIsNotificationsOpen(false);
                      setIsProfileMenuOpen(false);
                    }
                  }}
                  className={cn(
                    headerIconButtonClass,
                    "relative",
                    isReviewMenuOpen && headerIconButtonActiveClass,
                  )}
                >
                  <ClipboardCheck className="h-5 w-5" />
                  {reviewJobCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-none bg-brand text-white text-[10px] leading-[18px] text-center">
                      {Math.min(99, reviewJobCount)}
                    </span>
                  )}
                  {openReportFlagCount > 0 && (
                    <span
                      className="absolute top-[15px] -right-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-none bg-yellow-400 text-yellow-950 shadow-sm ring-2 ring-white dark:ring-dark-150"
                      title={`${openReportFlagCount} open customer flag${openReportFlagCount === 1 ? "" : "s"} needing attention`}
                      aria-label={`${openReportFlagCount} open customer flag${openReportFlagCount === 1 ? "" : "s"} needing attention`}
                    >
                      <Flag className="h-3 w-3" />
                    </span>
                  )}
                </button>

                {isReviewMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 z-50">
                    <ReviewShortcutsDropdown
                      openFlagCount={openReportFlagCount}
                      onNavigate={(url) => {
                        setIsReviewMenuOpen(false);
                        handleHeaderShortcutClick(url);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {canLogInteractions(user?.user_metadata?.role, user?.email) && (
              <div
                className="relative flex h-10 w-10 items-center justify-center"
                {...tooltipHandlers("Log Interaction")}
              >
                <QuickLogInteraction />
              </div>
            )}
            <div
              className="relative flex h-10 w-10 items-center justify-center"
              {...tooltipHandlers("Community Board")}
            >
              <CommunityBoardPopover />
            </div>
            <div
              className="relative flex h-10 w-10 items-center justify-center"
              ref={contactsRef}
            >
              <button
                aria-label="AMP contacts"
                {...tooltipHandlers("Contacts")}
                className={cn(
                  headerIconButtonClass,
                  isContactsOpen && headerIconButtonActiveClass,
                )}
                onClick={() => {
                  const next = !isContactsOpen;
                  setIsContactsOpen(next);
                  if (next) {
                    setIsNotificationsOpen(false);
                    setContactsLoading(true);
                    setAmpContacts([]);
                    setContactsSearch("");
                    fetchAmpContacts()
                      .then(setAmpContacts)
                      .catch(() => setAmpContacts([]))
                      .finally(() => setContactsLoading(false));
                  }
                }}
              >
                <Phone className="h-5 w-5" />
              </button>
              {isContactsOpen && (
                <div className="absolute top-full right-0 mt-2 w-[520px] max-w-[calc(100vw-2rem)] origin-top-right rounded-none bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 max-h-[28rem] flex flex-col">
                  <div className="p-3 border-b border-neutral-200 dark:border-dark-200 flex items-center gap-3 shrink-0">
                    <div className="font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      AMP contacts
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={contactsSearch}
                        onChange={(e) => setContactsSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full rounded-none border border-neutral-300 dark:border-dark-200 bg-white dark:bg-dark-100 py-1 pl-7 pr-2 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:border-brand"
                      />
                    </div>
                    <a
                      href="/hr/data/call-list"
                      className="text-xs text-brand hover:underline whitespace-nowrap"
                      onClick={() => setIsContactsOpen(false)}
                    >
                      Manage in HR portal
                    </a>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0">
                    {contactsLoading ? (
                      <div className="flex justify-center p-4">
                        <LoadingSpinner size="md" />
                      </div>
                    ) : ampContacts.length === 0 ? (
                      <div className="p-4 text-sm text-neutral-500 dark:text-white">
                        No contacts. Add them in HR portal → HR Data → Call
                        list.
                      </div>
                    ) : filteredAmpContacts.length === 0 ? (
                      <div className="p-4 text-sm text-neutral-500 dark:text-white">
                        No contacts match “{contactsSearch.trim()}”.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-neutral-50 dark:bg-dark-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-neutral-700 dark:text-neutral-300">
                              Name
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-neutral-700 dark:text-neutral-300">
                              Phone
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-neutral-700 dark:text-neutral-300">
                              Role
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-dark-200">
                          {filteredAmpContacts.map((c) => (
                            <tr
                              key={c.id}
                              className="hover:bg-neutral-50 dark:hover:bg-dark-200/50"
                            >
                              <td className="py-2 px-3 whitespace-nowrap text-neutral-900 dark:text-white">
                                <a
                                  href={`mailto:${c.email}`}
                                  className="hover:underline"
                                >
                                  {c.name}
                                </a>
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <a
                                  href={`tel:${c.work_phone.replace(/\D/g, "")}`}
                                  className="text-brand hover:underline"
                                >
                                  {c.work_phone}
                                </a>
                              </td>
                              <td className="py-2 px-3 text-neutral-600 dark:text-neutral-400">
                                {c.role || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
            {showNotificationBell && (
              <div
                className="relative flex h-10 w-10 items-center justify-center"
                ref={notificationsRef}
              >
                <button
                  aria-label="Notifications"
                  {...tooltipHandlers("Notifications")}
                  className={cn(
                    headerIconButtonClass,
                    "relative",
                    isNotificationsOpen && headerIconButtonActiveClass,
                  )}
                  onClick={() => {
                    const next = !isNotificationsOpen;
                    setIsNotificationsOpen(next);
                    if (next) {
                      setIsContactsOpen(false);
                      setDetailStatus(null);
                      setJobGroups([]);
                      setNotifications([]);
                      void loadNotificationSummary();
                    }
                  }}
                >
                  <Bell className="h-5 w-5" />
                  {totalUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-none bg-brand text-white text-[10px] leading-[18px] text-center">
                      {Math.min(99, totalUnreadCount)}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute top-full right-0 mt-2 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right rounded-none bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                    <div className="p-3 border-b border-neutral-200 dark:border-dark-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-neutral-900 dark:text-white">
                          Notifications
                        </div>
                        {detailStatus === null && (
                          <button
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              navigate("/notifications");
                            }}
                            className="font-medium text-brand hover:underline"
                          >
                            View All
                          </button>
                        )}
                      </div>
                      {canApproveReports && (
                        <div className="text-xs text-neutral-500 dark:text-white">
                          Reports
                        </div>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifLoading ? (
                        <div className="flex justify-center p-4">
                          <LoadingSpinner size="md" />
                        </div>
                      ) : detailStatus === null ? (
                        <div className="divide-y divide-neutral-200 dark:divide-dark-200">
                          {canApproveReports &&
                            notificationSummary.map((row) => (
                              <button
                                key={row.status}
                                onClick={() => loadDetailForStatus(row.status)}
                                className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-200 flex items-center justify-between"
                              >
                                <div className="text-sm font-medium text-neutral-900 dark:text-white">
                                  {row.status === "ready_for_review" &&
                                    "Report approvals"}
                                  {row.status === "issue" && "Report Issues"}
                                  {row.status === "approved" &&
                                    "Reports approved"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-neutral-600 dark:text-white">
                                    {row.jobCount} jobs • {row.reportCount}{" "}
                                    reports
                                  </div>
                                  {unseenCounts[row.status] > 0 && (
                                    <span className="min-w-[16px] h-[16px] px-1 rounded-none bg-red-600 text-white text-[10px] leading-[16px] text-center">
                                      {Math.min(99, unseenCounts[row.status])}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          <button
                            onClick={() => setDetailStatus("needs_calibration")}
                            className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-200 flex items-center justify-between"
                          >
                            <div className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                              <Gauge className="h-4 w-4 text-amber-500" />
                              Needs Calibration
                            </div>
                            <div className="text-xs text-neutral-600 dark:text-white">
                              {calibrationNeedsList.length}{" "}
                              {calibrationNeedsList.length === 1
                                ? "item"
                                : "items"}
                            </div>
                          </button>
                          <button
                            onClick={() =>
                              setDetailStatus("equipment_out_of_cal")
                            }
                            className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-200 flex items-center justify-between"
                          >
                            <div className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              Equipment Out of Cal
                            </div>
                            <div className="text-xs text-neutral-600 dark:text-white">
                              {calibrationOutList.length}{" "}
                              {calibrationOutList.length === 1
                                ? "item"
                                : "items"}
                            </div>
                          </button>
                        </div>
                      ) : detailStatus === "needs_calibration" ||
                        detailStatus === "equipment_out_of_cal" ? (
                        <div>
                          <div className="px-4 py-2 text-xs text-neutral-500 dark:text-white border-b border-neutral-200 dark:border-dark-200 flex items-center justify-between">
                            <span>
                              {detailStatus === "needs_calibration"
                                ? "Needs Calibration"
                                : "Equipment Out of Cal"}
                            </span>
                            <button
                              onClick={() => {
                                setDetailStatus(null);
                                setJobGroups([]);
                                setNotifications([]);
                              }}
                              className="text-brand hover:underline"
                            >
                              Back
                            </button>
                          </div>
                          {(detailStatus === "needs_calibration"
                            ? calibrationNeedsList
                            : calibrationOutList
                          ).length === 0 ? (
                            <div className="p-4 text-sm text-neutral-500 dark:text-white">
                              No items
                            </div>
                          ) : (
                            <div className="divide-y divide-neutral-100 dark:divide-dark-200">
                              {(detailStatus === "needs_calibration"
                                ? calibrationNeedsList
                                : calibrationOutList
                              ).map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setIsNotificationsOpen(false);
                                    navigate(
                                      `/neta/field-equipment?open=${encodeURIComponent(item.id)}`,
                                    );
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-dark-200 text-sm transition-colors"
                                >
                                  <div className="font-medium text-neutral-900 dark:text-white">
                                    {item.equipment_name}
                                  </div>
                                  <div className="text-xs text-neutral-600 dark:text-white mt-0.5 space-y-0.5">
                                    {(item.amp_id || item.serial_number) && (
                                      <div className="flex flex-wrap gap-x-3 gap-y-0">
                                        {item.amp_id && (
                                          <span>AMP ID: {item.amp_id}</span>
                                        )}
                                        {item.serial_number && (
                                          <span>SN: {item.serial_number}</span>
                                        )}
                                      </div>
                                    )}
                                    <div>
                                      Due:{" "}
                                      {new Date(
                                        item.calibration_due_date + "T00:00:00",
                                      ).toLocaleDateString()}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="px-4 py-2 text-xs text-neutral-500 dark:text-white border-b border-neutral-200 dark:border-dark-200 flex items-center justify-between">
                            <span>
                              {detailStatus === "ready_for_review" &&
                                "Report approvals"}
                              {detailStatus === "issue" && "Report Issues"}
                              {detailStatus === "approved" &&
                                "Reports approved"}
                            </span>
                            <div className="flex items-center gap-3">
                              {detailStatus && (
                                <button
                                  onClick={markAllSeenInCurrentStatus}
                                  className="text-brand hover:underline"
                                >
                                  Mark all seen
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setDetailStatus(null);
                                  setJobGroups([]);
                                  setNotifications([]);
                                }}
                                className="text-brand hover:underline"
                              >
                                Back
                              </button>
                            </div>
                          </div>
                          {jobGroups.length === 0 ? (
                            <div className="p-4 text-sm text-neutral-500 dark:text-white">
                              No items
                            </div>
                          ) : (
                            <div className="divide-y divide-neutral-100 dark:divide-dark-200">
                              {jobGroups.map((jg) => (
                                <div key={jg.jobId} className="px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() =>
                                            goToJobAssets(jg.jobId)
                                          }
                                          className="text-sm font-medium text-neutral-900 dark:text-white hover:underline"
                                        >
                                          {jg.jobNumber
                                            ? `Job ${jg.jobNumber}`
                                            : "Job"}{" "}
                                          • {maskJobTitle(jg.jobTitle)}
                                        </button>
                                        {jg.hasCritical && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                            ⚠️ Critical
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-neutral-600 dark:text-white">
                                        {jg.count} reports • Oldest{" "}
                                        {new Date(jg.oldest).toLocaleString()}
                                      </div>
                                    </div>
                                    {detailStatus && (
                                      <button
                                        onClick={() =>
                                          markJobSeenInCurrentStatus(jg.jobId)
                                        }
                                        className="text-xs text-neutral-500 dark:text-white hover:underline whitespace-nowrap"
                                      >
                                        Mark seen
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {detailStatus !== null && (
                      <div className="p-2 border-t border-neutral-200 dark:border-dark-200 text-right flex items-center justify-end gap-3">
                        {detailStatus === "needs_calibration" ||
                        detailStatus === "equipment_out_of_cal" ? (
                          <>
                            <button
                              onClick={() => navigate("/neta/field-equipment")}
                              className="text-xs text-brand hover:underline"
                            >
                              View field equipment
                            </button>
                            <button
                              onClick={() => {
                                setDetailStatus(null);
                                setJobGroups([]);
                                setNotifications([]);
                              }}
                              className="text-xs text-brand hover:underline"
                            >
                              Back to summary
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setDetailStatus(null);
                              setJobGroups([]);
                              setNotifications([]);
                            }}
                            className="text-xs text-brand hover:underline"
                          >
                            Back to summary
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div
              className="relative flex h-10 w-10 items-center justify-center"
              ref={profileMenuRef}
            >
              <button
                className="rounded-none w-10 h-10 bg-neutral-100 dark:bg-dark-150 hover:bg-neutral-200 dark:hover:bg-neutral-600 p-0 overflow-hidden flex items-center justify-center"
                {...tooltipHandlers("Profile")}
                onClick={() => {
                  const next = !isProfileMenuOpen;
                  setIsProfileMenuOpen(next);
                  if (!next) setIsSettingsSubmenuOpen(false);
                }}
              >
                {user?.user_metadata?.profileImage ? (
                  <img
                    src={user.user_metadata.profileImage}
                    alt="Profile"
                    className="h-10 w-10 rounded-none object-cover"
                  />
                ) : (
                  <UserIcon className="h-5 w-5 text-neutral-600 dark:text-white" />
                )}
              </button>
              {isProfileMenuOpen && (
                <div className="absolute top-full right-0 mt-2 z-50">
                  <div className="relative w-64">
                    {isSettingsSubmenuOpen && (
                      <div className="absolute right-full top-0 mr-2">
                        <SettingsSubmenu
                          onClose={() => setIsSettingsSubmenuOpen(false)}
                          onAbout={handleAbout}
                          onEnterEditMode={onEnterEditMode}
                          currentUser={{
                            id: user?.id,
                            email: user?.email,
                            user_metadata: user?.user_metadata,
                          }}
                        />
                      </div>
                    )}
                    <div className="rounded-none bg-white dark:bg-dark-150 shadow-md ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-neutral-200 dark:border-dark-200">
                          <p className="text-sm font-medium text-neutral-900 dark:text-dark-900">
                            {user?.user_metadata?.name || "User"}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-dark-400 truncate">
                            {user?.user_metadata?.role || "No role assigned"}
                          </p>
                          <p className="text-xs text-neutral-400 dark:text-dark-500 truncate mt-1">
                            {user?.email || <LoadingSpinner size="xs" />}
                          </p>
                        </div>
                        <button
                          onClick={handleViewProfile}
                          className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
                        >
                          <Eye className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={handleSettingsToggle}
                          className={`flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50 ${
                            isSettingsSubmenuOpen
                              ? "bg-neutral-100 dark:bg-dark-50"
                              : ""
                          }`}
                        >
                          <Settings className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                          Settings
                        </button>
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            navigate("/hr/handbook");
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
                        >
                          <BookOpen className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                          Employee Handbook
                        </button>
                        {canSeeDemoMode && (
                          <button
                            onClick={toggleDemoMode}
                            className="flex items-center justify-between w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
                          >
                            <span className="flex items-center">
                              {isDemoMode ? (
                                <EyeOff className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                              ) : (
                                <Eye className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                              )}
                              Demo Mode
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-none text-xs font-medium ${
                                isDemoMode
                                  ? "bg-brand text-white"
                                  : "bg-neutral-200 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300"
                              }`}
                            >
                              {isDemoMode ? "On" : "Off"}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={toggleDarkMode}
                          className="flex items-center justify-between w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
                        >
                          <span className="flex items-center">
                            {isDark ? (
                              <Sun className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                            ) : (
                              <Moon className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                            )}
                            {isDark ? "Light Mode" : "Dark Mode (In Testing)"}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-none text-xs font-medium ${
                              isDark
                                ? "bg-brand text-white"
                                : "bg-neutral-200 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            {isDark ? "On" : "Off"}
                          </span>
                        </button>
                        <div className="border-t border-neutral-200 dark:border-dark-200" />
                        <button
                          onClick={handleSignOut}
                          disabled={isSigningOut}
                          className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-red-600/10 dark:hover:bg-dark-50"
                        >
                          <LogOut className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
                          {isSigningOut ? "Signing out..." : "Sign Out"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProfileView
        isOpen={isProfileViewOpen}
        onClose={() => setIsProfileViewOpen(false)}
      />

      <AboutPopup isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </>
  );
};

export default HeaderBar;
