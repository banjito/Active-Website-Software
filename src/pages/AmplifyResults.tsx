import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { companyConfig } from "@/lib/companyConfig";
import { readWorkbook } from "@/lib/amplifyWorkbook";
import { extractTextLayer, ocrPdf } from "@/lib/oilReportOcr";
import {
  parseAmplifyReport,
  reviseAmplifyReport,
} from "@/lib/amplifyReportParse";
import { resultSeverity, severityClasses } from "@/lib/amplifyReport";
import {
  deleteAmplifyConversion,
  getAmplifyConversion,
  listAmplifyConversions,
  saveAmplifyConversion,
  updateAmplifyConversionReport,
  type SavedAmplifyConversion,
} from "@/lib/amplifyReportStore";
import { FileUp, RefreshCw, Trash2 } from "lucide-react";
import RegenerateDialog from "@/components/amplify/RegenerateDialog";
import ConversionProgress, {
  PDF_STAGES,
  type ConversionState,
  type StageSpec,
} from "@/components/reports/common/ConversionProgress";

/**
 * Entry point of the AMP-lify workflow: drop a spreadsheet or PDF report,
 * watch it convert, and land on the finished report.
 *
 * The conversion costs an LLM call, so results are written to
 * neta_ops.amplify_reports and this page doubles as the index of everything
 * converted so far.
 */

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** A workbook is parsed instantly, so nearly all the wait is the model call. */
const WORKBOOK_STAGES: StageSpec[] = [
  { key: "reading", label: "Reading the workbook", weight: 0.1 },
  { key: "structuring", label: "Structuring results", weight: 0.8, paged: true },
  { key: "saving", label: "Saving report", weight: 0.1 },
];

function isPdfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

function conversionDetail(state: ConversionState): string {
  if (
    isPdfFileName(state.fileName) &&
    (state.stage === "reading" || state.stage === "recognizing")
  ) {
    return state.pageCount
      ? `Page ${state.page} of ${state.pageCount}`
      : "Opening PDF";
  }
  if (state.stage === "reading") return "Flattening the sheets";
  if (state.stage === "structuring") {
    // A long document is structured in several passes. These count passes, not
    // reports: one unit can take more than one.
    return state.pageCount > 1
      ? `Part ${state.page} of ${state.pageCount}`
      : "Reading the test data";
  }
  return "Writing to the database";
}

const ACCEPTED = [".xlsx", ".xlsm", ".xls", ".csv", ".pdf"];

/** Cells of the drop zone's sheet, filled in on a stagger while dragging. */
const CELL_COUNT = 48;
const CELL_COLUMNS = 8;

