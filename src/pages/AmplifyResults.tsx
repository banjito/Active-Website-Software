import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { companyConfig } from "@/lib/companyConfig";
import { readWorkbook } from "@/lib/amplifyWorkbook";
import { parseAmplifyReport } from "@/lib/amplifyReportParse";
import { resultSeverity, severityClasses } from "@/lib/amplifyReport";
import {
  deleteAmplifyConversion,
  listAmplifyConversions,
  saveAmplifyConversion,
  type SavedAmplifyConversion,
} from "@/lib/amplifyReportStore";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import ConversionProgress, {
  type ConversionState,
  type StageSpec,
} from "@/components/reports/common/ConversionProgress";

/**
 * Entry point of the AMP-lify workflow: drop an Excel report, watch it
 * convert, land on the finished report.
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
  { key: "structuring", label: "Structuring results", weight: 0.8 },
  { key: "saving", label: "Saving report", weight: 0.1 },
];

function workbookDetail(state: ConversionState): string {
  if (state.stage === "reading") return "Flattening the sheets";
  if (state.stage === "structuring") return "Reading the test data";
  return "Writing to the database";
}

const ACCEPTED = [".xlsx", ".xlsm", ".xls", ".csv"];

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
        const { text } = await readWorkbook(file);

        at("structuring");
        const parsed = await parseAmplifyReport(text, file.name);

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
        setError("Please choose an Excel workbook (.xlsx, .xlsm, .xls) or a .csv.");
        return;
      }
      void ingest(file);
    },
    [ingest],
  );

  const remove = useCallback(async (c: SavedAmplifyConversion) => {
    // Re-converting costs an API call, so confirm first.
    if (
      !window.confirm(
        `Delete the converted report for "${c.label}"? Converting it again means re-running the workbook.`,
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
          Turn an Excel report into a branded {companyConfig.name} report.
        </p>
      </div>

      <div className="max-w-5xl">
        {busy ? (
          <ConversionProgress
            state={progress}
            stages={WORKBOOK_STAGES}
            detailFor={workbookDetail}
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

            <FileSpreadsheet
              className={`mx-auto h-12 w-12 transition-colors ${
                dragOver
                  ? "stroke-brand"
                  : "stroke-neutral-400 dark:stroke-neutral-600"
              }`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-4 text-lg font-bold text-neutral-900 dark:text-white">
              Drop an Excel report to convert
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              .xlsx, .xlsm, .xls or .csv
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
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

                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={deletingId === c.id}
                      title={`Delete ${c.label}`}
                      aria-label={`Delete ${c.label}`}
                      // Hidden until hover, but focus-visible keeps it
                      // reachable by keyboard.
                      className="mr-3 shrink-0 p-2 text-neutral-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AmplifyResults;
