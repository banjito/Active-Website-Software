/**
 * Generate a template from a file, in the open.
 *
 * The build runs as a conversation of small steps, so instead of a spinner that
 * either returns a form or an error paragraph, this shows each step as it
 * happens next to the form taking shape, and can be stopped. A stopped or
 * failed run still leaves a draft of whatever was built, because every step was
 * valid on its own.
 */

import React from "react";
import { Upload, X, Check, AlertTriangle, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { buildTemplateFromFile, rebuildOneSection } from "@/lib/customForms/excel/generate";
import { summarizeExcelReview } from "@/lib/customForms/excel/import";
import type { BuildEvent, BuildRun, BuildStopReason } from "@/lib/customForms/excel/build";
import type { ExcelImportDraft, ExcelWorkbookAnalysis } from "@/lib/customForms/excel/types";

interface SectionShape {
  id: string;
  title: string;
  columns?: number;
  rows?: number;
  fields?: number;
}

interface Line {
  text: string;
  ok: boolean;
}

const STOP_TEXT: Record<BuildStopReason, string> = {
  finished: "Finished.",
  cancelled: "Stopped.",
  step_limit: "Stopped after reaching the step limit.",
  stuck: "Stopped: the same step kept failing.",
  provider_error: "Stopped: the layout provider could not be reached.",
  no_action: "Stopped: the model stopped calling tools.",
};

export interface GenerateFromFileDialogProps {
  onClose: () => void;
  /** Saves the draft and returns the new template id. */
  onSave: (draft: ExcelImportDraft) => Promise<string>;
  onOpenTemplate: (templateId: string) => void;
}

export const GenerateFromFileDialog: React.FC<GenerateFromFileDialogProps> = ({
  onClose,
  onSave,
  onOpenTemplate,
}) => {
  const [phase, setPhase] = React.useState<"choose" | "building" | "done">("choose");
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [heading, setHeading] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [sections, setSections] = React.useState<SectionShape[]>([]);
  const [draft, setDraft] = React.useState<ExcelImportDraft | null>(null);
  const [stopped, setStopped] = React.useState<BuildStopReason | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<ExcelWorkbookAnalysis | null>(null);
  const [run, setRun] = React.useState<BuildRun | null>(null);
  const [redoing, setRedoing] = React.useState<string | null>(null);
  const [complaint, setComplaint] = React.useState("");

  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // Drag events fire for every child, so nesting is counted.
  const dragDepth = React.useRef(0);
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const onEvent = React.useCallback((event: BuildEvent) => {
    if (event.kind === "reading") {
      setHeading(event.text);
      return;
    }
    if (event.kind === "retry") {
      setLines((current) => [...current, { text: `Retrying: ${event.text}`, ok: false }]);
      return;
    }
    if (event.kind === "step") {
      setLines((current) => [...current, { text: event.step.text, ok: event.step.ok }]);
      setSections(
        event.state.sections.map((section) => ({
          id: section.id,
          title: section.title,
          columns: section.columns?.length,
          rows: section.rows,
          fields: section.fields?.length,
        })),
      );
    }
  }, []);

  const start = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      setError(
        `${file.name} is not an .xlsx file. Open it in Excel and save a copy as .xlsx (macro-enabled .xlsm and older .xls files are not accepted).`,
      );
      return;
    }
    setError(null);
    setLines([]);
    setSections([]);
    setDraft(null);
    setStopped(null);
    setPhase("building");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await buildTemplateFromFile(file, { onEvent, signal: controller.signal });
      setAnalysis(result.analysis);
      setRun(result.run);
      setDraft(result.draft);
      setStopped(result.run.reason);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that workbook");
      setPhase("choose");
    } finally {
      abortRef.current = null;
    }
  };

  /** Build one section again, keeping everything else that was built. */
  const redo = async (sectionId: string) => {
    if (!analysis || !run) return;
    const target = sections.find((section) => section.id === sectionId);
    setRedoing(null);
    setComplaint("");
    setPhase("building");
    setLines((current) => [...current, { text: `Rebuilding "${target?.title ?? sectionId}"…`, ok: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await rebuildOneSection(analysis, run, sectionId, complaint, {
        onEvent,
        signal: controller.signal,
      });
      setRun(result.run);
      setDraft(result.draft);
      setSections(
        result.run.state.sections.map((section) => ({
          id: section.id,
          title: section.title,
          columns: section.columns?.length,
          rows: section.rows,
          fields: section.fields?.length,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rebuild that section");
    } finally {
      abortRef.current = null;
      setPhase("done");
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const id = await onSave(draft);
      onOpenTemplate(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft");
      setSaving(false);
    }
  };

  const busy = phase === "building";
  const counts = draft ? summarizeExcelReview(draft.review) : null;
  const uncovered = draft?.review.issues.filter((issue) => issue.code === "UNCOVERED_CELLS") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full ${phase === "choose" ? "max-w-lg" : "max-w-3xl"} bg-white dark:bg-dark-100 rounded-lg shadow-xl`}>
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand" />
              Generate from File
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {heading || "The file is read in your browser and rebuilt as a draft you can edit."}
            </p>
          </div>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6">
          {phase === "choose" && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear first, so picking the same file twice still fires.
                  e.target.value = "";
                  if (file) void start(file);
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose or drop an .xlsx workbook"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  dragDepth.current += 1;
                  setDragging(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (dragDepth.current === 0) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dragDepth.current = 0;
                  setDragging(false);
                  const files = Array.from(e.dataTransfer.files ?? []);
                  if (files.length > 1) {
                    setError("Drop one file at a time.");
                    return;
                  }
                  if (files[0]) void start(files[0]);
                }}
                className={`flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-lg border-2 border-dashed text-center transition-colors ${
                  dragging
                    ? "cursor-copy border-brand bg-brand/10"
                    : "cursor-pointer border-neutral-300 dark:border-neutral-600 hover:border-brand hover:bg-brand/5"
                }`}
              >
                <Upload className={`w-8 h-8 ${dragging ? "text-brand" : "text-neutral-400"}`} />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {dragging ? "Drop the file to start" : "Drag a file here, or click to choose one"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Excel .xlsx, up to 10 MB. Macro-enabled and password protected files
                  are not accepted.
                </p>
              </div>
              <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
                Calculations are translated from the file itself and checked against the
                results it was saved with. Anything that could not be reproduced is listed
                on the draft. An import is never a verified report.
              </p>
            </>
          )}

          {phase !== "choose" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                ref={logRef}
                className="h-72 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 p-3 space-y-1"
              >
                {lines.map((line, index) => (
                  <div key={index} className="flex items-start gap-2 text-xs">
                    {line.ok ? (
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <span className={line.ok ? "text-neutral-700 dark:text-neutral-300" : "text-amber-700 dark:text-amber-400"}>
                      {line.text}
                    </span>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                    <LoadingSpinner size="xs" />
                    Working…
                  </div>
                )}
                {!lines.length && !busy && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Nothing was built.</p>
                )}
              </div>

              <div className="h-72 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
                {sections.map((section, index) => (
                  <div key={index} className="rounded border border-neutral-200 dark:border-neutral-700 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                          {section.title}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {section.columns
                            ? `${section.columns} columns × ${section.rows ?? 0} rows`
                            : `${section.fields ?? 0} fields`}
                        </div>
                      </div>
                      {phase === "done" && (
                        <button
                          type="button"
                          onClick={() => {
                            setRedoing(redoing === section.id ? null : section.id);
                            setComplaint("");
                          }}
                          title="Build this section again"
                          className="shrink-0 text-neutral-400 hover:text-brand"
                          aria-label={`Rebuild ${section.title}`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {redoing === section.id && (
                      <div className="mt-2 flex items-center gap-1">
                        <input
                          autoFocus
                          value={complaint}
                          onChange={(e) => setComplaint(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void redo(section.id);
                            if (e.key === "Escape") setRedoing(null);
                          }}
                          placeholder="What's wrong with it? (optional)"
                          className="flex-1 min-w-0 px-1.5 py-1 text-[10px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100"
                        />
                        <Button size="sm" onClick={() => void redo(section.id)} className="bg-brand hover:bg-brand-dark">
                          Rebuild
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {!sections.length && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Sections appear here as they are built.
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === "done" && draft && counts && (
            <div className="mt-4 rounded border border-neutral-200 dark:border-neutral-700 p-3 text-xs text-neutral-700 dark:text-neutral-300 space-y-1">
              <p className="font-medium text-neutral-900 dark:text-white">
                {stopped ? STOP_TEXT[stopped] : ""} Built {sections.length} section
                {sections.length === 1 ? "" : "s"}.
              </p>
              <p>
                Calculations: <strong>{counts.matched} match</strong> the file's saved
                results, <strong>{counts.different} disagree</strong>,{" "}
                {counts.unverified} could not be checked, {counts.unsupported} were not
                carried over.
              </p>
              {uncovered.map((issue, index) => (
                <p key={index} className="text-neutral-500 dark:text-neutral-400">
                  {issue.sheet}: {issue.message}
                </p>
              ))}
              <p className="text-neutral-500 dark:text-neutral-400">
                Everything still to check is listed in a review section on the draft.
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

          {phase !== "choose" && (
            <div className="mt-4 flex items-center justify-end gap-2">
              {busy ? (
                <Button
                  variant="outline"
                  onClick={() => abortRef.current?.abort()}
                  leftIcon={<Square className="w-3.5 h-3.5" />}
                >
                  Stop
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Discard
                  </Button>
                  <Button
                    onClick={save}
                    disabled={!draft || !sections.length || saving}
                    className="bg-brand hover:bg-brand-dark"
                  >
                    {saving
                      ? "Saving…"
                      : stopped === "finished"
                        ? "Open in builder"
                        : `Open what was built (${sections.length} section${sections.length === 1 ? "" : "s"})`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateFromFileDialog;
