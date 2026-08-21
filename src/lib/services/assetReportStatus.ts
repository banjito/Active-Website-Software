import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";
import { invalidateReviewJobsCache } from "@/lib/reviewShortcuts";

/**
 * The report lifecycle as stored on neta_ops.assets.status. "issue" is set by a
 * reviewer rejecting a report in the approvals workflow.
 */
export type AssetReportStatus =
  | "not started"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "sent"
  | "issue"
  | "archived";

export interface AssetStatusTarget {
  id: string;
  name: string;
  file_url: string;
  template_type?: string | null;
  approved_at?: string | null;
}

export interface AssetStatusUpdateResult {
  /** Columns actually written alongside the status, so callers can patch local state. */
  stamped: {
    submitted_at?: string;
    submitted_by?: string | null;
    approved_at?: string;
    approved_by?: string | null;
    reviewed_at?: string;
    reviewed_by?: string | null;
    sent_at?: string;
    sent_by?: string | null;
  };
  /** Timestamp used for every stamp in this update. */
  now: string;
  /** Things worth telling the user about ("removed from the approval workflow"). */
  notices: string[];
  /** Non-fatal problems; the status change still went through. */
  warnings: string[];
}

const isReportAsset = (asset: AssetStatusTarget) =>
  typeof asset.file_url === "string" && asset.file_url.startsWith("report:");

/**
 * Moves a report asset to a new status and keeps the technical-report approval
 * workflow in sync: leaving Ready for Review tears the report out of the queue,
 * entering it creates/submits the report, and Sent stamps the technical report.
 *
 * Confirmation prompts are the caller's job — by the time this runs the user has
 * already agreed to the move.
 */
