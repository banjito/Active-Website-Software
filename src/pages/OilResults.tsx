import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { companyConfig } from "@/lib/companyConfig";
import { extractTextLayer, ocrPdf } from "@/lib/oilReportOcr";
import { parseOilReport } from "@/lib/oilReportParse";
import { conditionSeverity, severityClasses } from "@/lib/oilReport";
import {
  deleteConversion,
  listConversions,
  saveConversion,
  type SavedConversion,
} from "@/lib/oilReportStore";
import { FlaskConical, Trash2 } from "lucide-react";
import ConversionProgress, {
  type ConversionState,
} from "@/components/oil/ConversionProgress";

/**
 * Entry point of the oil report workflow: drop a lab PDF, watch it convert,
 * land on the finished report.
 *
 * The conversion itself (OCR + LLM structuring) is expensive, so results are
 * written to neta_ops.oil_analysis_reports and this page doubles as the index
 * of everything converted so far.
 */

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Bubbles rising through the drop zone's liquid, staggered so they read as
 *  separate rather than one pulse. */
const BUBBLES = [
  { left: "18%", size: "14px", delay: "0s", duration: "2.6s" },
  { left: "34%", size: "10px", delay: "0.9s", duration: "3.2s" },
  { left: "57%", size: "17px", delay: "0.4s", duration: "2.9s" },
  { left: "72%", size: "12px", delay: "1.6s", duration: "3.4s" },
  { left: "87%", size: "9px", delay: "1.1s", duration: "2.4s" },
];

const OilResults: React.FC = () => {
  const navigate = useNavigate();
  const [conversions, setConversions] = useState<SavedConversion[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [progress, setProgress] = useState<ConversionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Nested dragenter/dragleave counter, so the liquid does not drain when the
  // cursor crosses onto a child of the drop zone.
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      setConversions(await listConversions());
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
      setProgress({
        stage: "reading",
        page: 0,
        pageCount: 0,
        fileName: file.name,
      });

      try {
        // A PDF with a real text layer skips OCR entirely.
        const embedded = await extractTextLayer(file);
        const { text } =
          embedded ??
          (await ocrPdf(file, (p) =>
            setProgress({
              stage: p.stage === "recognizing" ? "recognizing" : "reading",
              page: p.page,
              pageCount: p.pageCount,
              fileName: file.name,
            }),
          ));

        setProgress({
          stage: "structuring",
          page: 0,
          pageCount: 0,
          fileName: file.name,
        });
        const parsed = await parseOilReport(text, file.name);

        setProgress({
          stage: "saving",
          page: 0,
          pageCount: 0,
          fileName: file.name,
        });
        const saved = await saveConversion(parsed, file.name);

        navigate(`/oil-results/${saved[0].id}`);
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
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please choose a PDF.");
        return;
      }
      void ingest(file);
    },
    [ingest],
  );

  const remove = useCallback(
    async (c: SavedConversion) => {
      // Re-converting costs an OCR pass and an API call, so confirm first.
      if (
        !window.confirm(
          `Delete the converted report for "${c.label}"? Converting it again means re-running the PDF.`,
        )
      ) {
        return;
      }

      setDeletingId(c.id);
      setError(null);
      try {
        await deleteConversion(c.id);
        setConversions((prev) => prev.filter((r) => r.id !== c.id));
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const busy = progress !== null;
  // The drop zone's liquid only moves while something is being dragged over
  // it; parked below the fold it stays paused rather than burning frames.
  const flowing = dragOver ? "" : "[animation-play-state:paused]";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
          Oil Analysis Conversion
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Turn a lab PDF into a branded {companyConfig.name} report.
        </p>
      </div>

      <div className="max-w-5xl">
        {busy ? (
          <ConversionProgress state={progress} />
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
            {/* Liquid: fills the bottom half on drag, crest sliding sideways
                so the surface keeps flowing once it settles. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 transition-transform duration-500 ease-out motion-reduce:transition-none ${
                dragOver ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div
                className={`flex h-full animate-oil-swell flex-col overflow-hidden motion-reduce:animate-none ${flowing}`}
              >
                {/* Twice as wide as the zone and tiling every half-width, so
                    the sideways slide loops seamlessly. */}
                <svg
                  viewBox="0 0 1200 40"
                  preserveAspectRatio="none"
                  className={`h-8 w-[200%] shrink-0 animate-oil-drift fill-brand motion-reduce:animate-none ${flowing}`}
                >
                  <path d="M0,20 C100,38 200,2 300,20 C400,38 500,2 600,20 C700,38 800,2 900,20 C1000,38 1100,2 1200,20 L1200,40 L0,40 Z" />
                </svg>

                {/* Pulled up a pixel: the wave's stretched bottom edge
                    antialiases into a hairline seam otherwise. */}
                <div className="relative -mt-px flex-1 bg-brand">
                  {BUBBLES.map((b) => (
                    <span
                      key={b.left}
                      style={{
                        left: b.left,
                        width: b.size,
                        height: b.size,
                        animationDelay: b.delay,
                        animationDuration: b.duration,
                      }}
                      className={`absolute bottom-1 animate-oil-bubble rounded-full bg-white/40 motion-reduce:animate-none ${flowing}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <FlaskConical
              className={`mx-auto h-12 w-12 transition-colors ${
                dragOver
                  ? "stroke-brand"
                  : "stroke-neutral-400 dark:stroke-neutral-600"
              }`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-4 text-lg font-bold text-neutral-900 dark:text-white">
              Drop a lab PDF to convert
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              // Submerged in brand-colored liquid while dragging, so it
              // inverts to stay visible.
              className={`mt-5 rounded-none px-5 py-2.5 text-sm font-medium transition-colors ${
                dragOver
                  ? "bg-white text-brand"
                  : "bg-brand text-white hover:bg-brand-dark"
              }`}
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
              Previous MVA Conversions
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
                const sev = conditionSeverity(c.latestCondition ?? undefined);
                return (
                  // Row is a flex container, not a button: a delete control
                  // cannot legally nest inside the row's own button.
                  <div
                    key={c.id}
                    className="group flex items-center transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/oil-results/${c.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3.5 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {c.label}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {[c.siteName, c.latestSampleDate]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {c.latestCondition && (
                        <span
                          className={`shrink-0 rounded-none px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${severityClasses[sev]}`}
                        >
                          {c.latestCondition}
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

export default OilResults;
