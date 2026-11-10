import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePmAccess } from "@/app/pm-dashboard/shared";
import { format, parseISO } from "date-fns";
import {
  Calculator,
  Check,
  ListOrdered,
  Download,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/Table";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  approveChangeOrder,
  APPROVAL_METHOD_LABEL,
  CHANGE_ORDER_STATUS_LABEL,
  createChangeOrder,
  createChangeOrderQuote,
  deleteChangeOrder,
  fetchChangeOrderLetterNumbers,
  fetchChangeOrders,
  formatChangeOrderNumber,
  pushChangeOrderToQuickBooks,
  summarizeChangeOrders,
  updateChangeOrder,
  type ApprovalMethod,
  type ChangeOrder,
  type ChangeOrderStatus,
  type ChangeOrderSummary,
} from "../../services/changeOrderService";
import {
  fetchLatestSignatureRequests,
  notifyChangeOrderApproved,
  sendChangeOrderForSignature,
  signatureState,
  type SignatureRequest,
} from "../../services/changeOrderSignatureService";

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

// Date-only columns are parsed as local dates so they don't shift a day by timezone
const today = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d?: string | null) =>
  d ? format(parseISO(d), "MMM d, yyyy") : "-";

interface FormState {
  title: string;
  description: string;
  amount: string;
  scheduleImpactDays: string;
  requestedBy: string;
  requestedDate: string;
  approvedDate: string;
  approvedByName: string;
  outsideContract: boolean;
  /** Work began before approval; the note holds the email that OK'd it */
  workStartedOn: string;
  workStartedNote: string;
  /** New Change Orders only: price it on an estimate sheet (own quote and letter number) */
  useEstimate: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  amount: "",
  scheduleImpactDays: "",
  requestedBy: "",
  requestedDate: "",
  approvedDate: "",
  approvedByName: "",
  outsideContract: false,
  workStartedOn: "",
  workStartedNote: "",
  useEstimate: true,
};

// One line under the status: where online signing stands
const signatureLine = (r: SignatureRequest) => {
  const state = signatureState(r);
  if (state === "signed") return `Signed online by ${r.signer_name}`;
  if (state === "declined") return `Declined by ${r.signer_name}`;
  if (state === "expired") return "Signing link expired";
  if (state === "void") return "";
  return `Sent to ${r.signer_name} to sign`;
};

const APPROVE_METHODS: { value: ApprovalMethod; label: string }[] = [
  { value: "email", label: "Email reply" },
  { value: "customer_form", label: "Their own form" },
  { value: "signed_letter", label: "Signed letter" },
];

const quotePath = (opportunityId: string) =>
  `/sales-dashboard/opportunities/${opportunityId}`;

