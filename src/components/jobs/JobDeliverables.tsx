import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Eye, Info, RefreshCw, Send, Settings, Trash2, Undo2 } from "lucide-react";
import {
  confirmMarkSent,
  confirmUnsend,
  unsendDeliverable,
  markDeliverableSent,
  publishDeliverableToAccess,
} from "@/lib/deliverableAccess";

interface Deliverable {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "in_review" | "approved" | "rejected" | "delivered";
  cover_letter_id: string;
  executive_summary_id: string | null;
  combined_pdf_url: string | null;
  created_at: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  delivered_at: string | null;
  published_cover_pdf_path?: string | null;
}

interface CoverLetter {
  id: string;
  name: string | null;
  doc_type: string;
  selected_report_ids: string[];
  created_at: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
  status: string | null;
}

// One customer open in ampOS ACCESS (logged by customer-report-download).
interface AccessView {
  id: string;
  viewed_at: string;
  viewer_name: string | null;
  viewer_email: string | null;
  asset_id: string | null;
  deliverable_id: string | null;
  kind: "report" | "cover" | "packet";
}

const viewerLabel = (v: AccessView) =>
  v.viewer_name || v.viewer_email || "Customer";

const formatViewTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// "Jane Smith, Nov 18, 2:14 PM (+1 more)". Views come newest first.
const describeViews = (views: AccessView[]) => {
  if (views.length === 0) return null;
  const people = new Set(views.map(viewerLabel)).size;
  return `${viewerLabel(views[0])}, ${formatViewTime(views[0].viewed_at)}${
    people > 1 ? ` (+${people - 1} more)` : ""
  }`;
};

interface JobDeliverablesProps {
  jobId: string;
}

