/**
 * Builder settings for a chart section: which table, which column across the
 * bottom, which columns to plot, and how it looks.
 *
 * In the form builder the table is picked from the form's tables. In the
 * component editor there is no form yet, so the table is given by reference
 * code and columns by number; the chart finds them on whichever form it is
 * added to.
 */

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SectionConfig } from "@/lib/types/customForms";
import { getSectionReferenceCode } from "@/lib/customForms/formCellResolution";
import {
  CHART_COLORS,
  DEFAULT_CHART,
  chartSource,
  type ChartConfig,
  type ChartSeries,
  type ChartType,
} from "@/lib/customForms/chart";

const box =
  "h-7 px-2 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";
const label = "flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300";

export const ChartSettings: React.FC<{
  section: SectionConfig;
  /** The form's sections (form builder); just this one in the component editor. */
  allSections: readonly SectionConfig[];
  onUpdate: (updates: Partial<SectionConfig>) => void;
}> = ({ section, allSections, onUpdate }) => {
  const config: ChartConfig = { ...DEFAULT_CHART, ...(section.chart ?? {}) };
  const set = (patch: Partial<ChartConfig>) => onUpdate({ chart: { ...config, ...patch } });
  const tables = allSections.filter((s) => s.id !== section.id && s.columns?.length);
  const source = chartSource(config, allSections);
  const columns = source?.columns ?? [];
  const setSeries = (series: ChartSeries[]) => set({ series });

  const columnPicker = (value: number | undefined, onChange: (n: number | undefined) => void, title: string) =>
    columns.length ? (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className={`${box} w-40`}
        title={title}
      >
        <option value="">Choose…</option>
        {columns.map((c, i) => (
          <option key={c.id} value={i + 1}>
            C{i + 1} · {c.label || c.id}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="number"
        min={1}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className={`${box} w-16`}
        title={`${title} (column number, 1 = first)`}
        placeholder="#"
      />
    );

  return (
    <div className="space-y-2 border border-neutral-200 dark:border-neutral-700 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className={label}>
          Table
          {tables.length ? (
            <select
              value={source ? getSectionReferenceCode(source) : config.source ?? ""}
              onChange={(e) => set({ source: e.target.value || undefined, xColumn: undefined, series: [] })}
              className={`${box} w-56`}
            >
              <option value="">Choose a table…</option>
              {tables.map((t) => (
                <option key={t.id} value={getSectionReferenceCode(t)}>
                  {t.title} ({getSectionReferenceCode(t)})
                </option>
              ))}
            </select>
          ) : (
            <input
              value={config.source ?? ""}
              onChange={(e) => set({ source: e.target.value.trim() || undefined })}
              className={`${box} w-24 font-mono uppercase`}
              placeholder="e.g. TD"
              title="Reference code of the table on the form (the part before the dot in {TD.C1})"
            />
          )}
        </label>
        <label className={label}>
          Across the bottom (x)
          {columnPicker(config.xColumn, (xColumn) => set({ xColumn }), "Column across the bottom")}
        </label>
        <label className={label}>
          Chart
          <select value={config.type} onChange={(e) => set({ type: e.target.value as ChartType })} className={`${box} w-24`}>
            <option value="line">Line</option>
            <option value="scatter">Dots</option>
            <option value="bar">Bars</option>
          </select>
        </label>
        <label className={label}>
          <input
            type="checkbox"
            checked={config.yScale === "log"}
            onChange={(e) => set({ yScale: e.target.checked ? "log" : undefined })}
            className="rounded-none"
          />
          Log scale
        </label>
        <label className={label}>
          Height
          <select value={config.height ?? 260} onChange={(e) => set({ height: Number(e.target.value) })} className={`${box} w-20`}>
            {[180, 220, 260, 320, 400].map((h) => (
              <option key={h} value={h}>
                {h}px
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className={label}>
          X label
          <input value={config.xLabel ?? ""} onChange={(e) => set({ xLabel: e.target.value || undefined })} className={`${box} w-36`} placeholder="column heading" />
        </label>
        <label className={label}>
          Y label
          <input value={config.yLabel ?? ""} onChange={(e) => set({ yLabel: e.target.value || undefined })} className={`${box} w-36`} placeholder="e.g. Tan δ (%)" />
        </label>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Plotted columns</div>
        {config.series.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {columnPicker(s.column, (column) => setSeries(config.series.map((x, k) => (k === i ? { ...x, column: column ?? 1 } : x))), "Plotted column")}
            <input
              value={s.label ?? ""}
              onChange={(e) => setSeries(config.series.map((x, k) => (k === i ? { ...x, label: e.target.value || undefined } : x)))}
              className={`${box} w-36`}
              placeholder="legend (column heading)"
            />
            <input
              type="color"
              value={s.color || CHART_COLORS[i % CHART_COLORS.length]}
              onChange={(e) => setSeries(config.series.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)))}
              className="h-7 w-8 p-0 border border-neutral-300 dark:border-neutral-700 rounded-none bg-transparent"
              title="Colour"
            />
            <button
              type="button"
              onClick={() => setSeries(config.series.filter((_, k) => k !== i))}
              className="p-1 text-neutral-400 hover:text-red-600"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            // Next column that isn't already plotted or across the bottom.
            const used = new Set([config.xColumn, ...config.series.map((s) => s.column)]);
            let next = 1;
            while (used.has(next) && next <= Math.max(columns.length, 1)) next++;
            setSeries([...config.series, { column: next }]);
          }}
          className="h-7 px-2 flex items-center gap-1 text-xs text-brand hover:bg-brand/10 rounded-none"
        >
          <Plus className="w-3.5 h-3.5" />
          Plot a column
        </button>
      </div>
      {!tables.length && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          This chart plots a table on the form it is added to. Give that table's reference code and
          column numbers here, or pick them in the form builder.
        </p>
      )}
    </div>
  );
};

export default ChartSettings;
