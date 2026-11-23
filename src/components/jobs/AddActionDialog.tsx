import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  BadgePercent,
  ClipboardList,
  FilePenLine,
  FileText,
  Handshake,
  Paperclip,
  Receipt,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type ActionType =
  | "main"
  | "subcontract"
  | "amendment"
  | "change_order"
  | "purchase_order"
  | "invoice"
  | "discount";

export type ActionValueOperation =
  | "add_to_total"
  | "subtract_from_total"
  | "subtract_from_remaining"
  | "add_to_remaining";

export interface ActionForm {
  name: string;
  type: ActionType;
  description: string;
  value: string;
  value_operation: ActionValueOperation;
  start_date: string;
  end_date: string;
}

/** The kinds people pick from, with what each usually does to the money. */
const TYPES: {
  value: ActionType;
  label: string;
  hint: string;
  icon: typeof FileText;
  op: ActionValueOperation;
  placeholder: string;
}[] = [
  { value: "main", label: "Main Contract", hint: "The base contract", icon: FileText, op: "add_to_total", placeholder: "e.g. Main Contract" },
  { value: "purchase_order", label: "Purchase Order", hint: "Customer PO", icon: ClipboardList, op: "add_to_total", placeholder: "e.g. PO #12345" },
  { value: "amendment", label: "Amendment", hint: "Changes a contract", icon: FilePenLine, op: "add_to_total", placeholder: "e.g. Amendment 1" },
  { value: "subcontract", label: "Subcontract", hint: "With a sub or prime", icon: Handshake, op: "add_to_total", placeholder: "e.g. Subcontract with ABC Electric" },
  { value: "invoice", label: "Invoice", hint: "Billed to the customer", icon: Receipt, op: "subtract_from_remaining", placeholder: "e.g. Invoice #1043" },
  { value: "discount", label: "Discount", hint: "Money off the contract", icon: BadgePercent, op: "subtract_from_total", placeholder: "e.g. Early pay discount" },
];

const OPERATIONS: { value: ActionValueOperation; label: string; hint: string }[] = [
  { value: "add_to_total", label: "Adds to the contract", hint: "Raises contract value and what's left to bill" },
  { value: "subtract_from_total", label: "Takes off the contract", hint: "Lowers contract value and what's left to bill" },
  { value: "subtract_from_remaining", label: "Bills against it", hint: "Lowers what's left to bill, like an invoice" },
  { value: "add_to_remaining", label: "Correction", hint: "Adds back to what's left to bill. Book fixes only" },
];

/** What the job-documents folder accepts for attachments. */
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"];
const MAX_BYTES = 50 * 1024 * 1024;

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ActionForm;
  setForm: Dispatch<SetStateAction<ActionForm>>;
  file: File | null;
  setFile: (file: File | null) => void;
  saving: boolean;
  onSave: () => void;
  /** Today's totals, for the before → after preview. */
  totalContractValue: number;
  remainingBalance: number;
}