export async function updateAssetReportStatus(params: {
  asset: AssetStatusTarget;
  jobId: string;
  newStatus: AssetReportStatus;
  currentStatus?: AssetReportStatus | null;
  userId: string;
}): Promise<AssetStatusUpdateResult> {
  const { asset, jobId, newStatus, currentStatus, userId } = params;
  const notices: string[] = [];
  const warnings: string[] = [];

  // Pulled back out of review: drop the technical report so it stops showing up
  // for approvers. Approved/Sent are reached through the approvals workflow, which
  // owns the technical report itself, so those are never torn down here.
  const withdrawsFromReview =
    currentStatus === "ready_for_review" &&
    (newStatus === "in_progress" ||
      newStatus === "not started" ||
      newStatus === "archived");
  if (withdrawsFromReview) {
    const { getReportByAssetId, deleteReport } = await import(
      "@/lib/services/reportService"
    );
    const reportResult = await getReportByAssetId(asset.id);
    if (reportResult.data) {
      const deleteResult = await deleteReport(reportResult.data.id);
      if (deleteResult.error) {
        const message =
          deleteResult.error &&
          typeof deleteResult.error === "object" &&
          "message" in deleteResult.error
            ? (deleteResult.error as { message?: string }).message
            : "Unknown error";
        warnings.push(
          `Failed to remove report from approval workflow: ${message ?? "Unknown error"}`,
        );
      } else {
        notices.push("Report has been removed from the approval workflow.");
      }
    }
  }

  // Entering review: create the technical report if needed, then submit it.
  if (newStatus === "ready_for_review" && isReportAsset(asset)) {
    const { getReportByAssetId, createDraftReport, submitReportForApproval } =
      await import("@/lib/services/reportService");

    const existingReportResult = await getReportByAssetId(asset.id);

    if (existingReportResult.data) {
      if (existingReportResult.data.status !== "submitted") {
        const submitResult = await submitReportForApproval(
          existingReportResult.data.id,
          userId,
          "Asset resubmitted for review",
        );
        if (submitResult.error) {
          throw new Error(
            `Failed to submit existing report for approval: ${JSON.stringify(submitResult.error)}`,
          );
        }
      }
    } else {
      const draftResult = await createDraftReport(
        {
          job_id: jobId,
          title: asset.name,
          report_type: asset.template_type || "Technical Report",
          report_data: {
            asset_id: asset.id,
            file_url: asset.file_url,
            asset_name: asset.name,
          },
        },
        userId,
      );
      if (draftResult.error) {
        throw new Error(
          `Failed to create report entry: ${JSON.stringify(draftResult.error)}`,
        );
      }

      const submitResult = await submitReportForApproval(
        draftResult.data!.id,
        userId,
        "Asset submitted for review",
      );
      if (submitResult.error) {
        throw new Error(
          `Failed to submit for approval: ${JSON.stringify(submitResult.error)}`,
        );
      }

      // Clear any stale links first so the asset points at exactly one report.
      const { data: existingLinks, error: linksCheckError } = await supabase
        .schema("neta_ops")
        .from("asset_reports")
        .select("id")
        .eq("asset_id", asset.id);

      if (!linksCheckError && existingLinks && existingLinks.length > 0) {
        const { error: deleteLinksError } = await supabase
          .schema("neta_ops")
          .from("asset_reports")
          .delete()
          .eq("asset_id", asset.id);
        if (deleteLinksError) {
          console.warn(
            "Warning: Failed to clean up existing asset_report links:",
            deleteLinksError,
          );
        }
      }

      const { error: linkError } = await supabase
        .schema("neta_ops")
        .from("asset_reports")
        .insert({ asset_id: asset.id, report_id: draftResult.data!.id });
      if (linkError) {
        console.warn("Warning: Failed to link asset to report:", linkError);
      }
    }
  }

  // Sent: mirror onto the technical report so the approvals view agrees.
  if (newStatus === "sent" && isReportAsset(asset)) {
    const { getReportByAssetId, markReportAsSent } = await import(
      "@/lib/services/reportService"
    );
    try {
      const reportResult = await getReportByAssetId(asset.id);
      if (reportResult.data) {
        const res = await markReportAsSent(
          reportResult.data.id,
          userId,
          "Report marked as sent from Linked Reports",
        );
        if (res.error) {
          console.warn("Failed to mark technical report as sent:", res.error);
        }
      }
    } catch (e) {
      console.warn("Error marking technical report as sent:", e);
    }
  }

  const now = new Date().toISOString();
  const stamped: AssetStatusUpdateResult["stamped"] = {};

  if (newStatus === "ready_for_review") {
    stamped.submitted_at = now;
    stamped.submitted_by = userId || null;
  }

  if (newStatus === "approved") {
    stamped.approved_at = now;
    stamped.approved_by = userId || null;
    stamped.reviewed_at = now;
    stamped.reviewed_by = userId || null;
  }

  if (newStatus === "sent") {
    stamped.sent_at = now;
    stamped.sent_by = userId || null;
    // Sending implies approval; backfill it when the report skipped that stamp.
    if (!asset.approved_at) stamped.approved_at = now;
  }

  // Writing a fixed status onto one row is safe to repeat, and postgrest-js
  // does not retry writes itself, so a dropped connection would otherwise land
  // on the user as "TypeError: Failed to fetch".
  const { error, status } = await withWriteRetry(
    () =>
      supabase
        .schema("neta_ops")
        .from("assets")
        .update({ status: newStatus, ...stamped })
        .eq("id", asset.id),
    { label: `assets.status -> ${newStatus}` },
  );

  if (error) {
    throw new Error(describeSupabaseError(error, status));
  }

  return { stamped, now, notices, warnings };
}

/** Fires the app-wide refresh signal other views listen for. */
export function notifyAssetStatusChanged(
  assetId: string,
  newStatus: AssetReportStatus,
  jobId?: string,
) {
  // The review queue this status change affects is cached and shared, so drop
  // it before the listeners run rather than letting them serve a snapshot taken
  // before the write.
  invalidateReviewJobsCache();
  window.dispatchEvent(
    new CustomEvent("assetStatusChanged", {
      detail: { assetId, newStatus, jobId },
    }),
  );
}
