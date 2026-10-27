import React, { useState } from "react";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { ce } from "../engineeringTheme";

/** "2026-10-27T…" -> "Oct 27, 2026". */
export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
  );
}

const cardBase =
  "flex min-h-[148px] flex-col rounded-none p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

/** A template or report: title and a line of detail. */
export function ReportCard({
  title,
  meta,
  onClick,
  disabled,
}: {
  title: string;
  meta?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${cardBase} gap-3 border ${ce.border} ${ce.surface} ${ce.shadow} ${ce.hoverAlt}`}
    >
      <FileText className={`h-5 w-5 ${ce.accentInk}`} aria-hidden />
      <span className="text-[15px] font-semibold leading-snug">{title}</span>
      {meta && <span className={`mt-auto text-xs ${ce.muted}`}>{meta}</span>}
    </button>
  );
}

/** The dashed "New …" card with a plus in the middle. */
export function NewCard({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${cardBase} items-center justify-center gap-2 border-2 border-dashed ${ce.borderStrong} ${ce.muted} ${ce.hoverAlt}`}
    >
      <Plus className="h-7 w-7" aria-hidden />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

/** A small centered dialog in the portal's look. */
export function CeDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full max-w-md border ${ce.border} ${ce.surface} ${ce.ink} ${ce.shadow}`}
      >
        <div className={`flex items-center justify-between border-b px-5 py-3 ${ce.border}`}>
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`${ce.ghostButton} h-8 w-8`}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Name + "Start from" form for a new template. */
export function NewTemplateDialog({
  options,
  onCreate,
  onClose,
}: {
  options: { id: string; name: string }[];
  onCreate: (name: string, startFrom: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [startFrom, setStartFrom] = useState("blank");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(name.trim(), startFrom);
    } catch (err: any) {
      setError(err?.message || "Couldn't create the template.");
      setCreating(false);
    }
  };

  return (
    <CeDialog title="New template" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          <span className={ce.muted}>Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Short Circuit Study"
            className={`${ce.field} px-3 font-normal`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          <span className={ce.muted}>Start from</span>
          <select
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value)}
            className={`${ce.field} px-3 font-normal`}
          >
            <option value="blank">Blank</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                Copy of {o.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="m-0 text-xs text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${ce.ghostButton} h-10 px-4`}>
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || creating} className={`${ce.primaryButton} h-10 px-4`}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Create
          </button>
        </div>
      </form>
    </CeDialog>
  );
}
