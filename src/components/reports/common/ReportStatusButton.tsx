import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/AuthContext";
import { ChevronDown } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { deriveReportPathParts } from "./ReportPhotos";
import {
  AssetReportStatus,
  notifyAssetStatusChanged,
  updateAssetReportStatus,
} from "@/lib/services/assetReportStatus";

const FULL_LABELS: Record<AssetReportStatus, string> = {
  "not started": "Not Started",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  sent: "Sent",
  issue: "Issue",
  archived: "Archived",
};

/** Ghost-button styling to match the Back to Job / Preview bar it lives in. */
const BUTTON_STYLES: Record<AssetReportStatus, string> = {
  "not started":
    "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-100",
  in_progress:
    "text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-500/10",
  ready_for_review:
    "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10",
  approved:
    "text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10",
  sent: "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-500/10",
  issue: "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10",
  archived:
    "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-dark-100",
};

const DOT_STYLES: Record<AssetReportStatus, string> = {
  "not started": "bg-neutral-400",
  in_progress: "bg-yellow-500",
  ready_for_review: "bg-blue-500",
  approved: "bg-green-500",
  sent: "bg-purple-500",
  issue: "bg-red-500",
  archived: "bg-neutral-500",
};

interface StatusAction {
  target: AssetReportStatus;
  label: string;
  /** Shown under the label in the menu. */
  hint?: string;
  /** Asked before the change goes through. */
  confirm?: string;
}

const WITHDRAW_CONFIRM =
  "This will remove the report from the approval workflow. Are you sure?";

/**
 * Which moves are offered from each status. Approved and Sent are deliberately
 * absent as targets: a report only becomes Approved through the report approvals
 * process, never from this button.
 */
const ACTIONS: Record<AssetReportStatus, StatusAction[]> = {
  "not started": [
    { target: "in_progress", label: "Mark In Progress" },
    { target: "archived", label: "Archive", confirm: "Archive this report?" },
  ],
  in_progress: [
    {
      target: "ready_for_review",
      label: "Submit for Review",
      hint: "Sends the report to the approvals queue",
    },
    { target: "not started", label: "Back to Not Started" },
    { target: "archived", label: "Archive", confirm: "Archive this report?" },
  ],
  ready_for_review: [
    {
      target: "in_progress",
      label: "Back to In Progress",
      hint: "Pulls the report out of the approvals queue",
      confirm: WITHDRAW_CONFIRM,
    },
    {
      target: "archived",
      label: "Archive",
      confirm: `Archive this report? ${WITHDRAW_CONFIRM}`,
    },
  ],
  issue: [
    { target: "in_progress", label: "Mark In Progress" },
    { target: "archived", label: "Archive", confirm: "Archive this report?" },
  ],
  archived: [
    { target: "in_progress", label: "Restore to In Progress" },
    { target: "not started", label: "Restore to Not Started" },
  ],
  approved: [],
  sent: [],
};

/**
 * Report status control for the report toolbar: shows where the report sits in
 * its lifecycle and moves it to the next stage. Self-contained like the photos
 * button — it finds its own asset from the URL, so reports need no extra wiring.
 * Renders nothing until the report has been saved and linked to an asset.
 */
