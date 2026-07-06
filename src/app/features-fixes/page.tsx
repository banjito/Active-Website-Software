import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import {
  Bug,
  Lightbulb,
  Clock,
  Trophy,
  BarChart3,
  EyeOff,
  Eye,
  Download,
  Filter,
  ArrowDownWideNarrow,
  Check,
} from "lucide-react";
import IssueNotes from "@/components/feedback/IssueNotes";
import { HeaderBar } from "@/components/ui/HeaderBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/Badge";

type Issue = {
  id: string;
  title: string;
  description: string | null;
  status:
    | "open"
    | "in_progress"
    | "paused"
    | "resolved"
    | "closed"
    | "duplicate"
    | "wontfix";
  priority: "low" | "normal" | "high" | "urgent";
  type: "issue" | "feature_request";
  reporter_id: string | null;
  page_url: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  paused_at: string | null;
  total_paused_ms: number;
  resolved_at: string | null;
  excluded_from_stats: boolean;
};

type IssueUpdate = {
  id: string;
  issue_id: string;
  updater_id: string | null;
  note: string | null;
  new_status: Issue["status"] | null;
  created_at: string;
};

type IssueAttachment = {
  id: string;
  issue_id: string;
  file_path: string;
  file_url: string | null;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  full_name?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

type StatusFilter = "all" | "open" | "resolved";
type TypeFilter = "all" | "issue" | "feature_request";
type SortBy = "date" | "priority";

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "issue", label: "Issues" },
  { value: "feature_request", label: "Feature Requests" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
] as const;

const SORT_BY_OPTIONS = [
  { value: "date", label: "Date Added" },
  { value: "priority", label: "Priority" },
] as const;

const STATUS_BADGE: Record<
  Issue["status"],
  { label: string; className: string }