const JobDeliverables: React.FC<JobDeliverablesProps> = ({ jobId }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] =
    useState<Deliverable | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCoverLetterId, setSelectedCoverLetterId] =
    useState<string>("");
  const [saving, setSaving] = useState(false);
  // Deliverable currently being published to ampOS ACCESS (one at a time).
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [accessViews, setAccessViews] = useState<AccessView[]>([]);

  useEffect(() => {
    loadDeliverables();
    loadCoverLetters();
    loadAssets();
    loadAccessViews();
  }, [jobId]);

  // Customer opens in ampOS ACCESS for this job, newest first. Fails quietly
  // (e.g. before the access_report_views SQL is run).
  const loadAccessViews = async () => {
    const { data, error } = await supabase
      .schema("common")
      .from("access_report_views")
      .select("id, viewed_at, viewer_name, viewer_email, asset_id, deliverable_id, kind")
      .eq("job_id", jobId)
      .order("viewed_at", { ascending: false })
      .limit(2000);
    if (error) {
      console.warn("Could not load ACCESS views:", error.message);
      return;
    }
    setAccessViews((data as AccessView[]) || []);
  };

  const getPacketReportIds = (deliverable: Deliverable) =>
    coverLetters.find((c) => c.id === deliverable.cover_letter_id)
      ?.selected_report_ids ?? [];

  // Opens of the packet itself or any report inside it.
  const viewsForDeliverable = (deliverable: Deliverable) => {
    const reportIds = getPacketReportIds(deliverable);
    return accessViews.filter(
      (v) =>
        v.deliverable_id === deliverable.id ||
        (v.asset_id !== null && reportIds.includes(v.asset_id)),
    );
  };

  const isInAccess = (deliverable: Deliverable) =>
    deliverable.status === "delivered" || !!deliverable.published_cover_pdf_path;

  const loadDeliverables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("deliverables")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDeliverables(data || []);
    } catch (error: any) {
      console.error("Error loading deliverables:", error);
      toast({ title: "Couldn't load deliverables", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadCoverLetters = async () => {
    try {
      console.log("🔍 Loading cover letters for job:", jobId);

      // First, let's see ALL generated documents for this job to debug
      const { data: allDocs, error: allDocsError } = await supabase
        .schema("neta_ops")
        .from("generated_documents")
        .select("id, name, doc_type, created_at")
        .eq("job_id", jobId);

      console.log("📋 ALL generated documents for this job:", allDocs);
      console.log(
        "📊 Document types found:",
        allDocs?.map((d) => d.doc_type),
      );

      // Now get cover letters (including 'both' type which is cover + summary combined)
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("generated_documents")
        .select("id, name, doc_type, selected_report_ids, created_at")
        .eq("job_id", jobId)
        .in("doc_type", ["cover", "both"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Error loading cover letters:", error);
        // If the column doesn't exist yet, show helpful message
        if (
          error.message?.includes("selected_report_ids") ||
          error.message?.includes("column") ||
          error.code === "42703"
        ) {
          toast({
            title: "Database update needed",
            description:
              'Run add_report_selection_to_cover_letters.sql, then create_deliverables_table.sql. Column "selected_report_ids" is missing from generated_documents.',
            variant: "destructive",
            persistent: true,
          });
        }
        throw error;
      }

      console.log("✅ Cover letters loaded:", data?.length || 0, "found");
      console.log("📄 Cover letters data:", data);
      setCoverLetters(data || []);
    } catch (error: any) {
      console.error("❌ Caught error loading cover letters:", error);
    }
  };

  const loadAssets = async () => {
    try {
      // Query assets directly instead of through job_assets relationship
      const { data: jobAssetData, error: jobAssetError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .select("asset_id")
        .eq("job_id", jobId);

      if (jobAssetError) throw jobAssetError;

      const assetIds = (jobAssetData || []).map((ja: any) => ja.asset_id);

      if (assetIds.length === 0) {
        setAssets([]);
        return;
      }

      // Now get the actual assets (include both report:/ URLs and PDF reports)
      const { data: assetData, error: assetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, file_url, status")
        .in("id", assetIds)
        .or("file_url.like.report:%,file_url.ilike.%.pdf"); // Get both report assets and PDF reports

      if (assetError) throw assetError;

      setAssets(assetData || []);
      console.log(
        "📦 Assets loaded:",
        assetData?.length || 0,
        "reports found (including PDF reports)",
      );
    } catch (error: any) {
      console.error("Error loading assets:", error);
    }
  };

  const handleCreateDeliverable = async () => {
    if (!user || !name.trim() || !selectedCoverLetterId) {
      toast({ title: "Enter a name and pick a cover letter", variant: "warning" });
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("deliverables")
        .insert({
          job_id: jobId,
          name: name.trim(),
          description: description.trim() || null,
          status: "draft",
          cover_letter_id: selectedCoverLetterId,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Deliverable created", variant: "success" });
      setName("");
      setDescription("");
      setSelectedCoverLetterId("");
      setIsCreateDialogOpen(false);
      loadDeliverables();
    } catch (error: any) {
      console.error("Error creating deliverable:", error);
      toast({ title: "Couldn't create deliverable", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Mark as Sent (skips review), then publish to ampOS ACCESS.
  const handleMarkSent = async (deliverable: Deliverable) => {
    if (!(await confirmMarkSent())) return;
    try {
      await markDeliverableSent(deliverable.id);
    } catch (error: any) {
      console.error("Error marking deliverable sent:", error);
      toast({ title: "Couldn't mark as sent", description: error.message, variant: "destructive" });
      return;
    }
    setIsDetailDialogOpen(false);
    loadDeliverables();
    void publishPacketToAccess(deliverable);
  };

  // Re-render the PDFs the customer sees in ampOS ACCESS (one packet at a time).
  const publishPacketToAccess = async (deliverable: Deliverable) => {
    if (publishingId) return;
    setPublishingId(deliverable.id);
    try {
      await publishDeliverableToAccess(deliverable.id);
      loadDeliverables();
    } finally {
      setPublishingId(null);
    }
  };

  // Unsend: back to Draft, so it drops out of ampOS ACCESS.
  const handleUnsend = async (deliverable: Deliverable) => {
    if (!(await confirmUnsend())) return;
    try {
      await unsendDeliverable(deliverable.id);
    } catch (error: any) {
      console.error("Error unsending deliverable:", error);
      toast({ title: "Couldn't remove from ampOS ACCESS", description: error.message, variant: "destructive" });
      return;
    }
    setIsDetailDialogOpen(false);
    loadDeliverables();
  };

  const handleDeleteDeliverable = async (deliverableId: string) => {
    const ok = await confirmDialog({
      title: "Delete this deliverable?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("deliverables")
        .delete()
        .eq("id", deliverableId);

      if (error) throw error;

      toast({ title: "Deliverable deleted", variant: "success" });
      loadDeliverables();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      console.error("Error deleting deliverable:", error);
      toast({ title: "Couldn't delete deliverable", description: error.message, variant: "destructive" });
    }
  };

  const handleViewDeliverable = (deliverable: Deliverable) => {
    // Same tab; the viewer's Back button returns to this Deliverables tab.
    navigate(`/jobs/${jobId}/deliverable/${deliverable.id}`);
  };

  const getStatusBadgeColor = (status: Deliverable["status"]) => {
    switch (status) {
      case "draft":
        return "bg-neutral-500";
      case "in_review":
        return "bg-blue-500";
      case "approved":
        return "bg-green-500";
      case "rejected":
        return "bg-red-500";
      case "delivered":
        return "bg-purple-500";
      default:
        return "bg-neutral-500";
    }
  };

  const getStatusLabel = (status: Deliverable["status"]) => {
    // 'delivered' is still the database value (ACCESS reads it); the UI says Sent.
    if (status === "delivered") return "Sent";
    return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const openDetailDialog = async (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setIsDetailDialogOpen(true);
  };

  const getCoverLetterName = (coverLetterId: string) => {
    const coverLetter = coverLetters.find((cl) => cl.id === coverLetterId);
    return coverLetter?.name || "Cover Letter";
  };

  const getCoverLetterReportCount = (coverLetterId: string) => {
    const coverLetter = coverLetters.find((cl) => cl.id === coverLetterId);
    return coverLetter?.selected_report_ids?.length || 0;
  };

  const getReportNames = (reportIds: string[]) => {
    return reportIds.map((id) => {
      const asset = assets.find((a) => a.id === id);
      return asset?.name || "Unknown Report";
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Deliverables
          </h2>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-brand hover:bg-brand-dark text-white"
        >
          Create Deliverable
        </Button>
      </div>

      {/* Deliverables List */}
      {deliverables.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700">
          <p className="text-neutral-600 dark:text-neutral-400">
            No deliverables yet
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
            First, create a cover letter and select reports. Then create a
            deliverable here.
          </p>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="mt-4 bg-brand hover:bg-brand-dark text-white"
            disabled={coverLetters.length === 0}
          >
            {coverLetters.length === 0
              ? "No Cover Letters Available"
              : "Create First Deliverable"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {deliverables.map((deliverable) => {
            const reportCount = getCoverLetterReportCount(
              deliverable.cover_letter_id,
            );
            return (
              <div
                key={deliverable.id}
                className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        {deliverable.name}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-none text-xs font-medium text-white ${getStatusBadgeColor(deliverable.status)}`}
                      >
                        {getStatusLabel(deliverable.status)}
                      </span>
                    </div>
                    {deliverable.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                        {deliverable.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-neutral-500 dark:text-neutral-400">
                      <span>
                        {getCoverLetterName(deliverable.cover_letter_id)}
                      </span>
                      <span>•</span>
                      <span>{reportCount} report(s)</span>
                      <span>•</span>
                      <span>
                        Created{" "}
                        {new Date(deliverable.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {isInAccess(deliverable) &&
                      (() => {
                        const views = viewsForDeliverable(deliverable);
                        const summary = describeViews(views);
                        return summary ? (
                          <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                            Viewed in ACCESS: {summary} · {views.length} open
                            {views.length === 1 ? "" : "s"}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                            Not viewed in ACCESS yet
                          </p>
                        );
                      })()}
                  </div>
                  <div className="flex gap-2">
                    {deliverable.status !== "delivered" && (
                      <Button
                        onClick={() => handleMarkSent(deliverable)}
                        size="sm"
                        leftIcon={<Send className="h-4 w-4" />}
                      >
                        Mark as Sent
                      </Button>
                    )}
                    <Button
                      onClick={() => handleViewDeliverable(deliverable)}
                      variant="secondary"
                      size="sm"
                      aria-label="View deliverable"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label="Deliverable options"
                          title="Options"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[14rem] bg-white dark:bg-dark-150 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                      >
                        <DropdownMenuItem
                          onClick={() => openDetailDialog(deliverable)}
                          className="gap-2 cursor-pointer"
                        >
                          <Info className="h-4 w-4" />
                          Details
                        </DropdownMenuItem>
                        {deliverable.status === "delivered" && (
                          <DropdownMenuItem
                            onClick={() => publishPacketToAccess(deliverable)}
                            disabled={publishingId !== null}
                            className="gap-2 cursor-pointer"
                          >
                            <RefreshCw className="h-4 w-4" />
                            {publishingId === deliverable.id
                              ? "Publishing…"
                              : deliverable.published_cover_pdf_path
                                ? "Republish to ampOS ACCESS"
                                : "Publish to ampOS ACCESS"}
                          </DropdownMenuItem>
                        )}
                        {deliverable.status === "delivered" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleUnsend(deliverable)}
                              disabled={publishingId === deliverable.id}
                              className="gap-2 cursor-pointer text-red-600 dark:text-red-400"
                            >
                              <Undo2 className="h-4 w-4" />
                              Unsend (remove from ampOS ACCESS)
                            </DropdownMenuItem>
                          </>
                        )}
                        {deliverable.status !== "delivered" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                handleDeleteDeliverable(deliverable.id)
                              }
                              className="gap-2 cursor-pointer text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Deliverable Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Deliverable</DialogTitle>
            <DialogDescription>
              Select a cover letter (which includes associated reports)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Phase 1 Deliverable, Progress Report"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this deliverable"
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                Select Cover Letter *
              </label>
              {coverLetters.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 p-3 border border-neutral-300 dark:border-neutral-600 rounded-none">
                  No cover letters available. Please generate a cover letter
                  first.
                </p>
              ) : (
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2">
                  {coverLetters.map((coverLetter) => {
                    const reportNames = getReportNames(
                      coverLetter.selected_report_ids || [],
                    );
                    return (
                      <label
                        key={coverLetter.id}
                        className={`flex items-start gap-3 p-3 border rounded-none cursor-pointer transition-colors ${
                          selectedCoverLetterId === coverLetter.id
                            ? "border-brand bg-orange-50 dark:bg-orange-900/20"
                            : "border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-dark-100"
                        }`}
                      >
                        <input
                          type="radio"
                          name="coverLetter"
                          checked={selectedCoverLetterId === coverLetter.id}
                          onChange={() =>
                            setSelectedCoverLetterId(coverLetter.id)
                          }
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-medium text-neutral-900 dark:text-white">
                            {coverLetter.name || "Cover Letter"}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                            Created{" "}
                            {new Date(
                              coverLetter.created_at,
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsCreateDialogOpen(false)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDeliverable}
              disabled={saving || !name.trim() || !selectedCoverLetterId}
              className="bg-brand hover:bg-brand-dark text-white"
            >
              {saving ? "Creating..." : "Create Deliverable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliverable Detail Dialog */}
      {selectedDeliverable && (
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedDeliverable.name}</DialogTitle>
              <DialogDescription>
                Deliverable details and actions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-700 dark:text-white">
                  Status:
                </span>
                <span
                  className={`px-3 py-1 rounded-none text-xs font-medium text-white ${getStatusBadgeColor(selectedDeliverable.status)}`}
                >
                  {getStatusLabel(selectedDeliverable.status)}
                </span>
              </div>

              {selectedDeliverable.description && (
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-white">
                    Description:
                  </span>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                    {selectedDeliverable.description}
                  </p>
                </div>
              )}

              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-white">
                  Cover Letter:
                </span>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {getCoverLetterName(selectedDeliverable.cover_letter_id)}
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-white">
                  Reports (
                  {getCoverLetterReportCount(
                    selectedDeliverable.cover_letter_id,
                  )}
                  )
                </span>
                <ul className="mt-2 space-y-1">
                  {getPacketReportIds(selectedDeliverable).map((id) => {
                    const asset = assets.find((a) => a.id === id);
                    const inAccess =
                      isInAccess(selectedDeliverable) &&
                      !!asset?.file_url?.startsWith("report:") &&
                      ["approved", "sent"].includes(
                        String(asset?.status || "").toLowerCase(),
                      );
                    const seen = describeViews(
                      accessViews.filter((v) => v.asset_id === id),
                    );
                    return (
                      <li
                        key={id}
                        className="text-sm text-neutral-600 dark:text-neutral-400"
                      >
                        • {asset?.name || "Unknown Report"}
                        {inAccess && (
                          <span
                            className={
                              seen
                                ? "text-green-700 dark:text-green-400"
                                : "text-neutral-500 dark:text-neutral-500"
                            }
                          >
                            {" "}
                            · {seen ? `Viewed by ${seen}` : "Not viewed"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {isInAccess(selectedDeliverable) && (
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-white">
                    Customer views in ampOS ACCESS
                  </span>
                  <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {(
                      [
                        ["cover", "Cover letter"],
                        ["packet", "Full packet PDF"],
                      ] as const
                    ).map(([kind, label]) => {
                      const seen = describeViews(
                        accessViews.filter(
                          (v) =>
                            v.deliverable_id === selectedDeliverable.id &&
                            v.kind === kind,
                        ),
                      );
                      return (
                        <li key={kind}>
                          • {label}:{" "}
                          {seen ? (
                            <span className="text-green-700 dark:text-green-400">
                              Viewed by {seen}
                            </span>
                          ) : (
                            "Not viewed"
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const recent = viewsForDeliverable(selectedDeliverable).slice(0, 10);
                    if (recent.length === 0) return null;
                    return (
                      <div className="mt-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Recent opens
                        </span>
                        <ul className="mt-1 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                          {recent.map((v) => (
                            <li key={v.id}>
                              {formatViewTime(v.viewed_at)} · {viewerLabel(v)} ·{" "}
                              {v.kind === "cover"
                                ? "Cover letter"
                                : v.kind === "packet"
                                  ? "Full packet PDF"
                                  : assets.find((a) => a.id === v.asset_id)?.name ||
                                    "Report"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              )}

              {selectedDeliverable.rejection_reason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none">
                  <span className="text-sm font-medium text-red-900 dark:text-red-300">
                    Rejection Reason:
                  </span>
                  <p className="text-sm text-red-800 dark:text-red-400 mt-1">
                    {selectedDeliverable.rejection_reason}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="flex gap-2 flex-wrap">
                {selectedDeliverable.status !== "delivered" && (
                  <Button
                    onClick={() => handleMarkSent(selectedDeliverable)}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Mark as Sent
                  </Button>
                )}

                {selectedDeliverable.status === "delivered" && (
                  <Button
                    onClick={() => publishPacketToAccess(selectedDeliverable)}
                    disabled={publishingId !== null}
                    title="Re-render the cover letter, report PDFs and full packet PDF the customer sees in ampOS ACCESS"
                  >
                    {publishingId === selectedDeliverable.id
                      ? "Publishing…"
                      : selectedDeliverable.published_cover_pdf_path
                        ? "Republish to ampOS ACCESS"
                        : "Publish to ampOS ACCESS"}
                  </Button>
                )}

                {selectedDeliverable.status !== "delivered" && (
                  <Button
                    onClick={() =>
                      handleDeleteDeliverable(selectedDeliverable.id)
                    }
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete
                  </Button>
                )}

                <Button
                  onClick={() => setIsDetailDialogOpen(false)}
                  variant="secondary"
                >
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default JobDeliverables;