const AmplifyResults: React.FC = () => {
  const navigate = useNavigate();
  const [conversions, setConversions] = useState<SavedAmplifyConversion[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [progress, setProgress] = useState<ConversionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Row being revised; also drives the dialog's open state. */
  const [regenTarget, setRegenTarget] = useState<SavedAmplifyConversion | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    text: string;
    /** The model declined the instruction, so nothing changed. */
    declined: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Nested dragenter/dragleave counter, so the sheet does not clear when the
  // cursor crosses onto a child of the drop zone.
  const dragDepth = useRef(0);

  // Stagger is random per cell so the sheet populates unevenly, the way a real
  // one does, rather than sweeping in a single wave. Fixed for the page's life.
  const cellDelays = useMemo(
    () => Array.from({ length: CELL_COUNT }, () => Math.random() * 0.45),
    [],
  );

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      setConversions(await listAmplifyConversions());
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      const at = (stage: ConversionState["stage"]) =>
        setProgress({ stage, page: 0, pageCount: 0, fileName: file.name });

      at("reading");
      try {
        let text: string;
        if (isPdfFileName(file.name)) {
          // Prefer selectable PDF text; scanned/image-only reports fall back to
          // browser-side OCR before entering the same structuring pipeline.
          const embedded = await extractTextLayer(file);
          const extracted =
            embedded ??
            (await ocrPdf(file, (pdfProgress) =>
              setProgress({
                stage:
                  pdfProgress.stage === "recognizing"
                    ? "recognizing"
                    : "reading",
                page: pdfProgress.page,
                pageCount: pdfProgress.pageCount,
                fileName: file.name,
              }),
            ));
          text = extracted.text;
        } else {
          text = (await readWorkbook(file)).text;
        }

        at("structuring");
        // A long export is structured one unit at a time; `page` counts those
        // passes here rather than source pages.
        const parsed = await parseAmplifyReport(text, file.name, (p) =>
          setProgress({
            stage: "structuring",
            page: p.done,
            pageCount: p.total,
            fileName: file.name,
          }),
        );

        at("saving");
        const saved = await saveAmplifyConversion(parsed, file.name);

        navigate(`/amplify-reports/${saved[0].id}`);
      } catch (err) {
        setError(String((err as Error)?.message || err));
        setProgress(null);
      }
    },
    [navigate],
  );

  const onPick = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
        setError(
          "Please choose an Excel workbook (.xlsx, .xlsm, .xls), a .csv, or a PDF.",
        );
        return;
      }
      void ingest(file);
    },
    [ingest],
  );

  /**
   * Revise one saved report from the list.
   *
   * The list query omits the payload, so the row is re-read in full first;
   * fetching every report up front to support a control most rows never use
   * would cost more than this does.
   */
  const regenerate = useCallback(
    async (instruction: string) => {
      if (!regenTarget) throw new Error("No report selected");

      const full = await getAmplifyConversion(regenTarget.id);
      const { report, note } = await reviseAmplifyReport(
        full.report,
        instruction,
      );
      const updated = await updateAmplifyConversionReport(full.id, report);

      // Swap the row in place rather than refetching the list: the order is by
      // created_at, which a revision does not move.
      setConversions((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      );
      setNotice(
        note
          ? { text: note, declined: true }
          : { text: `Updated "${updated.label}".`, declined: false },
      );
      setError(null);
    },
    [regenTarget],
  );

  const remove = useCallback(async (c: SavedAmplifyConversion) => {
    // Re-converting costs an API call (and possibly OCR), so confirm first.
    if (
      !window.confirm(
        `Delete the converted report for "${c.label}"? Converting it again means re-running the source file.`,
      )
    ) {
      return;
    }

    setDeletingId(c.id);
    setError(null);
    try {
      await deleteAmplifyConversion(c.id);
      setConversions((prev) => prev.filter((r) => r.id !== c.id));
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const busy = progress !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
          AMP-lify Reports
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Turn an Excel, CSV, or PDF report into a branded {companyConfig.name}
          report.
        </p>
      </div>

      <div className="max-w-5xl">
        {busy ? (
          <ConversionProgress
            state={progress}
            stages={
              isPdfFileName(progress.fileName) ? PDF_STAGES : WORKBOOK_STAGES
            }
            detailFor={conversionDetail}
          />
        ) : (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              // dragenter/dragleave bubble from the children too, so count the
              // crossings instead of trusting a single leave to mean "gone".
              dragDepth.current += 1;
              setDragOver(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragOver(false);
              onPick(e.dataTransfer.files);
            }}
            className={`relative isolate overflow-hidden rounded-none border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-neutral-900 ${
              dragOver
                ? "border-brand"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {/* Sheet: a grid of cells that fills in behind the prompt while
                something is held over the zone. Unmounted otherwise, so the
                animations do not run below the fold. */}
            {dragOver && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 grid gap-1 p-4"
                style={{
                  gridTemplateColumns: `repeat(${CELL_COLUMNS}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${CELL_COUNT / CELL_COLUMNS}, minmax(0, 1fr))`,
                }}
              >
                {cellDelays.map((delay, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${delay}s` }}
                    className="animate-cell-fill bg-brand/25 opacity-0 motion-reduce:animate-none motion-reduce:opacity-40"
                  />
                ))}
              </div>
            )}

            <FileUp
              className={`mx-auto h-12 w-12 transition-colors ${
                dragOver
                  ? "stroke-brand"
                  : "stroke-neutral-400 dark:stroke-neutral-600"
              }`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-4 text-lg font-bold text-neutral-900 dark:text-white">
              Drop an Excel, CSV, or PDF report to convert
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              .xlsx, .xlsm, .xls, .csv or .pdf
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.pdf"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-none bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Choose file
            </button>
          </div>
        )}

        {notice && (
          <div
            className={`mt-4 flex items-start justify-between gap-4 rounded-none border px-4 py-3 text-sm ${
              notice.declined
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Index of everything converted so far */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Previous Conversions
            </p>
            {conversions.length > 0 && (
              <span className="text-xs text-neutral-400 dark:text-neutral-600">
                {conversions.length}
              </span>
            )}
          </div>

          {loadingList ? (
            <p className="mt-4 text-sm text-neutral-400 dark:text-neutral-600">
              Loading…
            </p>
          ) : conversions.length === 0 ? (
            <div className="mt-4 rounded-none border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Nothing converted yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-neutral-100 border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              {conversions.map((c) => {
                const sev = resultSeverity(c.status ?? undefined);
                return (
                  // Row is a flex container, not a button: a delete control
                  // cannot legally nest inside the row's own button.
                  <div
                    key={c.id}
                    className="group flex items-center transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/amplify-reports/${c.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3.5 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {c.label}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {[c.siteName, c.reportDate].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {c.status && (
                        <span
                          className={`shrink-0 rounded-none px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${severityClasses[sev]}`}
                        >
                          {c.status}
                        </span>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-600">
                        {dateFormatter.format(new Date(c.createdAt))}
                      </span>
                    </button>

                    {/* Row controls, hidden until the row is hovered but kept
                        reachable by keyboard via focus-visible. The tooltips
                        use named groups so they answer to their own button
                        rather than to the row's `group`. */}
                    <div className="group/regen relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setRegenTarget(c)}
                        aria-label={`Regenerate ${c.label}`}
                        className="p-2 text-neutral-400 opacity-0 transition-opacity hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover/regen:opacity-100 group-focus-within/regen:opacity-100 dark:bg-neutral-700"
                      >
                        Regenerate
                      </span>
                    </div>

                    <div className="group/del relative mr-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        disabled={deletingId === c.id}
                        aria-label={`Delete ${c.label}`}
                        className="p-2 text-neutral-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover/del:opacity-100 group-focus-within/del:opacity-100 dark:bg-neutral-700"
                      >
                        Delete
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RegenerateDialog
        open={regenTarget !== null}
        onClose={() => setRegenTarget(null)}
        label={regenTarget?.label ?? ""}
        onSubmit={regenerate}
      />
    </div>
  );
};

export default AmplifyResults;
