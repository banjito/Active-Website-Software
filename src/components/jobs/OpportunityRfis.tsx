import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { Download, MessageCircleQuestion, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { companyConfig } from "@/lib/companyConfig";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { toast } from "@/components/ui/toast";
import {
  RFI_UPLOAD_MAX_BYTES,
  buildRfiWorkbook,
  parseRfiWorkbook,
  planRfiImport,
  rfiFileName,
  type RfiImportChange,
} from "@/lib/rfiWorkbook";
import {
  RfiSetupMissingError,
  applyRfiImport,
  createRfi,
  deleteRfi,
  fetchOpportunityRfis,
  fetchRfiLog,
  isRfiAnswered,
  logRfiAction,
  toSheetRow,
  todayIso,
  updateRfi,
  type OpportunityRfi,
  type RfiActor,
  type RfiLogEntry,
} from "@/services/opportunityRfiService";

// RFIs (Requests for Information) on an opportunity: estimating questions for the
// customer. Download as Excel, send it, upload the customer's copy to fill answers.

const notify = (variant: "success" | "destructive" | "info", title: string) => toast({ title, variant });

const fmtDate = (iso: string | null | undefined) => (iso ? format(parseISO(iso), "MMM d, yyyy") : "");

const PILL = "inline-block whitespace-nowrap rounded-none px-1.5 py-0.5 text-xs font-medium";
const PILL_STYLES = {
  open: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  answered: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  customer: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-dark-200 dark:text-dark-700",
};

function StatusPill({ rfi }: { rfi: OpportunityRfi }) {
  return isRfiAnswered(rfi) ? (
    <span className={`${PILL} ${PILL_STYLES.answered}`}>
      Answered{rfi.date_answered ? ` ${format(parseISO(rfi.date_answered), "MMM d")}` : ""}
    </span>
  ) : (
    <span className={`${PILL} ${PILL_STYLES.open}`}>Open</span>
  );
}

function CustomerPill() {
  return <span className={`${PILL} ${PILL_STYLES.customer}`}>From customer</span>;
}

function SetupMissing() {
  return (
    <p className="p-4 text-sm text-neutral-600 dark:text-dark-700">
      RFI setup isn't finished. Run <code>database/migrations/opportunity_rfis.sql</code> on the database.
    </p>
  );
}

function CardShell({ children, actions, counts }: { children: ReactNode; actions?: ReactNode; counts?: ReactNode }) {
  return (
    <div className="rounded-none border border-neutral-200 bg-white dark:border-dark-300 dark:bg-dark-150">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-dark-300">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-none bg-brand/10 p-2 text-brand">
            <MessageCircleQuestion className="h-5 w-5" />
          </div>
          <span className="font-semibold text-neutral-900 dark:text-dark-900">RFIs</span>
          {counts}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function Counts({ rfis }: { rfis: OpportunityRfi[] }) {
  const answered = rfis.filter(isRfiAnswered).length;
  const open = rfis.length - answered;
  if (rfis.length === 0) return null;
  return (
    <span className="flex gap-1.5">
      {open > 0 && <span className={`${PILL} ${PILL_STYLES.open}`}>{open} open</span>}
      {answered > 0 && <span className={`${PILL} ${PILL_STYLES.answered}`}>{answered} answered</span>}
    </span>
  );
}

const TH = "whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-700";
const TD = "border-b border-neutral-200 px-3 py-2.5 align-top text-sm dark:border-dark-300";

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

interface Draft {
  question: string;
  spec_ref: string;
  response: string;
  date_answered: string;
}

const emptyDraft: Draft = { question: "", spec_ref: "", response: "", date_answered: "" };

function RfiForm({
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saving,
  showResponse,
  saveLabel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  showResponse: boolean;
  saveLabel: string;
}) {
  return (
    <div className="grid gap-3 bg-neutral-50 p-4 dark:bg-dark-200">
      <div className="grid gap-1">
        <label htmlFor="rfi-question" className="text-sm font-medium text-neutral-700 dark:text-dark-900">
          Question
        </label>
        <Textarea
          id="rfi-question"
          rows={3}
          autoFocus
          value={draft.question}
          onChange={(e) => onChange({ ...draft, question: e.target.value })}
          placeholder="What do you need the customer to confirm?"
        />
      </div>
      <Input
        id="rfi-spec-ref"
        label="Drawing / spec ref"
        value={draft.spec_ref}
        onChange={(e) => onChange({ ...draft, spec_ref: e.target.value })}
        placeholder="E-101, Spec 26 08 00"
      />
      {showResponse && (
        <>
          <div className="grid gap-1">
            <label htmlFor="rfi-response" className="text-sm font-medium text-neutral-700 dark:text-dark-900">
              Customer response
            </label>
            <Textarea
              id="rfi-response"
              rows={3}
              value={draft.response}
              onChange={(e) => onChange({ ...draft, response: e.target.value })}
              placeholder="Type an answer you got by phone or email"
            />
          </div>
          {draft.response.trim() && (
            <Input
              id="rfi-date-answered"
              type="date"
              label="Date answered"
              value={draft.date_answered}
              onChange={(e) => onChange({ ...draft, date_answered: e.target.value })}
            />
          )}
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} disabled={saving} leftIcon={<Trash2 className="h-4 w-4" />}
              className="text-red-600 hover:text-red-700 dark:text-red-400">
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} isLoading={saving} disabled={!draft.question.trim()}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload review
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<RfiImportChange["kind"], { text: string; style: string }> = {
  answer: { text: "Adds answer", style: PILL_STYLES.answered },
  replace: { text: "Replaces answer", style: PILL_STYLES.open },
  new: { text: "Adds as new RFI", style: PILL_STYLES.customer },
  blank: { text: "Stays open", style: PILL_STYLES.neutral },
  skip: { text: "Skipped", style: PILL_STYLES.neutral },
};

const isActionable = (c: RfiImportChange) => c.kind === "answer" || c.kind === "replace" || c.kind === "new";

function ReviewDialog({
  fileName,
  changes,
  onClose,
  onApply,
}: {
  fileName: string;
  changes: RfiImportChange[];
  onClose: () => void;
  onApply: (picked: RfiImportChange[]) => Promise<void>;
}) {
  const [ticked, setTicked] = useState<Set<number>>(
    () => new Set(changes.map((c, i) => (isActionable(c) ? i : -1)).filter((i) => i >= 0)),
  );
  const [saving, setSaving] = useState(false);
  const count = (kind: RfiImportChange["kind"]) => changes.filter((c) => c.kind === kind).length;
  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const apply = async () => {
    setSaving(true);
    try {
      await onApply(changes.filter((_, i) => ticked.has(i)));
    } finally {
      setSaving(false);
    }
  };

  const summary: [number, string][] = [
    [count("answer"), "New answers"],
    [count("replace"), "Changed answers"],
    [count("new"), "New questions from customer"],
    [count("blank"), "Still blank"],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review customer answers</DialogTitle>
          <p className="break-all text-xs text-neutral-500 dark:text-dark-700">{fileName}</p>
        </DialogHeader>
        <div className="grid grid-cols-2 border border-neutral-200 sm:grid-cols-4 dark:border-dark-300">
          {summary.map(([n, label]) => (
            <div key={label} className="border-neutral-200 p-3 [&:not(:last-child)]:border-r dark:border-dark-300">
              <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-dark-900">{n}</div>
              <div className="text-xs text-neutral-500 dark:text-dark-700">{label}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className={TH} />
                <th className={TH}>#</th>
                <th className={TH}>Question</th>
                <th className={TH}>Answer from file</th>
                <th className={TH}>What happens</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i} className={isActionable(c) && !ticked.has(i) ? "opacity-50" : ""}>
                  <td className={TD}>
                    {isActionable(c) && (
                      <input
                        type="checkbox"
                        aria-label={`Apply change ${c.number ?? "new"}`}
                        checked={ticked.has(i)}
                        onChange={() => toggle(i)}
                        className="h-4 w-4 rounded-none accent-brand"
                      />
                    )}
                  </td>
                  <td className={`${TD} font-mono text-neutral-500`}>{c.number ?? "new"}</td>
                  <td className={TD}>{c.question || <span className="italic text-neutral-400">(no question)</span>}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>
                    {c.kind === "replace" && (
                      <del className="block text-neutral-400">{c.previousResponse}</del>
                    )}
                    {c.response || <span className="italic text-neutral-400">blank</span>}
                    {c.reason && <span className="mt-1 block text-xs text-neutral-500">{c.reason}</span>}
                  </td>
                  <td className={TD}>
                    <span className={`${PILL} ${KIND_LABEL[c.kind].style}`}>{KIND_LABEL[c.kind].text}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={apply} isLoading={saving} disabled={ticked.size === 0}>
            Apply {ticked.size} {ticked.size === 1 ? "change" : "changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Opportunity section
// ---------------------------------------------------------------------------

interface OpportunityRfisProps {
  opportunityId: string;
  title?: string | null;
  customerName?: string | null;
  quoteNumber?: string | null;
  /** yyyy-mm-dd or a timestamp */
  proposalDueDate?: string | null;
}

export default function OpportunityRfis({ opportunityId, title, customerName, quoteNumber, proposalDueDate }: OpportunityRfisProps) {
  const { user } = useAuth();
  const actor: RfiActor | null = useMemo(
    () =>
      user
        ? { id: user.id, name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null }
        : null,
    [user],
  );

  const [rfis, setRfis] = useState<OpportunityRfi[]>([]);
  const [log, setLog] = useState<RfiLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [review, setReview] = useState<{ fileName: string; changes: RfiImportChange[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [rows, entries] = await Promise.all([fetchOpportunityRfis([opportunityId]), fetchRfiLog(opportunityId)]);
      setRfis(rows);
      setLog(entries);
      setSetupMissing(false);
    } catch (e) {
      if (e instanceof RfiSetupMissingError) setSetupMissing(true);
      else notify("destructive", `Couldn't load RFIs. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setAdding(true);
  };

  const startEdit = (rfi: OpportunityRfi) => {
    setAdding(false);
    setEditingId(rfi.id);
    setDraft({
      question: rfi.question,
      spec_ref: rfi.spec_ref ?? "",
      response: rfi.response ?? "",
      date_answered: rfi.date_answered ?? todayIso(),
    });
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
  };

  const saveNew = async () => {
    if (!actor || !draft.question.trim()) return;
    setSaving(true);
    try {
      const created = await createRfi(opportunityId, { question: draft.question, spec_ref: draft.spec_ref }, actor);
      setRfis((prev) => [...prev, created].sort((a, b) => a.number - b.number));
      setDraft(emptyDraft);
      setAdding(false);
      notify("success", `RFI #${created.number} added`);
    } catch (e) {
      notify("destructive", `Couldn't add the RFI. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !draft.question.trim()) return;
    setSaving(true);
    try {
      const updated = await updateRfi(editingId, {
        question: draft.question,
        spec_ref: draft.spec_ref,
        response: draft.response,
        date_answered: draft.date_answered || null,
      });
      setRfis((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingId(null);
    } catch (e) {
      notify("destructive", `Couldn't save the RFI. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rfi: OpportunityRfi) => {
    const ok = await confirmDialog({
      title: `Delete RFI #${rfi.number}?`,
      description: "Its number won't be reused, so copies already sent stay correct.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteRfi(rfi.id);
      setRfis((prev) => prev.filter((r) => r.id !== rfi.id));
      setEditingId(null);
    } catch (e) {
      notify("destructive", `Couldn't delete the RFI. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const openDownload = () => {
    setRequestedBy(format(addDays(new Date(), 7), "yyyy-MM-dd"));
    setDownloadOpen(true);
  };

  const download = async () => {
    if (!actor) return;
    const fileName = rfiFileName(quoteNumber, title);
    try {
      const bytes = buildRfiWorkbook(
        {
          companyName: companyConfig.legalName,
          opportunityId,
          project: title || quoteNumber || "",
          customer: customerName || "",
          proposalDueDate: proposalDueDate ? proposalDueDate.slice(0, 10) : null,
          dateIssued: todayIso(),
          responseRequestedBy: requestedBy || null,
        },
        rfis.map(toSheetRow),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloadOpen(false);
      await logRfiAction(opportunityId, "download", fileName, rfis.length, actor);
      fetchRfiLog(opportunityId).then(setLog).catch(() => {});
    } catch (e) {
      notify("destructive", `Couldn't build the Excel file. ${e instanceof Error ? e.message : ""}`);
    }
  };

  const onFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      notify("destructive", "Upload the .xlsx file. Older .xls files and CSVs aren't supported; save it as .xlsx in Excel.");
      return;
    }
    if (file.size > RFI_UPLOAD_MAX_BYTES) {
      notify("destructive", "That file is over 10 MB. An RFI sheet should be much smaller; check it's the right file.");
      return;
    }
    try {
      const parsed = parseRfiWorkbook(await file.arrayBuffer());
      if (parsed.opportunityId && parsed.opportunityId !== opportunityId) {
        notify("destructive", "That file was made for a different opportunity. Open that opportunity and upload it there.");
        return;
      }
      // Fresh list, in case someone answered or added RFIs since the page loaded
      const current = await fetchOpportunityRfis([opportunityId]);
      setRfis(current);
      const changes = planRfiImport(current.map(toSheetRow), parsed);
      if (!changes.some(isActionable)) {
        notify("info", "Nothing new in that file. No answers were added or changed.");
        return;
      }
      setReview({ fileName: file.name, changes });
    } catch (err) {
      notify("destructive", err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const applyReview = async (picked: RfiImportChange[]) => {
    if (!actor || !review) return;
    try {
      const saved = await applyRfiImport(opportunityId, picked, actor);
      notify("success", `${saved} ${saved === 1 ? "change" : "changes"} saved`);
      await logRfiAction(opportunityId, "upload", review.fileName, saved, actor);
      setReview(null);
    } catch (e) {
      notify("destructive", e instanceof Error ? e.message : "Couldn't save the answers.");
    } finally {
      load();
    }
  };

  if (loading) {
    return (
      <CardShell>
        <div className="flex justify-center p-6">
          <LoadingSpinner />
        </div>
      </CardShell>
    );
  }
  if (setupMissing) {
    return (
      <CardShell>
        <SetupMissing />
      </CardShell>
    );
  }

  const busy = saving || adding || editingId !== null;

  return (
    <CardShell
      counts={<Counts rfis={rfis} />}
      actions={
        <>
          <Button size="sm" onClick={startAdd} disabled={busy} leftIcon={<Plus className="h-4 w-4" />}>
            Add RFI
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openDownload}
            disabled={rfis.length === 0}
            title={rfis.length === 0 ? "Add an RFI first" : undefined}
            leftIcon={<Download className="h-4 w-4" />}
          >
            Download Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={rfis.length === 0}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Upload customer reply
          </Button>
          <input ref={fileInput} type="file" accept=".xlsx" className="hidden" onChange={onFilePicked} />
        </>
      }
    >
      {adding && (
        <RfiForm
          draft={draft}
          onChange={setDraft}
          onSave={saveNew}
          onCancel={cancelForm}
          saving={saving}
          showResponse={false}
          saveLabel="Save RFI"
        />
      )}

      {rfis.length === 0 && !adding ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-dark-700">
          No RFIs yet. Add questions for the customer while you build the estimate, then download them as Excel.
        </p>
      ) : (
        rfis.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>#</th>
                  <th className={TH}>Question</th>
                  <th className={TH}>Drawing / spec ref</th>
                  <th className={TH}>Customer response</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rfis.map((rfi) =>
                  editingId === rfi.id ? (
                    <tr key={rfi.id}>
                      <td colSpan={6} className="border-b border-neutral-200 p-0 dark:border-dark-300">
                        <RfiForm
                          draft={draft}
                          onChange={setDraft}
                          onSave={saveEdit}
                          onCancel={cancelForm}
                          onDelete={() => remove(rfi)}
                          saving={saving}
                          showResponse
                          saveLabel={`Save RFI #${rfi.number}`}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={rfi.id}>
                      <td className={`${TD} w-10 font-mono tabular-nums text-neutral-500`}>{rfi.number}</td>
                      <td className={`${TD} min-w-[240px] whitespace-pre-wrap text-neutral-900 dark:text-dark-900`}>
                        {rfi.question}
                        {rfi.source === "customer" && (
                          <span className="ml-2 align-middle">
                            <CustomerPill />
                          </span>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono text-xs text-neutral-500 dark:text-dark-700`}>
                        {rfi.spec_ref || "-"}
                      </td>
                      <td className={`${TD} min-w-[200px] whitespace-pre-wrap`}>
                        {rfi.response || <span className="italic text-neutral-400">Waiting on customer</span>}
                      </td>
                      <td className={TD}>
                        <StatusPill rfi={rfi} />
                      </td>
                      <td className={`${TD} w-10`}>
                        <button
                          type="button"
                          onClick={() => startEdit(rfi)}
                          disabled={busy}
                          title={`Edit RFI #${rfi.number}`}
                          className="rounded-none p-1 text-neutral-500 hover:text-brand disabled:opacity-40"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {log.length > 0 && (
        <div className="grid gap-0.5 border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-dark-300 dark:text-dark-700">
          {log.slice(0, 5).map((entry) => (
            <div key={entry.id}>
              {entry.action === "download" ? "Downloaded" : "Uploaded"} by {entry.user_name || "someone"} ·{" "}
              {format(new Date(entry.created_at), "MMM d, h:mm a")} ·{" "}
              {entry.action === "download"
                ? `${entry.rfi_count} ${entry.rfi_count === 1 ? "RFI" : "RFIs"}`
                : `${entry.rfi_count} ${entry.rfi_count === 1 ? "change" : "changes"}`}
            </div>
          ))}
        </div>
      )}

      {downloadOpen && (
        <Dialog open onOpenChange={setDownloadOpen}>
          <DialogContent className="w-full max-w-md">
            <DialogHeader>
              <DialogTitle>Download RFI Excel</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 text-sm">
              <Input
                id="rfi-requested-by"
                type="date"
                label="Response requested by"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
              />
              <p className="text-neutral-600 dark:text-dark-700">
                Includes all {rfis.length} RFIs, answered ones too, plus empty rows for the customer's own questions.
                {proposalDueDate ? ` Proposal due ${fmtDate(proposalDueDate.slice(0, 10))}.` : " No proposal due date is set on this opportunity."}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDownloadOpen(false)}>
                Cancel
              </Button>
              <Button onClick={download} leftIcon={<Download className="h-4 w-4" />}>
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {review && (
        <ReviewDialog
          fileName={review.fileName}
          changes={review.changes}
          onClose={() => setReview(null)}
          onApply={applyReview}
        />
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Job page: the RFIs from the opportunity the job came from, read-only
// ---------------------------------------------------------------------------

export function JobRfis({ jobId }: { jobId: string }) {
  const [rfis, setRfis] = useState<OpportunityRfi[]>([]);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: opps, error } = await supabase
          .schema("business")
          .from("opportunities")
          .select("id")
          .eq("job_id", jobId);
        if (error) throw error;
        const ids = (opps ?? []).map((o: { id: string }) => o.id);
        const rows = await fetchOpportunityRfis(ids);
        if (cancelled) return;
        setRfis(rows);
        setOpportunityId(ids[0] ?? null);
      } catch (e) {
        // Missing setup or no access: the job page simply shows no RFI card
        if (!(e instanceof RfiSetupMissingError)) console.warn("[rfi] job RFIs not loaded", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (rfis.length === 0) return null;

  return (
    <CardShell
      counts={<Counts rfis={rfis} />}
      actions={
        opportunityId ? (
          <Link to={`/sales-dashboard/opportunities/${opportunityId}`} className="text-sm font-medium text-brand hover:underline">
            Open opportunity
          </Link>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Question</th>
              <th className={TH}>Customer response</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rfis.map((rfi) => (
              <tr key={rfi.id}>
                <td className={`${TD} w-10 font-mono tabular-nums text-neutral-500`}>{rfi.number}</td>
                <td className={`${TD} whitespace-pre-wrap text-neutral-900 dark:text-dark-900`}>
                  {rfi.question}
                  {rfi.spec_ref && <span className="ml-2 font-mono text-xs text-neutral-500">{rfi.spec_ref}</span>}
                </td>
                <td className={`${TD} whitespace-pre-wrap`}>
                  {rfi.response || <span className="italic text-neutral-400">No answer</span>}
                </td>
                <td className={TD}>
                  <StatusPill rfi={rfi} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}