export default function AddActionDialog({
  open,
  onOpenChange,
  form,
  setForm,
  file,
  setFile,
  saving,
  onSave,
  totalContractValue,
  remainingBalance,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear an old attachment error each time the window opens.
  useEffect(() => {
    if (open) setFileError(null);
  }, [open]);

  const typeInfo = TYPES.find((t) => t.value === form.type) ?? TYPES[0];
  const amount = form.value.trim() ? parseFloat(form.value) : NaN;
  const amountValid = !isNaN(amount) && amount > 0;
  const amountInvalid = !!form.value.trim() && !amountValid;

  const pickType = (t: (typeof TYPES)[number]) =>
    setForm((prev) => ({ ...prev, type: t.value, value_operation: t.op }));

  const takeFile = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError("Use a PDF, Word, Excel or image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("That file is over 50 MB.");
      return;
    }
    setFileError(null);
    setFile(f);
  };

  // Before → after for the two totals, so the effect is obvious.
  const op = form.value_operation;
  const totalAfter = amountValid
    ? op === "add_to_total"
      ? totalContractValue + amount
      : op === "subtract_from_total"
        ? totalContractValue - amount
        : totalContractValue
    : totalContractValue;
  const remainingAfter = amountValid
    ? op === "add_to_total" || op === "add_to_remaining"
      ? remainingBalance + amount
      : remainingBalance - amount
    : remainingBalance;

  const canSave = !saving && !!form.name.trim() && !amountInvalid;

  const field = "space-y-1.5 [&>div]:mb-0";
  const labelCls = "text-sm font-medium text-neutral-900 dark:text-white";

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="w-[95vw] sm:max-w-[1040px] max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add Action</DialogTitle>
          <DialogDescription>
            Anything that changes what this job is worth or what's left to bill.
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-action-form"
          className="min-h-0 flex-1 overflow-y-auto -mr-1 pr-1 py-2 grid gap-x-8 gap-y-5 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave();
          }}
        >
          {/* Left: what it is, its name, the amount, dates */}
          <div className="space-y-5">
            <fieldset>
              <legend className={`mb-2 ${labelCls}`}>What is it?</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = form.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pickType(t)}
                      className={`flex items-start gap-2 rounded-none border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        active
                          ? "border-brand bg-brand/5 ring-1 ring-brand"
                          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-brand" : "text-neutral-400"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-tight text-neutral-900 dark:text-white">
                          {t.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                          {t.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className={field}>
              <label htmlFor="action-name" className={labelCls}>
                Name
              </label>
              <Input
                id="action-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={typeInfo.placeholder}
                autoComplete="off"
              />
            </div>

            <div className={field}>
              <label htmlFor="action-amount" className={`flex items-baseline justify-between gap-3 ${labelCls}`}>
                Amount
                <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  Optional. Skip it for a PO number or reference only.
                </span>
              </label>
              <Input
                id="action-amount"
                inputMode="decimal"
                leftIcon={<span className="text-sm">$</span>}
                value={form.value}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, value: e.target.value.replace(/[^0-9.]/g, "") }))
                }
                placeholder="0.00"
                className="tabular-nums"
                aria-invalid={amountInvalid}
              />
              {amountInvalid && (
                <p className="text-xs text-red-600 dark:text-red-400">Enter an amount above $0.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={field}>
                <label htmlFor="action-start" className={labelCls}>
                  Start date <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
                </label>
                <Input
                  id="action-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className={field}>
                <label htmlFor="action-end" className={labelCls}>
                  End date <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
                </label>
                <Input
                  id="action-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Right: what it does to the money, attachment, notes */}
          <div className="space-y-5">
            <fieldset>
              <legend className={`mb-2 ${labelCls}`}>What it does</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {OPERATIONS.map((o) => {
                  const active = form.value_operation === o.value;
                  return (
                    <label
                      key={o.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-none border p-2.5 transition-colors ${
                        active
                          ? "border-brand bg-brand/5"
                          : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="action-operation"
                        value={o.value}
                        checked={active}
                        onChange={() => setForm((prev) => ({ ...prev, value_operation: o.value }))}
                        className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                      />
                      <span>
                        <span className="block text-sm font-medium leading-tight text-neutral-900 dark:text-white">
                          {o.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                          {o.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Before → after. Same height either way, so nothing jumps. */}
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-800/60">
                <span className="text-neutral-500 dark:text-neutral-400">Contract value</span>
                <span className="tabular-nums text-neutral-900 dark:text-white">
                  {!amountValid || totalAfter === totalContractValue ? (
                    <>
                      {money(totalContractValue)}
                      {amountValid && (
                        <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">no change</span>
                      )}
                    </>
                  ) : (
                    <>
                      {money(totalContractValue)} <span className="text-neutral-400">→</span>{" "}
                      <span className="font-semibold">{money(totalAfter)}</span>
                    </>
                  )}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">Left to bill</span>
                <span className="tabular-nums text-neutral-900 dark:text-white">
                  {money(remainingBalance)}
                  {amountValid && (
                    <>
                      {" "}
                      <span className="text-neutral-400">→</span>{" "}
                      <span className="font-semibold">{money(remainingAfter)}</span>
                    </>
                  )}
                </span>
              </div>
              {!amountValid && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Enter an amount to see the change.
                </p>
              )}
            </fieldset>

            <div className={field}>
              <span className={labelCls}>
                Attachment <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
              </span>
              {file ? (
                <div className="flex items-center gap-3 border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/60">
                  <FileText className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{file.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="p-1 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                    aria-label="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    if (!dragging) setDragging(true);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    takeFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-none border-2 border-dashed px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    dragging
                      ? "border-brand bg-brand/5 text-neutral-900 dark:text-white"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-neutral-500"
                  }`}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    {dragging ? (
                      "Drop to attach"
                    ) : (
                      <>
                        Drag the signed copy, PO or invoice here, or{" "}
                        <span className="font-semibold text-neutral-900 underline underline-offset-2 dark:text-white">
                          choose a file
                        </span>
                      </>
                    )}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS.map((x) => `.${x}`).join(",")}
                    className="hidden"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      takeFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              {fileError && <p className="text-xs text-red-600 dark:text-red-400">{fileError}</p>}
            </div>

            <div className={field}>
              <label htmlFor="action-notes" className={labelCls}>
                Notes <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
              </label>
              {/* Fixed short height: a global textarea style was stretching it */}
              <textarea
                id="action-notes"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Anything worth knowing later"
                className="block h-[60px] min-h-0 w-full resize-none rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-dark-150 dark:text-white"
                rows={2}
              />
            </div>
          </div>
        </form>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-action-form" disabled={!canSave}>
            {saving ? "Adding..." : `Add ${typeInfo.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
