import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Check,
  Download,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Textarea } from "../ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { toast } from "@/components/ui/toast";
import {
  approveChangeOrder,
  createChangeOrder,
  deleteChangeOrder,
  fetchChangeOrders,
  pushChangeOrderToQuickBooks,
  summarizeChangeOrders,
  updateChangeOrder,
  type ChangeOrder,
  type ChangeOrderStatus,
  type ChangeOrderSummary,
} from "../../services/changeOrderService";

interface ChangeOrdersSectionProps {
  jobId: string;
  jobNumber?: string | null;
  quickbooksProjectId?: string | null;
  onSummaryChange?: (summary: ChangeOrderSummary) => void;
}

const STATUS_BADGE: Record<ChangeOrderStatus, string> = {
  draft:
    "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100",
  submitted:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100",
  approved: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100",
  rejected: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100",
};

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface FormState {
  title: string;
  description: string;
  amount: string;
  scheduleImpactDays: string;
  requestedBy: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  amount: "",
  scheduleImpactDays: "",
  requestedBy: "",
};

export default function ChangeOrdersSection({
  jobId,
  jobNumber,
  quickbooksProjectId,
  onSummaryChange,
}: ChangeOrdersSectionProps) {
  const { user } = useAuth();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChangeOrder | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const applyList = useCallback(
    (cos: ChangeOrder[]) => {
      setChangeOrders(cos);
      onSummaryChange?.(summarizeChangeOrders(cos));
    },
    [onSummaryChange],
  );

  const reload = useCallback(async () => {
    try {
      applyList(await fetchChangeOrders(jobId));
    } catch (error) {
      console.error("Error fetching change orders:", error);
    }
  }, [jobId, applyList]);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = summarizeChangeOrders(changeOrders);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setShowForm(true);
  };

  const openEdit = (co: ChangeOrder) => {
    setEditing(co);
    setForm({
      title: co.title,
      description: co.description ?? "",
      amount: String(co.amount),
      scheduleImpactDays:
        co.schedule_impact_days != null ? String(co.schedule_impact_days) : "",
      requestedBy: co.requested_by ?? "",
    });
    setFile(null);
    setShowForm(true);
  };

  const uploadFile = async (): Promise<{
    file_url: string;
    file_path: string;
    file_type: string;
    file_size: number;
  } | null> => {
    if (!file) return null;
    const fileExt = file.name.split(".").pop();
    const filePath = `change-orders/${jobId}/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage
      .from("job-documents")
      .upload(filePath, file);
    if (error) throw error;
    const {
      data: { publicUrl },
    } = supabase.storage.from("job-documents").getPublicUrl(filePath);
    return {
      file_url: publicUrl,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
    };
  };

  const handleSave = async () => {
    if (!user?.id) return;
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || isNaN(amount) || amount === 0) {
      toast({
        title: "Error",
        description:
          "Please enter a title and a non-zero amount (negative for deductive change orders)",
        variant: "destructive",
      });
      return;
    }
    const scheduleDays = form.scheduleImpactDays.trim()
      ? parseInt(form.scheduleImpactDays, 10)
      : null;

    setSaving(true);
    try {
      const fileFields = await uploadFile();
      const input = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        amount,
        schedule_impact_days: scheduleDays,
        requested_by: form.requestedBy.trim() || null,
        ...(fileFields ?? {}),
      };
      if (editing) {
        await updateChangeOrder(editing.id, input);
      } else {
        await createChangeOrder(jobId, user.id, input);
      }
      setShowForm(false);
      await reload();
      toast({
        title: "Success",
        description: editing ? "Change order updated" : "Change order added",
        variant: "success",
      });
    } catch (error) {
      console.error("Error saving change order:", error);
      toast({
        title: "Error",
        description: "Failed to save change order",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (co: ChangeOrder, status: ChangeOrderStatus) => {
    setBusyId(co.id);
    try {
      await updateChangeOrder(co.id, { status });
      await reload();
    } catch (error) {
      console.error("Error updating change order status:", error);
      toast({
        title: "Error",
        description: "Failed to update change order",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (co: ChangeOrder) => {
    if (!user?.id) return;
    setBusyId(co.id);
    try {
      const { qboError } = await approveChangeOrder(co, user.id, {
        projectId: quickbooksProjectId,
        jobNumber,
      });
      await reload();
      if (qboError) {
        toast({
          title: "Approved, but QuickBooks push failed",
          description: `${qboError}. Use "Push to QB" on the change order to retry.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Change order approved",
          description: quickbooksProjectId
            ? "An estimate was created on the linked QuickBooks project."
            : "Link a QuickBooks project to push approved COs as estimates.",
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Error approving change order:", error);
      toast({
        title: "Error",
        description: "Failed to approve change order",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePushToQBO = async (co: ChangeOrder) => {
    if (!quickbooksProjectId) return;
    setBusyId(co.id);
    try {
      await pushChangeOrderToQuickBooks(co, quickbooksProjectId, jobNumber);
      await reload();
      toast({
        title: "Pushed to QuickBooks",
        description: `CO #${co.co_number} was created as an estimate on the linked project.`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error pushing change order to QuickBooks:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "QuickBooks push failed",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (co: ChangeOrder) => {
    if (
      !window.confirm(
        `Delete CO #${co.co_number} "${co.title}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(co.id);
    try {
      await deleteChangeOrder(co.id);
      await reload();
      toast({
        title: "Success",
        description: "Change order deleted",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting change order:", error);
      toast({
        title: "Error",
        description: "Failed to delete change order",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <FilePlus2 className="h-5 w-5 text-[#f26722]" />
            <span>Change Orders</span>
          </CardTitle>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Approved:{" "}
              <span
                className={`font-semibold ${summary.approvedTotal < 0 ? "text-red-600 dark:text-red-400" : summary.approvedTotal > 0 ? "text-green-600 dark:text-green-400" : "text-neutral-900 dark:text-white"}`}
              >
                {money(summary.approvedTotal)}
              </span>
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Pending:{" "}
              <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                {money(summary.pendingTotal)}
              </span>
              {summary.pendingCount > 0 && ` (${summary.pendingCount})`}
            </span>
            <Button size="sm" onClick={openAdd} leftIcon={<Plus className="h-4 w-4" />}>
              Add Change Order
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {changeOrders.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-white">
            <FilePlus2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No change orders yet</p>
            <p className="text-sm">
              Approved change orders roll into the total contract value
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {changeOrders.map((co) => {
              const busy = busyId === co.id;
              const amount = Number(co.amount) || 0;
              return (
                <div
                  key={co.id}
                  className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-sm font-semibold text-[#f26722] whitespace-nowrap">
                          CO #{co.co_number}
                        </span>
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">
                            {co.title}
                          </h4>
                          <div className="flex items-center space-x-4 text-sm text-neutral-500 dark:text-white flex-wrap gap-y-1">
                            <Badge className={STATUS_BADGE[co.status]}>
                              {co.status}
                            </Badge>
                            <span
                              className={
                                amount < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : ""
                              }
                            >
                              {amount < 0 ? "" : "+"}
                              {money(amount)}
                            </span>
                            {co.schedule_impact_days != null &&
                              co.schedule_impact_days !== 0 && (
                                <span>
                                  {co.schedule_impact_days > 0 ? "+" : ""}
                                  {co.schedule_impact_days} days
                                </span>
                              )}
                            {co.requested_by && (
                              <span>Requested by {co.requested_by}</span>
                            )}
                            <span>
                              {format(new Date(co.created_at), "MMM d, yyyy")}
                            </span>
                            {co.qbo_estimate_id && (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                                QB Estimate
                              </Badge>
                            )}
                          </div>
                          {co.description && (
                            <p className="text-sm text-neutral-600 dark:text-white mt-1">
                              {co.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap justify-end">
                      {co.file_url && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(co.file_url!, "_blank")}
                            leftIcon={<Eye className="h-4 w-4" />}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = co.file_url!;
                              link.download = co.title;
                              link.click();
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </>
                      )}
                      {co.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setStatus(co, "submitted")}
                        >
                          Submit
                        </Button>
                      )}
                      {(co.status === "draft" || co.status === "submitted") && (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => handleApprove(co)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setStatus(co, "rejected")}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => openEdit(co)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {co.status === "approved" &&
                        quickbooksProjectId &&
                        !co.qbo_estimate_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => handlePushToQBO(co)}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Push to QB
                          </Button>
                        )}
                      {co.status !== "approved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleDelete(co)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg w-full">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit CO #${editing.co_number}`
                : "Add Change Order"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-title">
                Title
              </label>
              <Input
                id="co-title"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. Added transformer testing at Bldg 2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-amount">
                Amount ($ — negative for deductive)
              </label>
              <Input
                id="co-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-days">
                Schedule Impact (days, optional)
              </label>
              <Input
                id="co-days"
                type="number"
                step="1"
                value={form.scheduleImpactDays}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduleImpactDays: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-requested-by">
                Requested By (optional)
              </label>
              <Input
                id="co-requested-by"
                value={form.requestedBy}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, requestedBy: e.target.value }))
                }
                placeholder="Customer / GC contact"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-description">
                Description (optional)
              </label>
              <Textarea
                id="co-description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-file">
                Attachment (optional — signed CO, quote, etc.)
              </label>
              <Input
                id="co-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {editing?.file_url && !file && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Existing attachment is kept unless a new file is chosen.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Change Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