> = {
  open: {
    label: "Open",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  in_progress: {
    label: "Ongoing",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  paused: {
    label: "Paused",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  resolved: {
    label: "Resolved",
    className:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  },
  closed: {
    label: "Closed",
    className:
      "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
  },
  duplicate: {
    label: "Duplicate",
    className:
      "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
  },
  wontfix: {
    label: "Won't Fix",
    className:
      "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
};

const StatusBadge = ({ status }: { status: Issue["status"] }) => {
  const config = STATUS_BADGE[status];
  return (
    <Badge variant="secondary" className={config.className}>
      {status === "paused" && <span className="mr-1">⏸</span>}
      {config.label}
    </Badge>
  );
};

const formatDuration = (
  startIso?: string | null,
  endIso?: string | null,
  pausedMs?: number,
) => {
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  let ms = Math.max(0, end - start);

  // Subtract paused time to get actual working duration
  if (pausedMs) {
    ms = Math.max(0, ms - pausedMs);
  }

  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const formatPausedTime = (pausedMs: number) => {
  if (!pausedMs || pausedMs === 0) return "";
  const days = Math.floor(pausedMs / (24 * 3600 * 1000));
  const hours = Math.floor((pausedMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((pausedMs % (3600 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h paused`;
  if (hours > 0) return `${hours}h ${mins}m paused`;
  return `${mins}m paused`;
};

const FeaturesFixesPage: React.FC = () => {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [updatesByIssue, setUpdatesByIssue] = useState<
    Record<string, IssueUpdate[]>
  >({});
  const [attachmentsByIssue, setAttachmentsByIssue] = useState<
    Record<string, IssueAttachment[]>
  >({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [search, setSearch] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedPriority, setEditedPriority] =
    useState<Issue["priority"]>("normal");
  const [editedType, setEditedType] = useState<Issue["type"]>("issue");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100;
  const [interestedPartiesByIssue, setInterestedPartiesByIssue] = useState<
    Record<string, string[]>
  >({});
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [editedInterestedParties, setEditedInterestedParties] = useState<
    string[]
  >([]);
  const [ipSearch, setIpSearch] = useState("");
  const [showIpDropdown, setShowIpDropdown] = useState(false);
  const [resolveIssue, setResolveIssue] = useState<Issue | null>(null);
  const [resolveComment, setResolveComment] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  const loadData = async (showLoadingIndicator: boolean = true) => {
    if (showLoadingIndicator) {
      setLoading(true);
    }
    try {
      const q = supabase
        .schema("common")
        .from("issue_reports")
        .select("*")
        .order("created_at", { ascending: false });
      const { data: rows, error } = await q;
      if (error) throw error;
      setIssues(rows as any);

      // If modal is open and NOT in edit mode, update the selected issue with fresh data
      // Don't update during edit mode to avoid overwriting user's changes
      if (selectedIssue && rows && !isEditMode) {
        const updatedIssue = (rows as Issue[]).find(
          (r: Issue) => r.id === selectedIssue.id,
        );
        if (updatedIssue) {
          setSelectedIssue(updatedIssue);
        }
      }

      // Fetch updates for visible issues in one go
      if (rows && rows.length) {
        const ids = rows.map((r: any) => r.id);

        // Fetch updates
        const { data: upRows, error: upErr } = await supabase
          .schema("common")
          .from("issue_updates")
          .select("*")
          .in("issue_id", ids)
          .order("created_at", { ascending: true });
        if (upErr) throw upErr;
        const grouped: Record<string, IssueUpdate[]> = {};
        (upRows || []).forEach((u) => {
          if (!grouped[u.issue_id]) grouped[u.issue_id] = [];
          grouped[u.issue_id].push(u as any);
        });
        setUpdatesByIssue(grouped);

        // Fetch attachments
        const { data: attachRows, error: attachErr } = await supabase
          .schema("common")
          .from("issue_attachments")
          .select("*")
          .in("issue_id", ids)
          .order("created_at", { ascending: true });
        if (attachErr) throw attachErr;
        const groupedAttach: Record<string, IssueAttachment[]> = {};
        (attachRows || []).forEach((a: any) => {
          if (!groupedAttach[a.issue_id]) groupedAttach[a.issue_id] = [];
          groupedAttach[a.issue_id].push(a as any);
        });
        setAttachmentsByIssue(groupedAttach);

        // Fetch interested parties
        const { data: ipRows } = await supabase
          .schema("common")
          .from("issue_interested_parties")
          .select("issue_id, user_id")
          .in("issue_id", ids);
        const ipGrouped: Record<string, string[]> = {};
        (ipRows || []).forEach((r: any) => {
          if (!ipGrouped[r.issue_id]) ipGrouped[r.issue_id] = [];
          ipGrouped[r.issue_id].push(r.user_id);
        });
        setInterestedPartiesByIssue(ipGrouped);

        // Fetch user profiles for reporters using RPC function
        const reporterIds = [
          ...new Set(rows.map((r: any) => r.reporter_id).filter(Boolean)),
        ];
        if (reporterIds.length > 0) {
          const profiles: Record<string, UserProfile> = {};

          // Fetch each user's metadata using the RPC function
          await Promise.all(
            reporterIds.map(async (userId) => {
              try {
                const { data: metaData, error: metaError } = await supabase
                  .schema("common")
                  .rpc("get_user_metadata", { p_user_id: userId });

                if (!metaError && metaData) {
                  profiles[userId] = {
                    id: userId,
                    email: metaData.email || "",
                    full_name: metaData.name || metaData.full_name,
                    user_metadata: {
                      full_name: metaData.full_name,
                      name: metaData.name,
                    },
                  };
                }
              } catch (err) {
                console.error(
                  `Failed to fetch user metadata for ${userId}:`,
                  err,
                );
              }
            }),
          );

          setUserProfiles(profiles);
        }
      }
    } catch (e) {
      console.error("Failed to load issues:", e);
    } finally {
      if (showLoadingIndicator) {
        setLoading(false);
      }
    }
  };

  // Load all users for interested parties picker
  useEffect(() => {
    (async () => {
      try {
        const { data: profiles } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, full_name, email");
        if (profiles) {
          setAllUsers(
            profiles
              .filter((p: any) => p.id && (p.full_name || p.email))
              .map((p: any) => ({
                id: p.id,
                name:
                  p.full_name || (p.email ? p.email.split("@")[0] : "Unknown"),
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch (err) {
        console.error("Failed to load users for interested parties:", err);
      }
    })();
  }, []);

  // Initial load
  useEffect(() => {
    loadData(true);
  }, []);

  // Background refresh every 30 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadData(false); // Silent background refresh
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const filtered = useMemo(() => {
    let list = issues;
    if (statusFilter === "open") {
      // Include 'open', 'in_progress', and 'paused' in the open filter
      list = list.filter(
        (i) =>
          i.status === "open" ||
          i.status === "in_progress" ||
          i.status === "paused",
      );
    } else if (statusFilter === "resolved") {
      // Treat both 'resolved' and 'closed' as resolved in the view
      list = list.filter(
        (i) => i.status === "resolved" || i.status === "closed",
      );
    }
    if (typeFilter !== "all") {
      list = list.filter((i) => i.type === typeFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(s) ||
          (i.description || "").toLowerCase().includes(s),
      );
    }

    // Sort the list
    if (sortBy === "priority") {
      const priorityOrder: Record<Issue["priority"], number> = {
        urgent: 4,
        high: 3,
        normal: 2,
        low: 1,
      };
      list = [...list].sort((a, b) => {
        const priorityDiff =
          priorityOrder[b.priority] - priorityOrder[a.priority];
        // If priorities are equal, sort by date (newest first)
        if (priorityDiff === 0) {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        return priorityDiff;
      });
    } else {
      // Default: sort by date (newest first) - this matches the database query order
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }

    return list;
  }, [issues, statusFilter, typeFilter, search, sortBy]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter, search, sortBy]);

  useEffect(() => {
    if (!isSortMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target as Node)
      ) {
        setIsSortMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isSortMenuOpen]);

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setIsFilterMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isFilterMenuOpen]);

  function renderSingleChoiceOptions<T extends string>(
    options: ReadonlyArray<{ value: T; label: string }>,
    selectedValue: T,
    setValue: (nextValue: T) => void,
  ) {
    return (
      <div className="space-y-0.5">
        {options.map((option) => {
          const checked = selectedValue === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setValue(option.value);
                setCurrentPage(1);
              }}
              className={`flex w-full items-center gap-2 rounded-none px-2.5 py-1.5 text-left text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-[#6D2C32] ${
                checked
                  ? "bg-orange-50 text-[#6D2C32] dark:bg-orange-900/20"
                  : "text-neutral-700 hover:bg-neutral-50 dark:text-white dark:hover:bg-dark-100"
              }`}
              aria-pressed={checked}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {checked && <Check className="h-4 w-4" />}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Paginated slice for display
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedIssues = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage, ITEMS_PER_PAGE]);

  const toggleExcludeFromStats = async (issue: Issue) => {
    const newValue = !(issue.excluded_from_stats ?? false);
    try {
      const { error } = await supabase
        .schema("common")
        .from("issue_reports")
        .update({ excluded_from_stats: newValue })
        .eq("id", issue.id);
      if (error) throw error;
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issue.id ? { ...i, excluded_from_stats: newValue } : i,
        ),
      );
    } catch (e) {
      console.error("Failed to toggle exclude from stats", e);
    }
  };

  const isAdmin =
    (user?.user_metadata?.role || "") === "Admin" || isSuperUser(user?.email);
  /** Stats column (excluded-from-stats) + workflow actions on Features & Fixes */
  const hasIssueOpsAccess = isSuperUser(user?.email);

  const updateIssue = async (id: string, patch: Partial<Issue>) => {
    const { data, error } = await supabase
      .schema("common")
      .from("issue_reports")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const updatedIssue = { ...data } as Issue;
    setIssues((prev) => prev.map((i) => (i.id === id ? updatedIssue : i)));
    return updatedIssue;
  };

  const handleDeleteIssue = async (issue: Issue) => {
    if (!confirm(`Delete "${issue.title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .schema("common")
        .from("issue_reports")
        .delete()
        .eq("id", issue.id);
      if (error) throw error;
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      closeModal();
    } catch (e: any) {
      console.error("Failed to delete issue", e);
      alert(e?.message || "Failed to delete issue");
    }
  };

  const handlePriorityChange = async (
    issue: Issue,
    value: Issue["priority"],
  ) => {
    try {
      await updateIssue(issue.id, { priority: value });
    } catch (e) {
      console.error("Failed to change priority", e);
      alert("Failed to change priority");
    }
  };

  const handleMarkInProgress = async (issue: Issue) => {
    try {
      await updateIssue(issue.id, {
        status: "in_progress",
        started_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("Failed to mark in progress", e);
      alert(e?.message || "Failed to mark in progress");
    }
  };

  const handleMarkResolved = async (issue: Issue, comment = "") => {
    try {
      await updateIssue(issue.id, {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      });
      const resolutionComment = comment.trim();
      if (resolutionComment && user?.id) {
        supabase
          .schema("common")
          .from("issue_notes")
          .insert({
            issue_id: issue.id,
            user_id: user.id,
            content: resolutionComment,
          })
          .then(({ error }) => {
            if (error)
              console.error("Failed to save resolution comment", error);
          });

        supabase
          .schema("common")
          .from("issue_updates")
          .insert({
            issue_id: issue.id,
            updater_id: user.id,
            new_status: "resolved",
            note: resolutionComment,
          })
          .then(({ error }) => {
            if (error)
              console.error("Failed to save resolution timeline note", error);
          });
      }
      // Notify reporter by email (fire-and-forget) — call function URL directly to avoid client invoke path that can trigger runMicrotasks error
      const fnUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
      if (fnUrl && anonKey) {
        fetch(
          `${fnUrl.replace(/\/rest\/v1.*$/, "")}/functions/v1/issue-resolved-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              issueId: issue.id,
              resolutionComment: resolutionComment || undefined,
            }),
          },
        ).catch(() => {});
      }
    } catch (e: any) {
      console.error("Failed to mark resolved", e);
      alert(e?.message || "Failed to mark resolved");
      throw e;
    }
  };

  const openResolveModal = (issue: Issue) => {
    setResolveIssue(issue);
    setResolveComment("");
  };

  const closeResolveModal = () => {
    if (isResolving) return;
    setResolveIssue(null);
    setResolveComment("");
  };

  const handleConfirmResolve = async () => {
    if (!resolveIssue) return;
    setIsResolving(true);
    try {
      await handleMarkResolved(resolveIssue, resolveComment);
      setResolveIssue(null);
      setResolveComment("");
      closeModal();
    } finally {
      setIsResolving(false);
    }
  };

  const handlePause = async (issue: Issue) => {
    try {
      await updateIssue(issue.id, {
        status: "paused",
        // paused_at will be set automatically by database trigger
      });
    } catch (e: any) {
      console.error("Failed to pause issue", e);
      alert(e?.message || "Failed to pause issue");
    }
  };

  const handleResume = async (issue: Issue) => {
    try {
      await updateIssue(issue.id, {
        status: "in_progress",
        // total_paused_ms will be updated automatically by database trigger
      });
    } catch (e: any) {
      console.error("Failed to resume issue", e);
      alert(e?.message || "Failed to resume issue");
    }
  };

  const getReporterName = (reporterId: string | null): string => {
    if (!reporterId) return "Unknown";
    const profile = userProfiles[reporterId];
    if (!profile) return "Unknown";
    return profile.full_name || profile.email || "Unknown";
  };

  const getUserDisplayName = (userId: string): string => {
    const listUser = allUsers.find((u) => u.id === userId);
    if (listUser?.name) return listUser.name;

    const profile = userProfiles[userId];
    return profile?.full_name || profile?.email || "User";
  };

  const formatDateTimeForCsv = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString() : "";

  const escapeCsvValue = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const handleDownloadCsv = () => {
    if (filtered.length === 0) return;

    const headers = [
      "ID",
      "Type",
      "Title",
      "Description",
      "Status",
      "Priority",
      "Reporter",
      "Interested Parties",
      "Page URL",
      "Date Added",
      "Last Updated",
      "Started",
      "Paused At",
      "Total Paused",
      "Resolved",
      "Duration",
      "Attachments",
      ...(hasIssueOpsAccess ? ["Excluded From Stats"] : []),
    ];

    const rows = filtered.map((issue) => {
      const interestedParties = (interestedPartiesByIssue[issue.id] || [])
        .map(getUserDisplayName)
        .join("; ");
      const attachments = (attachmentsByIssue[issue.id] || [])
        .map((attachment) => attachment.file_url || attachment.file_path)
        .join("; ");

      return [
        issue.id,
        issue.type === "feature_request" ? "Feature Request" : "Issue",
        issue.title,
        issue.description || "",
        issue.status,
        PRIORITY_LABELS[issue.priority],
        getReporterName(issue.reporter_id),
        interestedParties,
        issue.page_url || "",
        formatDateTimeForCsv(issue.created_at),
        formatDateTimeForCsv(issue.updated_at),
        formatDateTimeForCsv(issue.started_at),
        formatDateTimeForCsv(issue.paused_at),
        formatPausedTime(issue.total_paused_ms),
        formatDateTimeForCsv(issue.resolved_at),
        formatDuration(
          issue.started_at || issue.created_at,
          issue.resolved_at,
          issue.total_paused_ms,
        ),
        attachments,
        ...(hasIssueOpsAccess
          ? [issue.excluded_from_stats ? "Yes" : "No"]
          : []),
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const typePart =
      typeFilter === "all" ? "all-types" : typeFilter.replace("_", "-");
    const statusPart =
      statusFilter === "all" ? "all-statuses" : `${statusFilter}-statuses`;

    link.href = url;
    link.download = `features-fixes-${typePart}-${statusPart}-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Stats calculations ──
  const PRIORITIES: Issue["priority"][] = ["urgent", "high", "normal", "low"];
  const PRIORITY_LABELS: Record<Issue["priority"], string> = {
    urgent: "Urgent",
    high: "High",
    normal: "Normal",
    low: "Low",
  };
  const PRIORITY_COLORS: Record<Issue["priority"], string> = {
    urgent: "text-red-600 dark:text-red-400",
    high: "text-orange-600 dark:text-orange-400",
    normal: "text-blue-600 dark:text-blue-400",
    low: "text-neutral-500 dark:text-neutral-400",
  };
  const PRIORITY_BG: Record<Issue["priority"], string> = {
    urgent: "bg-red-50 dark:bg-red-900/20",
    high: "bg-orange-50 dark:bg-orange-900/20",
    normal: "bg-blue-50 dark:bg-blue-900/20",
    low: "bg-neutral-50 dark:bg-neutral-800/40",
  };

  const stats = useMemo(() => {
    // For timing averages only, exclude issues flagged as excluded_from_stats
    const statsIssues = issues.filter((i) => !(i.excluded_from_stats ?? false));

    // Top contributors: count ALL submissions (including excluded) so total reflects every issue they reported
    const reporterCounts: Record<string, number> = {};
    issues.forEach((i) => {
      if (i.reporter_id) {
        reporterCounts[i.reporter_id] =
          (reporterCounts[i.reporter_id] || 0) + 1;
      }
    });
    const topReporters = Object.entries(reporterCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count], idx) => ({
        rank: idx + 1,
        id,
        name: getReporterName(id),
        count,
      }));

    // Helper: average milliseconds
    const avgMs = (
      list: Issue[],
      getStart: (i: Issue) => number | null,
      getEnd: (i: Issue) => number | null,
      subtractPaused = false,
    ) => {
      const valid = list.filter(
        (i) => getStart(i) !== null && getEnd(i) !== null,
      );
      if (valid.length === 0) return null;
      const total = valid.reduce((sum, i) => {
        const s = getStart(i)!;
        const e = getEnd(i)!;
        const paused = subtractPaused ? i.total_paused_ms || 0 : 0;
        return sum + Math.max(0, e - s - paused);
      }, 0);
      return total / valid.length;
    };

    const formatAvg = (ms: number | null) => {
      if (ms === null) return "N/A";
      const days = Math.floor(ms / (24 * 3600 * 1000));
      const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
      const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    };

    // Per-priority breakdown — separate response + fix/impl times for issues vs features
    type PriorityRow = {
      priority: Issue["priority"];
      label: string;
      issueCount: number;
      featureCount: number;
      issueResponse: string;
      featureResponse: string;
      avgFixTime: string;
      avgFeatureTime: string;
    };
    const priorityBreakdown: PriorityRow[] = PRIORITIES.map((p) => {
      // Counts use ALL issues (including excluded)
      const pAllIssues = issues.filter((i) => i.priority === p);
      const allBugs = pAllIssues.filter((i) => i.type === "issue");
      const allFeats = pAllIssues.filter((i) => i.type === "feature_request");

      // Timing averages use only non-excluded issues
      const pStats = statsIssues.filter((i) => i.priority === p);
      const pBugs = pStats.filter((i) => i.type === "issue");
      const pFeats = pStats.filter((i) => i.type === "feature_request");
      const pResBugs = pBugs.filter(
        (i) =>
          (i.status === "resolved" || i.status === "closed") && i.resolved_at,
      );
      const pResFeats = pFeats.filter(
        (i) =>
          (i.status === "resolved" || i.status === "closed") && i.resolved_at,
      );
      const pBugsStarted = pBugs.filter((i) => i.started_at);
      const pFeatsStarted = pFeats.filter((i) => i.started_at);

      return {
        priority: p,
        label: PRIORITY_LABELS[p],
        issueCount: allBugs.length,
        featureCount: allFeats.length,
        issueResponse: formatAvg(
          avgMs(
            pBugsStarted,
            (i) => new Date(i.created_at).getTime(),
            (i) => (i.started_at ? new Date(i.started_at).getTime() : null),
          ),
        ),
        featureResponse: formatAvg(
          avgMs(
            pFeatsStarted,
            (i) => new Date(i.created_at).getTime(),
            (i) => (i.started_at ? new Date(i.started_at).getTime() : null),
          ),
        ),
        avgFixTime: formatAvg(
          avgMs(
            pResBugs,
            (i) =>
              i.started_at
                ? new Date(i.started_at).getTime()
                : new Date(i.created_at).getTime(),
            (i) => new Date(i.resolved_at!).getTime(),
            true,
          ),
        ),
        avgFeatureTime: formatAvg(
          avgMs(
            pResFeats,
            (i) =>
              i.started_at
                ? new Date(i.started_at).getTime()
                : new Date(i.created_at).getTime(),
            (i) => new Date(i.resolved_at!).getTime(),
            true,
          ),
        ),
      };
    });

    // Overall aggregates — counts use ALL issues, resolved count uses all issues too
    const resolvedAll = issues.filter(
      (i) =>
        (i.status === "resolved" || i.status === "closed") && i.resolved_at,
    );
    const openIssues = issues.filter(
      (i) =>
        i.type === "issue" &&
        (i.status === "open" ||
          i.status === "in_progress" ||
          i.status === "paused"),
    ).length;
    const openFeatures = issues.filter(
      (i) =>
        i.type === "feature_request" &&
        (i.status === "open" ||
          i.status === "in_progress" ||
          i.status === "paused"),
    ).length;
    return {
      topReporters,
      priorityBreakdown,
      openIssues,
      openFeatures,
      totalOpen: openIssues + openFeatures,
      totalResolved: resolvedAll.length,
    };
  }, [issues, userProfiles]);

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue);
    setEditedTitle(issue.title);
    setEditedDescription(issue.description || "");
    setEditedPriority(issue.priority);
    setEditedType(issue.type);
    setEditedInterestedParties(interestedPartiesByIssue[issue.id] || []);
    setIpSearch("");
    setIsEditMode(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedIssue(null);
    setIsEditMode(false);
    setResolveIssue(null);
    setResolveComment("");
  };

  const handleStartEdit = () => {
    if (selectedIssue) {
      setEditedTitle(selectedIssue.title);
      setEditedDescription(selectedIssue.description || "");
      setEditedPriority(selectedIssue.priority);
      setEditedType(selectedIssue.type);
      setEditedInterestedParties(
        interestedPartiesByIssue[selectedIssue.id] || [],
      );
      setIpSearch("");
      setIsEditMode(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (selectedIssue) {
      setEditedTitle(selectedIssue.title);
      setEditedDescription(selectedIssue.description || "");
      setEditedPriority(selectedIssue.priority);
      setEditedType(selectedIssue.type);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedIssue) return;

    try {
      const updatedIssue = await updateIssue(selectedIssue.id, {
        title: editedTitle.trim(),
        description: editedDescription.trim(),
        priority: editedPriority,
        type: editedType,
      });

      // Save interested parties: delete existing, insert new
      await supabase
        .schema("common")
        .from("issue_interested_parties")
        .delete()
        .eq("issue_id", selectedIssue.id);
      if (editedInterestedParties.length > 0) {
        await supabase
          .schema("common")
          .from("issue_interested_parties")
          .insert(
            editedInterestedParties.map((uid) => ({
              issue_id: selectedIssue.id,
              user_id: uid,
            })),
          );
      }
      setInterestedPartiesByIssue((prev) => ({
        ...prev,
        [selectedIssue.id]: editedInterestedParties,
      }));

      setSelectedIssue(updatedIssue);
      setIsEditMode(false);
    } catch (e: any) {
      console.error("Failed to update issue", e);
      alert(e?.message || "Failed to update issue");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-[#1e1e1e] dark:text-white">
      <div className="sticky top-0 z-30 w-full shrink-0 border-b border-neutral-200 dark:border-dark-200">
        <HeaderBar />
      </div>
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Features & Fixes
            </h1>
          </div>

          {/* ── Stats Dashboard ── */}
          {!loading && issues.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Top Contributors */}
              <div className="bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-[#6D2C32]" />
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Top Contributors
                    </h3>
                  </div>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {stats.topReporters.length} people
                  </span>
                </div>
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {stats.topReporters.map((r) => {
                    const medal =
                      r.rank === 1
                        ? "🥇"
                        : r.rank === 2
                          ? "🥈"
                          : r.rank === 3
                            ? "🥉"
                            : null;
                    const barPct = stats.topReporters[0]
                      ? Math.round(
                          (r.count / stats.topReporters[0].count) * 100,
                        )
                      : 0;
                    return (
                      <div key={r.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                            {medal ? (
                              <span className="text-base">{medal}</span>
                            ) : (
                              <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500 w-5 text-center">
                                {r.rank}
                              </span>
                            )}
                            {r.name}
                          </span>
                          <span className="text-sm font-bold text-[#6D2C32]">
                            {r.count}
                          </span>
                        </div>
                        <div className="w-full bg-neutral-100 dark:bg-dark-200 rounded-none h-1.5">
                          <div
                            className="h-1.5 rounded-none transition-all"
                            style={{
                              width: `${barPct}%`,
                              backgroundColor:
                                r.rank === 1
                                  ? "#6D2C32"
                                  : r.rank === 2
                                    ? "#f59e0b"
                                    : r.rank === 3
                                      ? "#a3a3a3"
                                      : "#d4d4d4",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {stats.topReporters.length === 0 && (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">
                      No reports yet
                    </p>
                  )}
                </div>
              </div>

              {/* Avg Times by Priority */}
              <div className="lg:col-span-2 bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-[#6D2C32]" />
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Resolution Times by Priority
                    </h3>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th
                          rowSpan={2}
                          className="text-left py-2 px-3 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase align-bottom"
                        >
                          Priority
                        </th>
                        <th
                          rowSpan={2}
                          className="text-center py-2 px-3 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase align-bottom"
                        >
                          Count
                        </th>
                        <th
                          colSpan={2}
                          className="text-center py-1.5 px-3 text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase border-b border-orange-200 dark:border-orange-800"
                        >
                          <span className="inline-flex items-center gap-1">
                            Issues
                          </span>
                        </th>
                        <th
                          colSpan={2}
                          className="text-center py-1.5 px-3 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase border-b border-blue-200 dark:border-blue-800"
                        >
                          <span className="inline-flex items-center gap-1">
                            Features
                          </span>
                        </th>
                      </tr>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th className="text-center py-1.5 px-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Response
                        </th>
                        <th className="text-center py-1.5 px-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Fix Time
                        </th>
                        <th className="text-center py-1.5 px-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Response
                        </th>
                        <th className="text-center py-1.5 px-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Impl Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.priorityBreakdown.map((row) => (
                        <tr
                          key={row.priority}
                          className={`border-b border-neutral-100 dark:border-neutral-800 ${PRIORITY_BG[row.priority]}`}
                        >
                          <td
                            className={`py-2.5 px-3 font-semibold ${PRIORITY_COLORS[row.priority]}`}
                          >
                            {row.label}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium">
                                <Bug className="h-3 w-3" />
                                {row.issueCount}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium">
                                <Lightbulb className="h-3 w-3" />
                                {row.featureCount}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-medium text-neutral-700 dark:text-neutral-300">
                            {row.issueResponse}
                          </td>
                          <td className="py-2.5 px-2 text-center font-medium text-neutral-700 dark:text-neutral-300">
                            {row.avgFixTime}
                          </td>
                          <td className="py-2.5 px-2 text-center font-medium text-neutral-700 dark:text-neutral-300">
                            {row.featureResponse}
                          </td>
                          <td className="py-2.5 px-2 text-center font-medium text-neutral-700 dark:text-neutral-300">
                            {row.avgFeatureTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Summary row */}
                <div className="flex items-center gap-6 mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-none bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <Bug className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Open Issues
                      </p>
                      <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                        {stats.openIssues}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-none bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Open Features
                      </p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stats.openFeatures}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-none bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Resolved
                      </p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">
                        {stats.totalResolved}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-none bg-neutral-100 dark:bg-dark-200 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Total All Time
                      </p>
                      <p className="text-lg font-bold text-neutral-700 dark:text-neutral-300">
                        {issues.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="flex justify-end items-center mb-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className={`w-64 rounded-none border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6D2C32] ${
                  search
                    ? "border-[#6D2C32] bg-orange-50 dark:bg-orange-900/20"
                    : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-dark-150"
                } text-neutral-900 dark:text-white`}
              />
              <div className="relative" ref={filterMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-none focus:outline-none focus:ring-2 focus:ring-[#6D2C32] ${
                    activeFilterCount > 0
                      ? "text-[#6D2C32]"
                      : "text-neutral-700 hover:text-[#6D2C32] dark:text-white dark:hover:text-[#6D2C32]"
                  }`}
                  aria-expanded={isFilterMenuOpen}
                  aria-label="Filter features and fixes"
                  title="Filter"
                >
                  <Filter className="h-5 w-5" />
                </button>
                {isFilterMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-72 overflow-y-scroll rounded-none border border-neutral-200 bg-white p-3 shadow-lg dark:border-dark-300 dark:bg-dark-150 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#6D2C32_#f3f4f6] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:rounded-none [&::-webkit-scrollbar-track]:bg-neutral-100 [&::-webkit-scrollbar-thumb]:rounded-none [&::-webkit-scrollbar-thumb]:bg-[#6D2C32] [&::-webkit-scrollbar-thumb]:hover:bg-[#57232A] dark:[scrollbar-color:#6D2C32_#262626] dark:[&::-webkit-scrollbar-track]:bg-dark-200">
                    <div>
                      <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                        Type
                      </div>
                      {renderSingleChoiceOptions(
                        TYPE_FILTER_OPTIONS,
                        typeFilter,
                        setTypeFilter,
                      )}
                    </div>
                    <div className="mt-2">
                      <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                        Status
                      </div>
                      {renderSingleChoiceOptions(
                        STATUS_FILTER_OPTIONS,
                        statusFilter,
                        setStatusFilter,
                      )}
                    </div>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter("all");
                          setStatusFilter("all");
                          setCurrentPage(1);
                        }}
                        className="mt-3 w-full rounded-none border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-[#6D2C32] dark:border-dark-300 dark:text-white dark:hover:bg-dark-100"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="relative" ref={sortMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSortMenuOpen((prev) => !prev)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-none text-neutral-700 hover:text-[#6D2C32] focus:outline-none focus:ring-2 focus:ring-[#6D2C32] dark:text-white dark:hover:text-[#6D2C32]"
                  aria-expanded={isSortMenuOpen}
                  aria-label="Sort features and fixes"
                  title="Sort"
                >
                  <ArrowDownWideNarrow className="h-5 w-5" />
                </button>
                {isSortMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-none border border-neutral-200 bg-white p-3 shadow-lg dark:border-dark-300 dark:bg-dark-150">
                    <div>
                      <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                        Sort by
                      </div>
                      {renderSingleChoiceOptions(
                        SORT_BY_OPTIONS,
                        sortBy,
                        setSortBy,
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={loading || filtered.length === 0}
                title="Download the current filtered list as a CSV file"
                className="inline-flex h-9 w-9 items-center justify-center rounded-none text-neutral-700 hover:text-[#6D2C32] focus:outline-none focus:ring-2 focus:ring-[#6D2C32] dark:text-white dark:hover:text-[#6D2C32]"
              >
                <Download className="h-5 w-5 hover:text-[#6D2C32]" />
              </button>
            </div>
          </div>

          <section className="bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <LoadingSpinner size="md" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-neutral-500 dark:text-neutral-400">
                No issues found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Title
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 min-w-[7.5rem]">
                        Priority
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Date Added
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Reporter
                      </th>
                      {hasIssueOpsAccess && (
                        <th
                          className="text-center py-3 px-2 text-sm font-medium text-neutral-500 dark:text-neutral-400"
                          title="Exclude from stats"
                        >
                          Stats
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedIssues.map((issue) => {
                      const isExcluded = issue.excluded_from_stats ?? false;
                      return (
                        <tr
                          key={issue.id}
                          className={`border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-dark-100 ${hasIssueOpsAccess && isExcluded ? "opacity-50" : ""}`}
                        >
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded ${
                                issue.type === "feature_request"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                              }`}
                            >
                              {issue.type === "feature_request"
                                ? "Feature"
                                : "Issue"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleIssueClick(issue)}
                              className="text-left w-full"
                            >
                              <div className="font-medium text-[#6D2C32] hover:text-[#57232A] cursor-pointer">
                                {issue.title}
                              </div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[600px]">
                                {issue.description}
                              </div>
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={issue.status} />
                          </td>
                          <td className="py-3 px-4 min-w-[7.5rem]">
                            {isAdmin || user?.id === issue.reporter_id ? (
                              <select
                                value={issue.priority}
                                onChange={(e) =>
                                  handlePriorityChange(
                                    issue,
                                    e.target.value as Issue["priority"],
                                  )
                                }
                                className="form-select text-sm w-40 pr-8"
                              >
                                <option value="low">Low</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                              </select>
                            ) : (
                              <span className="text-sm text-neutral-700 dark:text-neutral-300 inline-block min-w-[5rem]">
                                {PRIORITY_LABELS[issue.priority]}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">
                              {new Date(issue.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">
                              {getReporterName(issue.reporter_id)}
                            </span>
                          </td>
                          {hasIssueOpsAccess && (
                            <td className="py-3 px-2 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExcludeFromStats(issue);
                                }}
                                className={`p-1.5 rounded-none transition-colors ${
                                  isExcluded
                                    ? "text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                }`}
                                title={
                                  isExcluded
                                    ? "Include in stats"
                                    : "Exclude from stats"
                                }
                              >
                                {isExcluded ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && filtered.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Issue Details Modal */}
          {showModal && selectedIssue && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* Overlay */}
              <div
                className="fixed inset-0 bg-black opacity-50"
                onClick={closeModal}
              ></div>

              {/* Modal Content */}
              <div className="relative bg-white dark:bg-dark-150 rounded-none shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto z-50">
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-dark-150 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-4">
                      {isEditMode ? (
                        <input
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="text-2xl font-bold text-neutral-900 dark:text-white w-full bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1"
                          placeholder="Issue title"
                        />
                      ) : (
                        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                          {selectedIssue.title}
                        </h2>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {user?.id === selectedIssue.reporter_id &&
                        !isEditMode && (
                          <button
                            onClick={handleStartEdit}
                            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-none"
                          >
                            Edit
                          </button>
                        )}
                      {isEditMode && (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-none"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 text-sm bg-neutral-500 hover:bg-neutral-600 text-white rounded-none"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        onClick={closeModal}
                        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-2xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Type:
                      </span>
                      {isEditMode ? (
                        <select
                          value={editedType}
                          onChange={(e) =>
                            setEditedType(e.target.value as Issue["type"])
                          }
                          className="form-select w-full mt-1 text-sm"
                        >
                          <option value="issue">Issue</option>
                          <option value="feature_request">
                            Feature Request
                          </option>
                        </select>
                      ) : (
                        <div className="text-neutral-900 dark:text-white mt-1">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              selectedIssue.type === "feature_request"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                            }`}
                          >
                            {selectedIssue.type === "feature_request"
                              ? "Feature Request"
                              : "Issue"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Status:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {selectedIssue.status}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Priority:
                      </span>
                      {isEditMode ? (
                        <select
                          value={editedPriority}
                          onChange={(e) =>
                            setEditedPriority(
                              e.target.value as Issue["priority"],
                            )
                          }
                          className="form-select w-full mt-1 text-sm"
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      ) : (
                        <div className="text-neutral-900 dark:text-white mt-1">
                          {selectedIssue.priority}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Reporter:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {getReporterName(selectedIssue.reporter_id)}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Duration:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {formatDuration(
                          selectedIssue.created_at,
                          selectedIssue.resolved_at,
                          selectedIssue.total_paused_ms,
                        ) || "-"}
                      </div>
                    </div>
                    {selectedIssue.total_paused_ms > 0 && (
                      <div>
                        <span className="font-medium text-neutral-500 dark:text-neutral-400">
                          Time Paused:
                        </span>
                        <div className="text-amber-600 dark:text-amber-400 mt-1">
                          {formatPausedTime(selectedIssue.total_paused_ms)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-3">
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Reported:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {new Date(selectedIssue.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Started:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {selectedIssue.started_at
                          ? new Date(selectedIssue.started_at).toLocaleString()
                          : "-"}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-500 dark:text-neutral-400">
                        Resolved:
                      </span>
                      <div className="text-neutral-900 dark:text-white mt-1">
                        {selectedIssue.resolved_at
                          ? new Date(selectedIssue.resolved_at).toLocaleString()
                          : "-"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-6">
                  {/* Description */}
                  {(selectedIssue.description || isEditMode) && (
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                        Description
                      </h3>
                      {isEditMode ? (
                        <textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          rows={6}
                          className="form-textarea w-full text-neutral-900 dark:text-white bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2"
                          placeholder="Describe the issue..."
                        />
                      ) : (
                        <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                          {selectedIssue.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Interested Parties */}
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                      Interested Parties
                    </h3>
                    {isEditMode ? (
                      <div>
                        <div className="relative">
                          <input
                            type="text"
                            value={ipSearch}
                            onChange={(e) => {
                              setIpSearch(e.target.value);
                              setShowIpDropdown(true);
                            }}
                            onFocus={() => setShowIpDropdown(true)}
                            className="form-input w-full text-neutral-900 dark:text-white bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2"
                            placeholder="Search by name to add..."
                          />
                          {showIpDropdown && ipSearch.trim() && (
                            <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none shadow-lg max-h-40 overflow-y-auto">
                              {allUsers
                                .filter(
                                  (u) =>
                                    !editedInterestedParties.includes(u.id) &&
                                    u.name
                                      .toLowerCase()
                                      .includes(ipSearch.toLowerCase()),
                                )
                                .slice(0, 10)
                                .map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => {
                                      setEditedInterestedParties((prev) => [
                                        ...prev,
                                        u.id,
                                      ]);
                                      setIpSearch("");
                                      setShowIpDropdown(false);
                                    }}
                                    className="block w-full text-left px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-dark-100"
                                  >
                                    {u.name}
                                  </button>
                                ))}
                              {allUsers.filter(
                                (u) =>
                                  !editedInterestedParties.includes(u.id) &&
                                  u.name
                                    .toLowerCase()
                                    .includes(ipSearch.toLowerCase()),
                              ).length === 0 && (
                                <div className="px-3 py-2 text-xs text-neutral-500">
                                  No results
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {editedInterestedParties.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {editedInterestedParties.map((uid) => {
                              const u =
                                allUsers.find((a) => a.id === uid) ||
                                (userProfiles[uid]
                                  ? {
                                      id: uid,
                                      name:
                                        userProfiles[uid].full_name ||
                                        userProfiles[uid].email,
                                    }
                                  : null);
                              return (
                                <span
                                  key={uid}
                                  className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-dark-100 text-neutral-800 dark:text-neutral-200 text-sm px-2.5 py-1 rounded-none"
                                >
                                  {u?.name || "User"}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditedInterestedParties((prev) =>
                                        prev.filter((id) => id !== uid),
                                      )
                                    }
                                    className="text-neutral-500 hover:text-red-500 ml-0.5"
                                  >
                                    ✕
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {(interestedPartiesByIssue[selectedIssue.id] || [])
                          .length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              interestedPartiesByIssue[selectedIssue.id] || []
                            ).map((uid) => {
                              const u =
                                allUsers.find((a) => a.id === uid) ||
                                (userProfiles[uid]
                                  ? {
                                      id: uid,
                                      name:
                                        userProfiles[uid].full_name ||
                                        userProfiles[uid].email,
                                    }
                                  : null);
                              return (
                                <span
                                  key={uid}
                                  className="inline-flex items-center bg-neutral-100 dark:bg-dark-100 text-neutral-800 dark:text-neutral-200 text-sm px-2.5 py-1 rounded-none"
                                >
                                  {u?.name || "User"}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            None
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Page URL */}
                  {selectedIssue.page_url && (
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                        Reported From
                      </h3>
                      <a
                        href={selectedIssue.page_url}
                        className="text-[#6D2C32] hover:text-[#57232A] break-all underline"
                      >
                        {selectedIssue.page_url}
                      </a>
                    </div>
                  )}

                  {/* Attachments */}
                  {attachmentsByIssue[selectedIssue.id] &&
                    attachmentsByIssue[selectedIssue.id].length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                          Attachments
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {attachmentsByIssue[selectedIssue.id].map(
                            (attachment) => {
                              const isImage = attachment.file_path.match(
                                /\.(jpg|jpeg|png|gif|webp)$/i,
                              );
                              return (
                                <div
                                  key={attachment.id}
                                  className="border border-neutral-200 dark:border-neutral-700 rounded-none overflow-hidden"
                                >
                                  {attachment.file_url && isImage ? (
                                    <a
                                      href={attachment.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={attachment.file_url}
                                        alt="Issue attachment"
                                        className="w-full h-48 object-contain bg-neutral-50 dark:bg-dark-100 hover:opacity-90 transition-opacity"
                                        onError={(e) => {
                                          const target =
                                            e.target as HTMLImageElement;
                                          target.style.display = "none";
                                          const parent = target.parentElement;
                                          if (parent) {
                                            parent.innerHTML = `
                                        <div class="w-full h-48 bg-neutral-100 dark:bg-dark-100 flex items-center justify-center">
                                          <div class="text-center p-4">
                                            <p class="text-neutral-500 dark:text-neutral-400 text-sm">Image failed to load</p>
                                            <a href="${attachment.file_url}" target="_blank" class="text-[#6D2C32] hover:text-[#57232A] text-xs underline mt-2 block">Open directly</a>
                                          </div>
                                        </div>
                                      `;
                                          }
                                        }}
                                      />
                                    </a>
                                  ) : attachment.file_url ? (
                                    <a
                                      href={attachment.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="w-full h-48 bg-neutral-100 dark:bg-dark-100 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-dark-200 transition-colors"
                                    >
                                      <div className="text-center p-4">
                                        <svg
                                          className="w-12 h-12 mx-auto text-neutral-400 dark:text-neutral-500 mb-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                          />
                                        </svg>
                                        <p className="text-neutral-700 dark:text-neutral-300 text-sm font-medium">
                                          File Attachment
                                        </p>
                                        <p className="text-[#6D2C32] hover:text-[#57232A] text-xs underline mt-1">
                                          Click to open
                                        </p>
                                      </div>
                                    </a>
                                  ) : (
                                    <div className="w-full h-48 bg-neutral-100 dark:bg-dark-100 flex items-center justify-center">
                                      <span className="text-neutral-500 dark:text-neutral-400">
                                        No preview available
                                      </span>
                                    </div>
                                  )}
                                  <div className="p-3 bg-neutral-50 dark:bg-dark-200">
                                    <p
                                      className="text-xs text-neutral-500 dark:text-neutral-400 truncate"
                                      title={attachment.file_path}
                                    >
                                      {attachment.file_path.split("/").pop()}
                                    </p>
                                    {attachment.file_url && (
                                      <a
                                        href={attachment.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-[#6D2C32] hover:text-[#57232A] underline mt-1 block"
                                      >
                                        Open file
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}

                  {/* Comments & feedback */}
                  <div>
                    <IssueNotes
                      issueId={selectedIssue.id}
                      canComment={
                        !!user?.id &&
                        (isAdmin ||
                          selectedIssue.reporter_id === user.id ||
                          (
                            interestedPartiesByIssue[selectedIssue.id] || []
                          ).includes(user.id))
                      }
                    />
                  </div>

                  {/* Timeline */}
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                      Timeline
                    </h3>
                    <div className="space-y-3">
                      <div className="text-sm">
                        <span className="font-medium text-neutral-900 dark:text-white">
                          Created
                        </span>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {" "}
                          —{" "}
                          {new Date(selectedIssue.created_at).toLocaleString()}
                        </span>
                      </div>
                      {selectedIssue.started_at && (
                        <div className="text-sm">
                          <span className="font-medium text-neutral-900 dark:text-white">
                            Started
                          </span>
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {" "}
                            —{" "}
                            {new Date(
                              selectedIssue.started_at,
                            ).toLocaleString()}
                          </span>
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {" "}
                            (time to start:{" "}
                            {formatDuration(
                              selectedIssue.created_at,
                              selectedIssue.started_at,
                              0,
                            )}
                            )
                          </span>
                        </div>
                      )}
                      {selectedIssue.status === "paused" &&
                        selectedIssue.paused_at && (
                          <div className="text-sm">
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              ⏸ Paused
                            </span>
                            <span className="text-neutral-500 dark:text-neutral-400">
                              {" "}
                              —{" "}
                              {new Date(
                                selectedIssue.paused_at,
                              ).toLocaleString()}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              {" "}
                              (currently paused for{" "}
                              {formatDuration(
                                selectedIssue.paused_at,
                                undefined,
                                0,
                              )}
                              )
                            </span>
                          </div>
                        )}
                      {updatesByIssue[selectedIssue.id] &&
                        updatesByIssue[selectedIssue.id].map((update) => (
                          <div key={update.id} className="text-sm">
                            <span className="font-medium text-neutral-900 dark:text-white">
                              {update.new_status
                                ? `Status → ${update.new_status}`
                                : "Note"}
                            </span>
                            <span className="text-neutral-500 dark:text-neutral-400">
                              {" "}
                              — {new Date(update.created_at).toLocaleString()}
                            </span>
                            {update.note && (
                              <div className="mt-1 text-neutral-700 dark:text-neutral-300 ml-4">
                                {update.note}
                              </div>
                            )}
                          </div>
                        ))}
                      {selectedIssue.resolved_at && (
                        <div className="text-sm">
                          <span className="font-medium text-neutral-900 dark:text-white">
                            Resolved
                          </span>
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {" "}
                            —{" "}
                            {new Date(
                              selectedIssue.resolved_at,
                            ).toLocaleString()}
                          </span>
                          {selectedIssue.started_at ? (
                            <>
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {" "}
                                (active work time:{" "}
                                {formatDuration(
                                  selectedIssue.started_at,
                                  selectedIssue.resolved_at,
                                  selectedIssue.total_paused_ms,
                                )}
                                )
                              </span>
                              <div className="mt-1 text-neutral-500 dark:text-neutral-400 ml-4">
                                Total calendar time:{" "}
                                {formatDuration(
                                  selectedIssue.created_at,
                                  selectedIssue.resolved_at,
                                  0,
                                )}
                                {selectedIssue.total_paused_ms > 0 && (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {" "}
                                    (
                                    {formatPausedTime(
                                      selectedIssue.total_paused_ms,
                                    )}
                                    )
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-500 dark:text-neutral-400">
                              {" "}
                              (total time:{" "}
                              {formatDuration(
                                selectedIssue.created_at,
                                selectedIssue.resolved_at,
                                selectedIssue.total_paused_ms,
                              )}
                              )
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-neutral-50 dark:bg-dark-100 border-t border-neutral-200 dark:border-neutral-700 px-6 py-4 flex justify-between items-center">
                  <div className="flex gap-2">
                    {hasIssueOpsAccess && selectedIssue.status === "open" && (
                      <button
                        onClick={() => {
                          handleMarkInProgress(selectedIssue);
                          closeModal();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-none font-medium"
                      >
                        Mark In Progress
                      </button>
                    )}
                    {hasIssueOpsAccess &&
                      selectedIssue.status === "in_progress" && (
                        <button
                          onClick={() => {
                            handlePause(selectedIssue);
                            closeModal();
                          }}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-none font-medium"
                        >
                          ⏸ Pause
                        </button>
                      )}
                    {hasIssueOpsAccess && selectedIssue.status === "paused" && (
                      <button
                        onClick={() => {
                          handleResume(selectedIssue);
                          closeModal();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-none font-medium"
                      >
                        ▶ Resume
                      </button>
                    )}
                    {hasIssueOpsAccess &&
                      (selectedIssue.status === "in_progress" ||
                        selectedIssue.status === "paused" ||
                        selectedIssue.status === "open") && (
                        <button
                          onClick={() => {
                            openResolveModal(selectedIssue);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-none font-medium"
                        >
                          Mark Resolved
                        </button>
                      )}
                  </div>
                  <div className="flex gap-2 items-center">
                    {selectedIssue.reporter_id === user?.id && (
                      <button
                        onClick={() => handleDeleteIssue(selectedIssue)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-none font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {resolveIssue && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center">
              <div
                className="fixed inset-0 bg-black opacity-50"
                onClick={closeResolveModal}
              ></div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConfirmResolve();
                }}
                className="relative z-[61] w-full max-w-lg mx-4 bg-white dark:bg-dark-150 rounded-none shadow-xl border border-neutral-200 dark:border-neutral-700"
              >
                <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      Mark Resolved
                    </h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      {resolveIssue.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeResolveModal}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-2xl font-bold leading-none"
                    disabled={isResolving}
                  >
                    ×
                  </button>
                </div>
                <div className="px-5 py-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Resolution email note
                  </label>
                  <textarea
                    value={resolveComment}
                    onChange={(e) => setResolveComment(e.target.value)}
                    rows={5}
                    className="form-textarea w-full text-neutral-900 dark:text-white bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2"
                    placeholder="Optional note for the reporter..."
                    disabled={isResolving}
                    autoFocus
                  />
                </div>
                <div className="px-5 py-4 bg-neutral-50 dark:bg-dark-100 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeResolveModal}
                    disabled={isResolving}
                    className="px-4 py-2 bg-neutral-200 dark:bg-dark-200 text-neutral-900 dark:text-white rounded-none hover:bg-neutral-300 dark:hover:bg-dark-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResolving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-none font-medium disabled:opacity-60"
                  >
                    {isResolving ? "Resolving..." : "Resolve"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeaturesFixesPage;