export const ReportStatusButton: React.FC = () => {
  const { user } = useAuth();
  // Re-derived every render so a freshly saved report picks up its new URL.
  const pathParts = deriveReportPathParts();
  // Custom form instances are stored under their own scheme; everything else
  // is a report:/ asset.
  const scheme = pathParts?.slug.startsWith("custom-form/")
    ? "custom-form"
    : "report";
  const jobId = pathParts?.jobId;
  const reportId = pathParts?.reportId;
  const fileUrl = pathParts
    ? `${scheme}:/jobs/${jobId}/${pathParts.slug}/${reportId}`
    : null;

  const [asset, setAsset] = useState<{
    id: string;
    name: string;
    file_url: string;
    template_type?: string | null;
    approved_at?: string | null;
    status: AssetReportStatus;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /** Returns true once the asset row has been found. */
  const loadAsset = useCallback(async () => {
    if (!fileUrl || !jobId || !reportId) {
      setAsset(null);
      return false;
    }
    const columns = "id, name, file_url, template_type, approved_at, status";
    const apply = (row: any) => {
      setAsset({
        ...row,
        status: (row.status || "not started") as AssetReportStatus,
      });
      return true;
    };

    const { data, error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select(columns)
      .eq("file_url", fileUrl)
      .limit(1);

    if (!error && data && data.length > 0) {
      return apply(data[0]);
    }

    // Older assets can carry a different slug for the same report, so fall back
    // to matching on the report id (same approach as useReportLocked).
    const { data: bySuffix } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select(columns)
      .ilike("file_url", `%/${reportId}`);

    const candidate =
      bySuffix?.find((a: any) =>
        (a.file_url || "").startsWith(`${scheme}:/jobs/${jobId}/`),
      ) ||
      bySuffix?.find((a: any) =>
        (a.file_url || "").startsWith(`${scheme}:/jobs/`),
      );

    if (candidate) return apply(candidate);
    setAsset(null);
    return false;
  }, [fileUrl, scheme, jobId, reportId]);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    // A report that was just saved links its asset a moment after the URL
    // changes, so give the row a couple of chances to show up.
    const attempt = async (delays: number[]) => {
      if (cancelled) return;
      const found = await loadAsset();
      if (found || cancelled || delays.length === 0) return;
      const [next, ...rest] = delays;
      timers.push(window.setTimeout(() => attempt(rest), next));
    };
    attempt([2500, 6000]);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [loadAsset]);

  // Keep in step when the status changes elsewhere (approvals, the job page).
  useEffect(() => {
    const onChanged = (e: Event) => {
      const changedId = (e as CustomEvent).detail?.assetId;
      if (!changedId || changedId === asset?.id) loadAsset();
    };
    window.addEventListener("assetStatusChanged", onChanged);
    return () => window.removeEventListener("assetStatusChanged", onChanged);
  }, [asset?.id, loadAsset]);

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!asset) return null;

  const status = asset.status;
  const actions = ACTIONS[status] ?? [];

  const handleSelect = async (action: StatusAction) => {
    if (!jobId) return;
    if (action.confirm && !confirm(action.confirm)) return;
    setIsOpen(false);
    setSaving(true);
    try {
      const result = await updateAssetReportStatus({
        asset,
        jobId,
        newStatus: action.target,
        currentStatus: status,
        userId: user?.id || "",
      });
      setAsset((prev) =>
        prev
          ? {
              ...prev,
              status: action.target,
              approved_at: result.stamped.approved_at ?? prev.approved_at,
            }
          : prev,
      );
      notifyAssetStatusChanged(asset.id, action.target, jobId);
      toast({
        title: `Status: ${FULL_LABELS[action.target]}`,
        description: result.notices.join(" ") || undefined,
        variant: "success",
      });
      result.warnings.forEach((message) =>
        toast({ title: "Warning", description: message, variant: "warning" }),
      );
    } catch (e) {
      toast({
        title: "Failed to update status",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      // Fall back to whatever the database actually holds.
      loadAsset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Report status"
        className={`inline-flex items-center gap-1.5 rounded-none px-2 lg:px-3 py-1.5 text-xs lg:text-sm font-medium disabled:opacity-70 ${BUTTON_STYLES[status]}`}
      >
        {saving ? (
          <LoadingSpinner className="h-3 w-3" size="xs" />
        ) : (
          <span
            className={`h-2 w-2 rounded-full ${DOT_STYLES[status]}`}
            aria-hidden="true"
          />
        )}
        {FULL_LABELS[status]}
        <ChevronDown className="h-3 w-3 lg:h-4 lg:w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-1 w-64 border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Report Status: {FULL_LABELS[status]}
          </div>
          {actions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
              {status === "approved" || status === "sent"
                ? "This report is managed by the report approval process."
                : "No status changes available."}
            </div>
          ) : (
            actions.map((action) => (
              <button
                key={action.target}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(action)}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-700"
              >
                {action.label}
                {action.hint && (
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {action.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ReportStatusButton;
