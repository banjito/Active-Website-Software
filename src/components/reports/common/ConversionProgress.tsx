import React from "react";

/**
 * Wireframe build animation shown while a source document is converted.
 *
 * A conversion takes 10s-2min, so this has to do more than spin: the wireframe
 * assembles the same blocks the finished report uses (header, two spec panels,
 * results table), and every stage line reflects real pipeline state rather
 * than a timer.
 *
 * Shared by the ingestion workflows. Each one passes its own `stages`, since a
 * scanned PDF spends most of its time in OCR while a workbook is parsed
 * instantly and waits on the model instead.
 */

export type ConversionStage =
  | "reading"
  | "recognizing"
  | "structuring"
  | "saving";

export interface ConversionState {
  stage: ConversionStage;
  /** Progress within a paged stage; 0 when the stage is not paged. */
  page: number;
  pageCount: number;
  fileName: string;
}

export interface StageSpec {
  key: ConversionStage;
  label: string;
  /** Share of the bar this stage owns. Weights should sum to 1. */
  weight: number;
  /** Whether `page`/`pageCount` fill this stage in, rather than a flat half. */
  paged?: boolean;
}

/** Default stage set: an OCR'd PDF, where reading the pages dominates. */
export const PDF_STAGES: StageSpec[] = [
  { key: "reading", label: "Rendering pages", weight: 0.15, paged: true },
  { key: "recognizing", label: "Reading the tables", weight: 0.55, paged: true },
  { key: "structuring", label: "Structuring results", weight: 0.22 },
  { key: "saving", label: "Saving report", weight: 0.08 },
];

/** Overall 0..1, using page counts to fill in the long paged stages. */
function overallProgress(
  { stage, page, pageCount }: ConversionState,
  stages: StageSpec[],
): number {
  let done = 0;
  for (const s of stages) {
    if (s.key === stage) {
      const within = s.paged && pageCount > 0 ? Math.min(page / pageCount, 1) : 0.5;
      return done + s.weight * within;
    }
    done += s.weight;
  }
  return 1;
}

/** Wireframe blocks, drawn in the order the real report lays them out. */
const BLOCKS: { x: number; y: number; w: number; h: number; at: number }[] = [
  // Header band
  { x: 8, y: 8, w: 184, h: 14, at: 0.02 },
  // Unit summary strip
  { x: 8, y: 28, w: 184, h: 18, at: 0.1 },
  // Two spec panels
  { x: 8, y: 52, w: 89, h: 46, at: 0.2 },
  { x: 103, y: 52, w: 89, h: 46, at: 0.26 },
  // Results table header + rows
  { x: 8, y: 104, w: 184, h: 10, at: 0.36 },
  { x: 8, y: 118, w: 184, h: 7, at: 0.46 },
  { x: 8, y: 129, w: 184, h: 7, at: 0.54 },
  { x: 8, y: 140, w: 184, h: 7, at: 0.62 },
  { x: 8, y: 151, w: 184, h: 7, at: 0.7 },
  // Narrative block
  { x: 8, y: 164, w: 184, h: 26, at: 0.82 },
];

export interface ConversionProgressProps {
  state: ConversionState;
  /** Stage set for this pipeline. Defaults to the OCR'd-PDF weighting. */
  stages?: StageSpec[];
  /** Per-stage detail line, shown on the right of the active stage. */
  detailFor?: (state: ConversionState) => string;
}

/** Detail line for the paged-PDF pipeline. */
function pdfDetail(state: ConversionState): string {
  if (state.stage === "reading" || state.stage === "recognizing") {
    return state.pageCount
      ? `Page ${state.page} of ${state.pageCount}`
      : "Opening file";
  }
  if (state.stage === "structuring") return "Rebuilding the table from the scan";
  return "Writing to the database";
}

const ConversionProgress: React.FC<ConversionProgressProps> = ({
  state,
  stages = PDF_STAGES,
  detailFor = pdfDetail,
}) => {
  const progress = overallProgress(state, stages);
  const activeIndex = stages.findIndex((s) => s.key === state.stage);
  const detail = detailFor(state);

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid gap-8 md:grid-cols-[220px_1fr] md:items-center">
        {/* Wireframe */}
        <div className="relative mx-auto w-[220px]">
          <svg
            viewBox="0 0 200 200"
            className="w-full"
            role="img"
            aria-label="Building the report"
          >
            {BLOCKS.map((b, i) => {
              const reached = progress >= b.at;
              const perimeter = (b.w + b.h) * 2;
              return (
                <g key={i}>
                  {/* Filled ghost, once the block has been "built" */}
                  {reached && (
                    <rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      className="animate-wire-fill fill-brand"
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  )}
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill="none"
                    strokeWidth={1}
                    className={
                      reached
                        ? "animate-wire-draw stroke-brand"
                        : "stroke-neutral-200 dark:stroke-neutral-700"
                    }
                    style={
                      reached
                        ? ({
                            strokeDasharray: perimeter,
                            // Consumed by the wire-draw keyframes.
                            "--wire-len": `${perimeter}`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  />
                </g>
              );
            })}

            {/* Scan line sweeping the page */}
            <g className="animate-wire-scan">
              <line
                x1={4}
                y1={0}
                x2={196}
                y2={0}
                className="stroke-brand"
                strokeWidth={1.5}
              />
            </g>
          </svg>
        </div>

        {/* Stage list */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Converting
          </p>
          <p className="mt-1 truncate text-lg font-bold text-neutral-900 dark:text-white">
            {state.fileName}
          </p>

          <div className="mt-4 h-1 overflow-hidden bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full bg-brand transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          <ul className="mt-4 space-y-2">
            {stages.map((s, i) => {
              const done = i < activeIndex;
              const current = i === activeIndex;
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold ${
                      done
                        ? "border-brand bg-brand text-white"
                        : current
                          ? "border-brand text-brand"
                          : "border-neutral-300 text-transparent dark:border-neutral-700"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? "✓" : current ? "•" : ""}
                  </span>
                  <span
                    className={
                      current
                        ? "font-medium text-neutral-900 dark:text-white"
                        : done
                          ? "text-neutral-500 dark:text-neutral-400"
                          : "text-neutral-400 dark:text-neutral-600"
                    }
                  >
                    {s.label}
                  </span>
                  {current && (
                    <span className="ml-auto text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

        </div>
      </div>
    </div>
  );
};

export default ConversionProgress;
