import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { MessageCircle, X, AlertCircle, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AssetCommentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
}

interface ReportComment {
  id: string;
  title: string;
  review_comments: string;
  reviewed_by: string;
  reviewed_at: string;
  status: string;
  report_type: string;
}

export const AssetCommentsDialog: React.FC<AssetCommentsDialogProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
}) => {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [reviewerDisplayMap, setReviewerDisplayMap] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && assetId) {
      fetchAssetComments();
    }
  }, [isOpen, assetId]);

  const resolveReviewerIdsToEmails = async (
    reviewerIds: string[],
  ): Promise<Record<string, string>> => {
    const map: Record<string, string> = {};
    const uniqueIds = [...new Set(reviewerIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;

    for (const userId of uniqueIds) {
      try {
        const { data: profileData, error: profileError } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, email, full_name")
          .eq("id", userId)
          .maybeSingle();
        if (
          !profileError &&
          profileData &&
          (profileData.full_name || profileData.email)
        ) {
          map[userId] = profileData.full_name || profileData.email;
          continue;
        }
      } catch (_) {}
      try {
        const { data: metaData, error: metaError } = await supabase
          .schema("common")
          .rpc("get_user_metadata", { p_user_id: userId });
        if (!metaError && metaData?.email) {
          map[userId] = metaData.email;
        }
      } catch (_) {}
    }
    return map;
  };

  const fetchAssetComments = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, check if the asset itself has review comments (primary source)
      const { data: assetData, error: assetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select(
          "id, name, review_comments, reviewed_by, reviewed_at, status, file_url",
        )
        .eq("id", assetId)
        .not("review_comments", "is", null)
        .neq("review_comments", "");

      if (assetError) {
        throw assetError;
      }

      const commentsList: ReportComment[] = [];

      // If asset has comments, add them
      if (assetData && assetData.length > 0) {
        const asset = assetData[0];
        // Extract report type from file_url if available
        let reportType = "Report";
        if (asset.file_url) {
          if (asset.file_url.startsWith("report:/jobs/")) {
            const urlParts = asset.file_url
              .replace("report:/jobs/", "")
              .split("/");
            if (urlParts.length >= 2) {
              reportType = urlParts[1]
                .split("-")
                .map(
                  (word: string) =>
                    word.charAt(0).toUpperCase() + word.slice(1),
                )
                .join(" ");
            }
          } else if (asset.file_url.toLowerCase().endsWith(".pdf")) {
            reportType = "PDF Report";
          }
        }

        commentsList.push({
          id: asset.id,
          title: asset.name || "Asset Review",
          review_comments: asset.review_comments || "",
          reviewed_by: asset.reviewed_by || "",
          reviewed_at: asset.reviewed_at || "",
          status: asset.status || "",
          report_type: reportType,
        });
      }

      // Also check for technical reports linked to this asset (secondary source)
      const { data: reportLinks, error: linkError } = await supabase
        .schema("neta_ops")
        .from("asset_reports")
        .select("report_id")
        .eq("asset_id", assetId);

      if (!linkError && reportLinks && reportLinks.length > 0) {
        const reportIds = reportLinks.map((link) => link.report_id);

        // Fetch technical reports with review comments
        const { data: reportsData, error: reportsError } = await supabase
          .schema("neta_ops")
          .from("technical_reports")
          .select(
            "id, title, review_comments, reviewed_by, reviewed_at, status, report_type",
          )
          .in("id", reportIds)
          .not("review_comments", "is", null)
          .neq("review_comments", "");

        if (!reportsError && reportsData) {
          // Add technical report comments (avoid duplicates if same as asset)
          reportsData.forEach((report) => {
            // Only add if it's not already in the list (different ID)
            if (!commentsList.find((c) => c.id === report.id)) {
              commentsList.push(report);
            }
          });
        }
      }

      // Customer flags from the ampOS ACCESS portal (third source). These don't
      // change the report's status — they surface here as their own entries.
      const { data: flagData, error: flagError } = await supabase
        .schema("common")
        .from("report_flags")
        .select("id, reason, flagged_by, created_at, status")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false });

      if (!flagError && flagData) {
        flagData.forEach((flag) => {
          commentsList.push({
            id: flag.id,
            title:
              flag.status === "resolved"
                ? "Customer flag (resolved)"
                : "Customer flag",
            review_comments: flag.reason || "",
            reviewed_by: flag.flagged_by,
            reviewed_at: flag.created_at,
            status: "flagged",
            report_type: "ampOS ACCESS",
          });
        });
      }

      // Sort by reviewed_at descending
      commentsList.sort((a, b) => {
        const dateA = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
        const dateB = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
        return dateB - dateA;
      });

      setComments(commentsList);

      const reviewerIds = commentsList
        .map((c) => c.reviewed_by)
        .filter(Boolean);
      const displayMap = await resolveReviewerIdsToEmails(reviewerIds);
      setReviewerDisplayMap(displayMap);
    } catch (error: any) {
      console.error("Error fetching asset comments:", error);
      setError(`Failed to load comments: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-600 dark:text-green-400";
      case "rejected":
      case "issue":
        return "text-red-600 dark:text-red-400";
      case "in-review":
      case "ready_for_review":
        return "text-blue-600 dark:text-blue-400";
      case "flagged":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-neutral-600 dark:text-white";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return "✅";
      case "rejected":
      case "issue":
        return "❌";
      case "in-review":
      case "ready_for_review":
        return "👀";
      case "flagged":
        return "🚩";
      default:
        return "📝";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center">
            <MessageCircle className="h-5 w-5 text-[#f26722] mr-2" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Review Comments
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Asset Info */}
        <div className="px-6 py-3 bg-neutral-50 dark:bg-dark-150 border-b border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-white">
            <span className="font-medium">Asset:</span> {assetName}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-600 dark:text-red-400">{error}</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageCircle className="h-12 w-12 text-neutral-400 dark:text-white mb-3" />
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-1">
                No Review Comments
              </h3>
              <p className="text-neutral-600 dark:text-white">
                This asset doesn't have any review comments yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 bg-neutral-50 dark:bg-dark-150"
                >
                  {/* Comment Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {getStatusIcon(comment.status)}
                      </span>
                      <div>
                        <h4 className="font-medium text-neutral-900 dark:text-white">
                          {comment.title}
                        </h4>
                        <p className="text-sm text-neutral-600 dark:text-white">
                          {comment.report_type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-neutral-500 dark:text-white">
                      <div
                        className={`font-medium ${getStatusColor(comment.status)}`}
                      >
                        {comment.status.charAt(0).toUpperCase() +
                          comment.status.slice(1)}
                      </div>
                      {comment.reviewed_at && (
                        <div className="flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(
                            new Date(comment.reviewed_at),
                            "MMM d, yyyy HH:mm",
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comment Content */}
                  <div className="bg-white dark:bg-dark-150 rounded-none p-3 border border-neutral-200 dark:border-neutral-600">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">
                          {comment.review_comments}
                        </p>
                        {comment.reviewed_by && (
                          <p className="text-xs text-neutral-500 dark:text-white mt-2">
                            Reviewed by:{" "}
                            {reviewerDisplayMap[comment.reviewed_by] ??
                              comment.reviewed_by}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className="text-neutral-700 dark:text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