export default function ChangeOrdersSection({
  jobId,
  jobNumber,
  quickbooksProjectId,
  onSummaryChange,
}: ChangeOrdersSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // PMs and admins get a shortcut to the job's schedule of values
  const pmAccess = usePmAccess();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  // Quote id -> letter number, for Change Orders priced on an estimate sheet
  const [letterNumbers, setLetterNumbers] = useState<Record<string, string>>(
    {},
  );
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChangeOrder | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approving, setApproving] = useState<ChangeOrder | null>(null);
  const [approveForm, setApproveForm] = useState({
    approvedDate: "",
    approvedByName: "",
    method: "email" as ApprovalMethod,
    note: "",
  });
  const [approveFile, setApproveFile] = useState<File | null>(null);
  // Online signing: latest request per Change Order, and the send dialog
  const [signatures, setSignatures] = useState<
    Record<string, SignatureRequest>
  >({});
  const [sending, setSending] = useState<ChangeOrder | null>(null);
  const [sendForm, setSendForm] = useState({ name: "", email: "" });
  const [sendBusy, setSendBusy] = useState(false);
  const [contacts, setContacts] = useState<{ name: string; email: string }[]>(
    [],
  );
  // Approved Change Orders are already in contract totals and QuickBooks; only tracking fields stay editable
  const locked = editing?.status === "approved";

  const applyList = useCallback(
    (cos: ChangeOrder[]) => {
      setChangeOrders(cos);
      onSummaryChange?.(summarizeChangeOrders(cos));
    },
    [onSummaryChange],
  );

  const reload = useCallback(async () => {
    try {
      const cos = await fetchChangeOrders(jobId);
      applyList(cos);
      const quoteIds = cos
        .map((co) => co.opportunity_id)
        .filter((id): id is string => !!id);
      setLetterNumbers(await fetchChangeOrderLetterNumbers(quoteIds));
      setSignatures(await fetchLatestSignatureRequests(cos.map((co) => co.id)));
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
    setForm({ ...EMPTY_FORM, requestedDate: today() });
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
      requestedDate: co.requested_date ?? "",
      approvedDate: co.approved_date ?? "",
      approvedByName: co.approved_by_name ?? "",
      outsideContract: !!co.outside_contract,
      useEstimate: !!co.opportunity_id,
      workStartedOn: co.work_started_on ?? "",
      workStartedNote: co.work_started_note ?? "",
    });
    setFile(null);
    setShowForm(true);
  };

  const openApprove = (co: ChangeOrder) => {
    if (co.opportunity_id && !Number(co.amount)) {
      toast({
        title: "Not priced yet",
        description:
          "Open its estimate sheet and save the letter. The price comes from the letter.",
        variant: "destructive",
      });
      return;
    }
    setApproveForm({
      approvedDate: today(),
      approvedByName: "",
      method: "email",
      note: "",
    });
    setApproveFile(null);
    setApproving(co);
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
    // A Change Order on an estimate sheet gets its price from the letter
    const priceFromLetter = editing ? !!editing.opportunity_id : form.useEstimate;
    const amount = parseFloat(form.amount);
    if (!form.title.trim()) {
      toast({
        title: "Error",
        description: "Give the Change Order a title",
        variant: "destructive",
      });
      return;
    }
    if (!locked && form.workStartedOn && !form.workStartedNote.trim()) {
      toast({
        title: "Error",
        description:
          "Paste the email or note that OK'd starting before approval",
        variant: "destructive",
      });
      return;
    }
    if (!priceFromLetter && !locked && (isNaN(amount) || amount === 0)) {
      toast({
        title: "Error",
        description:
          "Enter a price other than zero (negative for a deductive Change Order)",
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
      const tracking = {
        requested_by: form.requestedBy.trim() || null,
        requested_date: form.requestedDate || null,
        ...(fileFields ?? {}),
      };
      const input = {
        ...tracking,
        title: form.title.trim(),
        description: form.description.trim() || null,
        schedule_impact_days: scheduleDays,
        outside_contract: form.outsideContract,
        work_started_on: form.workStartedOn || null,
        work_started_note: form.workStartedOn
          ? form.workStartedNote.trim() || null
          : null,
        ...(priceFromLetter ? {} : { amount }),
      };
      if (!editing && form.useEstimate) {
        const created = await createChangeOrderQuote(jobId, {
          title: input.title,
          description: input.description,
          requested_by: tracking.requested_by,
          requested_date: tracking.requested_date,
          schedule_impact_days: scheduleDays,
          outside_contract: form.outsideContract,
        });
        if (fileFields || input.work_started_on) {
          await updateChangeOrder(created.id, {
            ...(fileFields ?? {}),
            work_started_on: input.work_started_on,
            work_started_note: input.work_started_note,
          });
        }
        setShowForm(false);
        toast({
          title: `Change Order ${formatChangeOrderNumber(created.co_number)} added`,
          description: "Build its estimate, then save the letter to set the price.",
          variant: "success",
        });
        if (created.opportunity_id) navigate(quotePath(created.opportunity_id));
        else await reload();
        return;
      }
      if (editing && locked) {
        await updateChangeOrder(editing.id, {
          ...tracking,
          approved_date: form.approvedDate || null,
          approved_by_name: form.approvedByName.trim() || null,
        });
      } else if (editing) {
        await updateChangeOrder(editing.id, input);
      } else {
        await createChangeOrder(jobId, user.id, { ...input, amount });
      }
      setShowForm(false);
      await reload();
      toast({
        title: "Success",
        description: editing ? "Change Order updated" : "Change Order added",
        variant: "success",
      });
    } catch (error) {
      console.error("Error saving change order:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error || (error as any)?.message
            ? `Couldn't save the Change Order: ${(error as any).message}`
            : "Couldn't save the Change Order",
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
        description: "Couldn't update the Change Order",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async () => {
    const co = approving;
    if (!user?.id || !co) return;
    if (!approveForm.note.trim() && !approveFile) {
      toast({
        title: "Add the proof",
        description:
          "Paste the customer's email, or attach their form or signed letter.",
        variant: "destructive",
      });
      return;
    }
    setApproving(null);
    setBusyId(co.id);
    try {
      let proof: { approval_file_url: string; approval_file_path: string } | null =
        null;
      if (approveFile) {
        const ext = approveFile.name.split(".").pop();
        const path = `change-orders/${jobId}/approval-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("job-documents")
          .upload(path, approveFile);
        if (uploadError) throw uploadError;
        proof = {
          approval_file_url: supabase.storage
            .from("job-documents")
            .getPublicUrl(path).data.publicUrl,
          approval_file_path: path,
        };
      }
      const { qboError } = await approveChangeOrder(
        co,
        user.id,
        { projectId: quickbooksProjectId, jobNumber },
        {
          approved_date: approveForm.approvedDate || null,
          approved_by_name: approveForm.approvedByName.trim() || null,
          approval_method: approveForm.method,
          approval_note: approveForm.note.trim() || null,
          ...(proof ?? {}),
        },
      );
      // Accounting hears about it. A failed email doesn't undo the approval.
      notifyChangeOrderApproved(co.id).catch((e) =>
        console.warn("Change Order approval email failed:", e),
      );
      await reload();
      if (qboError) {
        toast({
          title: "Approved, but QuickBooks push failed",
          description: `${qboError}. Use "Push to QB" on the Change Order to retry.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Change Order approved",
          description: quickbooksProjectId
            ? "An estimate was created on the linked QuickBooks project."
            : "Link a QuickBooks project to push approved Change Orders as estimates.",
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Error approving change order:", error);
      toast({
        title: "Error",
        description: "Couldn't approve the Change Order",
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
        description: `Change Order ${formatChangeOrderNumber(co.co_number)} was created as an estimate on the linked project.`,
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

  const openSend = async (co: ChangeOrder) => {
    const last = signatures[co.id];
    setSendForm({
      name: last?.signer_name ?? "",
      email: last?.signer_email ?? "",
    });
    setContacts([]);
    setSending(co);
    try {
      const { data: job } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("customer_id")
        .eq("id", jobId)
        .maybeSingle();
      if (!job?.customer_id) return;
      const { data } = await supabase
        .schema("common")
        .from("contacts")
        .select("first_name, last_name, email")
        .eq("customer_id", job.customer_id)
        .order("first_name");
      setContacts(
        ((data ?? []) as any[])
          .filter((c) => c.email)
          .map((c) => ({
            name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
            email: c.email,
          })),
      );
    } catch (e) {
      console.warn("Contacts lookup failed:", e);
    }
  };

  const handleSend = async () => {
    if (!sending) return;
    if (!sendForm.name.trim() || !sendForm.email.trim()) {
      toast({
        title: "Error",
        description: "Enter the signer's name and email",
        variant: "destructive",
      });
      return;
    }
    setSendBusy(true);
    try {
      const res = await sendChangeOrderForSignature(
        sending.id,
        sendForm.name.trim(),
        sendForm.email.trim(),
      );
      setSending(null);
      toast({
        title: "Sent for signature",
        description: `Emailed ${res.sentTo}. The link works for 30 days.`,
        variant: "success",
      });
      await reload();
    } catch (e: any) {
      toast({
        title: "Couldn't send",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
    }
  };

  const handleDelete = async (co: ChangeOrder) => {
    const notes = [
      co.status === "approved"
        ? "It's approved, so the contract value drops by its price, and its SOV lines and weekly numbers are deleted."
        : "",
      co.qbo_estimate_id
        ? "It was sent to QuickBooks as an estimate. Delete it there too."
        : "",
      co.opportunity_id ? "Its estimate sheets and letters are deleted too." : "",
      "This can't be undone.",
    ].filter(Boolean);
    const ok = await confirmDialog({
      title: `Delete Change Order ${formatChangeOrderNumber(co.co_number)}?`,
      description: `"${co.title}". ${notes.join(" ")}`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(co.id);
    try {
      await deleteChangeOrder(co.id);
      await reload();
      toast({
        title: "Success",
        description: "Change Order deleted",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting change order:", error);
      toast({
        title: "Error",
        description: "Couldn't delete the Change Order",
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
            <FilePlus2 className="h-5 w-5 text-brand" />
            <span>Change Orders</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {pmAccess.allowed && (
              <Link to={`/pm-dashboard/${jobId}`}>
                <Button
                  variant="outline"
                  leftIcon={<ListOrdered className="h-4 w-4" />}
                >
                  Schedule of values
                </Button>
              </Link>
            )}
            <Button onClick={openAdd} leftIcon={<Plus className="h-4 w-4" />}>
              Add Change Order
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {changeOrders.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-white">
            <FilePlus2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No Change Orders yet</p>
            <p className="text-sm">
              Approved Change Orders roll into the total contract value
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Change Order</TableHead>
                <TableHead>Letter</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeOrders.map((co) => {
                const busy = busyId === co.id;
                const amount = Number(co.amount) || 0;
                return (
                  <TableRow key={co.id}>
                    <TableCell className="font-mono font-semibold text-brand whitespace-nowrap">
                      {formatChangeOrderNumber(co.co_number)}
                    </TableCell>
                    <TableCell className="font-mono whitespace-nowrap">
                      {co.opportunity_id
                        ? letterNumbers[co.opportunity_id] ?? "-"
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{fmtDate(co.requested_date)}</div>
                      {co.requested_by && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          by {co.requested_by}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[16rem]">
                      <div className="font-medium text-neutral-900 dark:text-white">
                        {co.title}
                      </div>
                      {co.description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
                          {co.description}
                        </p>
                      )}
                      {co.schedule_impact_days != null &&
                        co.schedule_impact_days !== 0 && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            Schedule: {co.schedule_impact_days > 0 ? "+" : ""}
                            {co.schedule_impact_days} days
                          </div>
                        )}
                      {co.outside_contract && (
                        <Badge className="mt-1 bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100">
                          Outside contract terms
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right whitespace-nowrap font-medium ${amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                    >
                      {co.opportunity_id && amount === 0 && co.status !== "approved" ? (
                        <span className="font-normal text-neutral-500 dark:text-neutral-400">
                          Not priced yet
                        </span>
                      ) : (
                        <>
                          {amount < 0 ? "" : "+"}
                          {money(amount)}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge className={STATUS_BADGE[co.status]}>
                          {CHANGE_ORDER_STATUS_LABEL[co.status] ?? co.status}
                        </Badge>
                        {co.qbo_estimate_id && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                            QB Estimate
                          </Badge>
                        )}
                        {co.work_started_on && co.status !== "approved" && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                            Work started {fmtDate(co.work_started_on)}
                          </Badge>
                        )}
                        {signatures[co.id] && signatureLine(signatures[co.id]) && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {signatureLine(signatures[co.id])}
                          </span>
                        )}
                        {co.status === "approved" && co.approval_method && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {APPROVAL_METHOD_LABEL[co.approval_method]}
                            {co.approval_file_url && (
                              <>
                                {" · "}
                                <a
                                  href={co.approval_file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  proof
                                </a>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(co.approved_date)}
                    </TableCell>
                    <TableCell>{co.approved_by_name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {co.opportunity_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(quotePath(co.opportunity_id!))}
                            leftIcon={<Calculator className="h-4 w-4" />}
                          >
                            Estimate
                          </Button>
                        )}
                        {co.file_url && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              title="View attachment"
                              aria-label="View attachment"
                              onClick={() => window.open(co.file_url!, "_blank")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Download attachment"
                              aria-label="Download attachment"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = co.file_url!;
                                link.download = co.title;
                                link.click();
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {co.opportunity_id &&
                          (co.status === "draft" ||
                            co.status === "submitted") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => openSend(co)}
                              leftIcon={<Send className="h-4 w-4" />}
                            >
                              Send for signature
                            </Button>
                          )}
                        {co.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setStatus(co, "submitted")}
                          >
                            Mark sent
                          </Button>
                        )}
                        {(co.status === "draft" ||
                          co.status === "submitted") && (
                          <>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => openApprove(co)}
                              leftIcon={<Check className="h-4 w-4" />}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setStatus(co, "rejected")}
                              leftIcon={<X className="h-4 w-4" />}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {co.status !== "rejected" && (
                          <Button
                            variant="outline"
                            size="sm"
                            title="Edit"
                            aria-label="Edit"
                            disabled={busy}
                            onClick={() => openEdit(co)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {co.status === "approved" &&
                          quickbooksProjectId &&
                          !co.qbo_estimate_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => handlePushToQBO(co)}
                              leftIcon={<RefreshCw className="h-4 w-4" />}
                            >
                              Push to QB
                            </Button>
                          )}
                        {(
                          <Button
                            variant="outline"
                            size="sm"
                            title="Delete"
                            aria-label="Delete"
                            disabled={busy}
                            onClick={() => handleDelete(co)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right">
                  Approved total ({summary.approvedCount})
                </TableCell>
                <TableCell
                  className={`text-right whitespace-nowrap ${summary.approvedTotal < 0 ? "text-red-600 dark:text-red-400" : summary.approvedTotal > 0 ? "text-green-600 dark:text-green-400" : ""}`}
                >
                  {money(summary.approvedTotal)}
                </TableCell>
                <TableCell
                  colSpan={4}
                  className="text-xs font-normal text-neutral-500 dark:text-neutral-400"
                >
                  Included in total contract value
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right">
                  Pending total ({summary.pendingCount})
                </TableCell>
                <TableCell className="text-right whitespace-nowrap text-yellow-600 dark:text-yellow-400">
                  {money(summary.pendingTotal)}
                </TableCell>
                <TableCell
                  colSpan={4}
                  className="text-xs font-normal text-neutral-500 dark:text-neutral-400"
                >
                  Not in contract value until approved
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit Change Order ${formatChangeOrderNumber(editing.co_number)}`
                : "Add Change Order"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {locked && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                This Change Order is approved. Title, price and scope are
                locked.
              </p>
            )}
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
                disabled={locked}
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <div className="text-sm font-medium" id="co-price-how">
                  How will you price it?
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-labelledby="co-price-how"
                >
                  {[
                    { value: true, label: "Estimate sheet", hint: "Own quote and new letter number" },
                    { value: false, label: "Enter a price", hint: "Quick line, no estimate" },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      role="radio"
                      aria-checked={form.useEstimate === opt.value}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, useEstimate: opt.value }))
                      }
                      className={`rounded-none border px-3 py-2 text-left text-sm ${
                        form.useEstimate === opt.value
                          ? "border-brand bg-brand/10 text-neutral-900 dark:text-white"
                          : "border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {opt.hint}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(editing ? !!editing.opportunity_id : form.useEstimate) ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Price</div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    {editing && Number(editing.amount)
                      ? `${money(Number(editing.amount))}, from the letter.`
                      : "Comes from the letter on its estimate sheet."}
                  </p>
                </div>
              ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="co-amount">
                  Price ($)
                </label>
                <Input
                  id="co-amount"
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="Negative = deductive"
                  disabled={locked}
                />
              </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="co-days">
                  Schedule Impact (days)
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
                  placeholder="Optional"
                  disabled={locked}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="co-requested-by">
                  Requested By
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
                <label
                  className="text-sm font-medium"
                  htmlFor="co-requested-date"
                >
                  Date Requested
                </label>
                <Input
                  id="co-requested-date"
                  type="date"
                  value={form.requestedDate}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      requestedDate: e.target.value,
                    }))
                  }
                />
              </div>
              {locked && (
                <>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="co-approved-by"
                    >
                      Approved By
                    </label>
                    <Input
                      id="co-approved-by"
                      value={form.approvedByName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          approvedByName: e.target.value,
                        }))
                      }
                      placeholder="Customer / GC contact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="co-approved-date"
                    >
                      Date Approved
                    </label>
                    <Input
                      id="co-approved-date"
                      type="date"
                      value={form.approvedDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          approvedDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-description">
                Scope / Description (optional)
              </label>
              <Textarea
                id="co-description"
                rows={3}
                disabled={locked}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            {!locked && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="co-work-started">
                    Work started before approval
                  </label>
                  <Input
                    id="co-work-started"
                    type="date"
                    value={form.workStartedOn}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        workStartedOn: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Leave blank if work hasn't started.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="co-work-note">
                    Email or note that OK'd it
                  </label>
                  <Textarea
                    id="co-work-note"
                    rows={3}
                    disabled={!form.workStartedOn}
                    value={form.workStartedNote}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        workStartedNote: e.target.value,
                      }))
                    }
                    placeholder="Paste the customer's email"
                  />
                </div>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm" htmlFor="co-outside">
              <input
                id="co-outside"
                type="checkbox"
                className="mt-0.5 rounded-none"
                checked={form.outsideContract}
                disabled={locked}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    outsideContract: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium">Outside the contract's terms</span>
                <span className="block text-neutral-500 dark:text-neutral-400">
                  Billed on its own terms, for example no retainage or
                  pay-if-paid.
                </span>
              </span>
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-file">
                Attachment (optional: signed Change Order, quote, etc.)
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
              {saving
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : form.useEstimate
                    ? "Add and open estimate sheet"
                    : "Add Change Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!approving}
        onOpenChange={(open) => {
          if (!open) setApproving(null);
        }}
      >
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle>
              Approve Change Order{" "}
              {approving ? formatChangeOrderNumber(approving.co_number) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium" id="co-approve-how">
                How did the customer approve?
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-labelledby="co-approve-how"
              >
                {APPROVE_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={approveForm.method === m.value}
                    onClick={() =>
                      setApproveForm((prev) => ({ ...prev, method: m.value }))
                    }
                    className={`rounded-none border px-3 py-1.5 text-sm ${
                      approveForm.method === m.value
                        ? "border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                        : "border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-approve-note">
                {approveForm.method === "email"
                  ? "Paste their email"
                  : "Note (optional if you attach a file)"}
              </label>
              <Textarea
                id="co-approve-note"
                rows={4}
                value={approveForm.note}
                onChange={(e) =>
                  setApproveForm((prev) => ({ ...prev, note: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-approve-file">
                {approveForm.method === "email"
                  ? "Or attach the email (PDF)"
                  : "Attach their form or signed letter"}
              </label>
              <Input
                id="co-approve-file"
                type="file"
                onChange={(e) => setApproveFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Proof is required. Accounting gets an email when you approve.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-approve-by">
                Approved By
              </label>
              <Input
                id="co-approve-by"
                value={approveForm.approvedByName}
                onChange={(e) =>
                  setApproveForm((prev) => ({
                    ...prev,
                    approvedByName: e.target.value,
                  }))
                }
                placeholder="Customer / GC contact"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-approve-date">
                Date Approved
              </label>
              <Input
                id="co-approve-date"
                type="date"
                value={approveForm.approvedDate}
                onChange={(e) =>
                  setApproveForm((prev) => ({
                    ...prev,
                    approvedDate: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              leftIcon={<Check className="h-4 w-4" />}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!sending}
        onOpenChange={(open) => {
          if (!open) setSending(null);
        }}
      >
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle>
              Send Change Order{" "}
              {sending ? formatChangeOrderNumber(sending.co_number) : ""} for
              signature
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              They get an email link to read the letter and sign. No login.
              It sends the letter as saved now, so save the letter first if
              you changed the estimate.
            </p>
            {contacts.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="co-send-contact">
                  Pick a contact
                </label>
                <select
                  id="co-send-contact"
                  className="form-input w-full rounded-none"
                  value=""
                  onChange={(e) => {
                    const c = contacts[Number(e.target.value)];
                    if (c) setSendForm({ name: c.name, email: c.email });
                  }}
                >
                  <option value="">Choose, or type below</option>
                  {contacts.map((c, i) => (
                    <option key={c.email + i} value={i}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-send-name">
                Signer's name
              </label>
              <Input
                id="co-send-name"
                value={sendForm.name}
                onChange={(e) =>
                  setSendForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Often the customer's project manager"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="co-send-email">
                Signer's email
              </label>
              <Input
                id="co-send-email"
                type="email"
                value={sendForm.email}
                onChange={(e) =>
                  setSendForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSending(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendBusy}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {sendBusy ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
