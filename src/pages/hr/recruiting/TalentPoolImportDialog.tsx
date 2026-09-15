import React, { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { toast } from "../../../components/ui/toast";
import { prospectsService, TalentPoolError, TalentPoolMember } from "@/services/hr/prospectsService";
import {
  classifyAgainstExisting,
  CSV_ROW_STATUS_LABELS,
  CsvImportRow,
  EXAMPLE_TALENT_POOL_CSV,
  identityLookup,
  ImportFormatError,
  parseProspectCsv,
} from "@/lib/talentPool/csvImport";

// Enough to be quick without flooding PostgREST.
const IMPORT_CONCURRENCY = 4;

type Outcome = { ok: boolean; message?: string };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

async function importRow(row: CsvImportRow): Promise<Outcome> {
  try {
    await prospectsService.create(row.fields, row.id);
  } catch (error) {
    if (error instanceof TalentPoolError && error.code === "23505") {
      return { ok: false, message: "A prospect with this email or LinkedIn was added since the preview" };
    }
    return { ok: false, message: errorMessage(error) };
  }
  if (!row.note) return { ok: true };
  try {
    await prospectsService.addActivity(row.id, { type: "note", body: row.note, id: row.noteId });
    return { ok: true };
  } catch (error) {
    return { ok: true, message: `Added, but the note was not saved: ${errorMessage(error)}` };
  }
}

export const TalentPoolImportDialog: React.FC<{
  members: TalentPoolMember[];
  onClose: () => void;
  onImported: () => void;
}> = ({ members, onClose, onImported }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [includePossible, setIncludePossible] = useState(false);
  const [outcomes, setOutcomes] = useState<Map<number, Outcome>>(new Map());
  const [dragging, setDragging] = useState(false);
  const busy = applying || checking;

  const willImport = (r: CsvImportRow) =>
    r.status === "ready" || (includePossible && r.status === "possible_duplicate");
  const pending = rows.filter((r) => willImport(r) && !outcomes.get(r.lineNumber)?.ok);
  const importedCount = [...outcomes.values()].filter((o) => o.ok).length;
  const possibleCount = rows.filter((r) => r.status === "possible_duplicate").length;
  const skippedCount = rows.filter((r) => !willImport(r)).length;
  const warningCount = rows.filter((r) => willImport(r) && r.warnings.length).length;

  const downloadExample = () => {
    const blob = new Blob([EXAMPLE_TALENT_POOL_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "talent-pool-example.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setFileName(file.name);
      setRows([]);
      setOutcomes(new Map());
      setError("That isn't a CSV file. Save the spreadsheet as CSV and drop it again.");
      return;
    }
    processFile(file);
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setError("");
    setRows([]);
    setOutcomes(new Map());
    setIncludePossible(false);
    setChecking(true);
    try {
      const parsed = parseProspectCsv(await file.text(), members);
      const existing = await prospectsService.findIdentityMatches(identityLookup(parsed));
      setRows(classifyAgainstExisting(parsed, existing));
    } catch (err) {
      setError(
        err instanceof ImportFormatError || err instanceof TalentPoolError
          ? err.message
          : "Could not read that file.",
      );
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    const batch = [...pending];
    const queue = [...batch];
    const next = new Map(outcomes);
    setApplying(true);
    try {
      const worker = async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
          next.set(row.lineNumber, await importRow(row));
          setOutcomes(new Map(next));
        }
      };
      await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, batch.length) }, worker));
    } finally {
      setApplying(false);
    }

    const results = batch.map((r) => next.get(r.lineNumber)!);
    const added = results.filter((o) => o.ok).length;
    const failed = results.length - added;
    if (added) onImported();

    if (failed === 0 && results.every((o) => !o.message)) {
      toast({ title: `Imported ${added} ${added === 1 ? "prospect" : "prospects"}`, variant: "success" });
      onClose();
      return;
    }
    toast({
      title: failed ? `Imported ${added}, ${failed} failed` : `Imported ${added}`,
      description: failed
        ? "Failed rows are marked in the table. Import again to retry them."
        : "Some notes were not saved; see the table.",
      variant: failed ? "destructive" : "warning",
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        // A drop that misses the zone would otherwise open the file in the tab.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import prospects from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChosen}
          />
          <div
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-disabled={busy}
            onClick={() => !busy && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              // Ignore leaves into child elements.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 px-6 text-center border-2 border-dashed rounded-none transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
              rows.length ? "py-5" : "py-12"
            } ${
              dragging
                ? "border-brand bg-brand/10"
                : "border-neutral-300 dark:border-neutral-600 hover:border-brand hover:bg-neutral-50 dark:hover:bg-dark-100"
            } ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <Upload className={`h-8 w-8 ${dragging ? "text-brand" : "text-neutral-400"}`} />
            <div className="text-sm font-medium text-neutral-900 dark:text-white">
              {checking
                ? "Checking for duplicates..."
                : dragging
                  ? "Drop to preview"
                  : fileName
                    ? "Drop another CSV or click to replace"
                    : "Drag and drop a CSV here, or click to browse"}
            </div>
            {fileName && !dragging && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-full">{fileName}</div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={downloadExample}
            >
              Download example CSV
            </Button>
          </div>

          {error && (
            <div className="rounded-none border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="font-medium text-green-700 dark:text-green-400">
                  {pending.length} to import
                </span>
                {importedCount > 0 && (
                  <span className="text-green-700 dark:text-green-400">{importedCount} imported</span>
                )}
                {warningCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">{warningCount} with warnings</span>
                )}
                <span className="text-neutral-500 dark:text-neutral-400">{skippedCount} will be skipped</span>
                {possibleCount > 0 && (
                  <label className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={includePossible}
                      onChange={(e) => setIncludePossible(e.target.checked)}
                      disabled={applying}
                      className="rounded-none accent-brand"
                    />
                    Also import {possibleCount} possible {possibleCount === 1 ? "duplicate" : "duplicates"} (same
                    name only)
                  </label>
                )}
              </div>

              <div className="max-h-96 overflow-auto border border-neutral-200 dark:border-dark-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-50 dark:bg-dark-200">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const outcome = outcomes.get(row.lineNumber);
                      let label = CSV_ROW_STATUS_LABELS[row.status];
                      let labelClass = willImport(row)
                        ? "text-green-700 dark:text-green-400"
                        : "text-amber-700 dark:text-amber-400";
                      let detail = row.detail;
                      if (outcome) {
                        label = outcome.ok ? "Imported" : "Failed";
                        labelClass = outcome.ok
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400";
                        detail = outcome.message ?? "";
                      }
                      return (
                        <tr
                          key={row.lineNumber}
                          className="border-t border-neutral-200 dark:border-dark-200 align-top"
                        >
                          <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{row.lineNumber}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.displayName}</td>
                          <td className="px-3 py-2 max-w-[14rem] truncate text-neutral-500 dark:text-neutral-400">
                            {row.contact}
                          </td>
                          <td className="px-3 py-2">
                            <span className={labelClass}>{label}</span>
                            {detail && <span className="text-neutral-500 dark:text-neutral-400"> {detail}</span>}
                            {!outcome && willImport(row) && row.warnings.length > 0 && (
                              <ul className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                                {row.warnings.map((w) => (
                                  <li key={w}>{w}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            {importedCount > 0 ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={handleImport}
            disabled={applying || checking || pending.length === 0}
            className="bg-brand hover:bg-brand/90 text-white"
          >
            {applying
              ? `Importing... ${importedCount}`
              : `Import ${pending.length} ${pending.length === 1 ? "prospect" : "prospects"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
