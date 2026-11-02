/**
 * Charts in custom forms.
 *
 * A chart section plots columns of a table on the same form: one column across
 * the bottom (x), one or more as lines, dots or bars. It points at the table by
 * reference code ("TD") and at columns by number (1 = first column), the same
 * way formulas do, so a chart saved as a component works on any form with a
 * matching table. Values are read with the formula engine, so calculated
 * columns plot too.
 */

import type { SectionConfig } from '@/lib/types/customForms';
import { getCellValue, getSectionReferenceCode } from '@/lib/customForms/formCellResolution';
import { resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';

export type ChartType = 'line' | 'scatter' | 'bar';

export interface ChartSeries {
  /** 1-based column number in the source table. */
  column: number;
  label?: string;
  color?: string;
}

export interface ChartConfig {
  /** Reference code of the table to plot, e.g. "TD". */
  source?: string;
  /** 1-based column number for the x axis. */
  xColumn?: number;
  series: ChartSeries[];
  type: ChartType;
  xLabel?: string;
  yLabel?: string;
  yScale?: 'linear' | 'log';
  /** Height on the page, in pixels. */
  height?: number;
}

export const CHART_COLORS = ['#f26722', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2'];

export const DEFAULT_CHART: ChartConfig = { series: [], type: 'line', height: 260 };

export function chartSource(config: ChartConfig, sections: readonly SectionConfig[]): SectionConfig | undefined {
  if (!config.source) return undefined;
  const code = config.source.trim().toUpperCase();
  return sections.find((s) => s.columns?.length && getSectionReferenceCode(s).toUpperCase() === code);
}

export interface ChartPoint {
  x: number | string;
  [seriesKey: string]: number | string | null;
}

/** Key a series' values are stored under in each point. */
export const seriesKey = (index: number) => `s${index}`;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, '').replace(/^[<>≤≥]=?\s*/, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * One point per table row that has an x value and at least one y value.
 * `numericX` is false when any x is text (e.g. "A-B"), which plots as
 * categories in row order instead of on a number line.
 */
export function chartData(
  config: ChartConfig,
  sections: readonly SectionConfig[],
  formData: Record<string, Record<string, any>>,
): { points: ChartPoint[]; numericX: boolean; source?: SectionConfig } {
  const source = chartSource(config, sections);
  const columns = source?.columns ?? [];
  const xCol = config.xColumn ? columns[config.xColumn - 1] : undefined;
  if (!source || !xCol || !config.series.length) return { points: [], numericX: true, source };

  const rows = source.conditionalRows?.length ?? resolveRowCount(source);
  const read = (r: number, colIndex: number) => {
    const col = columns[colIndex];
    if (!col) return '';
    return getCellValue(
      formData,
      col.field,
      rowStateKey(source.id, r),
      source.id,
      r,
      sections as SectionConfig[],
      source.cellFormulas,
      col.id,
    );
  };

  const points: ChartPoint[] = [];
  let numericX = true;
  for (let r = 0; r < rows; r++) {
    const rawX = read(r, config.xColumn! - 1);
    const textX = rawX == null ? '' : String(rawX).trim();
    if (!textX) continue;
    const point: ChartPoint = { x: textX };
    let any = false;
    config.series.forEach((s, i) => {
      const y = toNumber(read(r, s.column - 1));
      point[seriesKey(i)] = y;
      if (y !== null) any = true;
    });
    if (!any) continue;
    const nx = toNumber(textX);
    if (nx === null) numericX = false;
    points.push(point);
  }
  if (numericX) {
    for (const p of points) p.x = toNumber(p.x) as number;
    points.sort((a, b) => (a.x as number) - (b.x as number));
  }
  return { points, numericX, source };
}

/** A series' label: its own, else the column's heading. */
export function seriesLabel(series: ChartSeries, source: SectionConfig | undefined): string {
  return series.label || source?.columns?.[series.column - 1]?.label || `Column ${series.column}`;
}
