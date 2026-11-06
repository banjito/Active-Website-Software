/**
 * Trends for one piece of equipment: the same reading across every report.
 *
 * Each custom-form report linked to an asset is one point in time (its test
 * date). A trend picks a table on a form, one or more of its columns and one
 * or more of its rows; every (column, row) pair is a series, e.g. "A-G,
 * Pole to Pole" plotted across the yearly IR tests. Values are read with the
 * formula engine (so calculated columns trend too) and can be converted into
 * one unit so a GΩ reading and a MΩ reading land on the same scale.
 */

import { ComponentType, type CustomFormStructure, type SectionConfig } from '@/lib/types/customForms';
import { getCellValue } from '@/lib/customForms/formCellResolution';
import { contactResistanceRowLabels, resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';
import { convertReading, resolveSourceUnit } from '@/lib/customForms/unitResolution';
import { reportTestDate } from '@/lib/customForms/equipment';
import { readingNumber, type Reading } from '@/lib/trends/readings';

type FormData = Record<string, Record<string, any>>;

/** One filled report on the asset, ready to read. */
export interface TrendReport {
  instanceId: string;
  templateId: string;
  jobId: string;
  status?: string;
  structure: CustomFormStructure;
  data: FormData;
  /** The report's test date (ISO); its created date when it has none. */
  date: string;
  /** False when `date` is the created date, not a test date on the form. */
  dateFromForm: boolean;
}

/** Work out a report's date: its test date, else when it was created. */
export function trendDate(structure: CustomFormStructure, data: FormData, createdAt: string): { date: string; fromForm: boolean } {
  const tested = reportTestDate(structure, data);
  if (tested) return { date: tested.iso, fromForm: true };
  return { date: String(createdAt ?? '').slice(0, 10), fromForm: false };
}

/** How many rows a table has in a filled report (rows added on site included). */
export function filledRowCount(section: SectionConfig, data: FormData): number {
  let rows = section.conditionalRows?.length ?? resolveRowCount(section);
  while (data[rowStateKey(section.id, rows)]) rows += 1;
  return rows;
}

/** A row's name: its conditional label, its preset label, or its first column's text. */
export function rowLabel(section: SectionConfig, data: FormData, r: number): string {
  const conditional = section.conditionalRows?.[r]?.label;
  if (conditional) return conditional;
  if (section.componentType === 'contact-resistance') {
    const preset = contactResistanceRowLabels(section)[r];
    if (preset) return preset;
  }
  const first = section.columns?.[0];
  if (first) {
    const fixed = section.staticCells?.[`row${r}_${first.id}`] ?? (first.field.cellBehavior === 'static' ? first.field.staticValue : undefined);
    if (fixed) return fixed;
    const typed = data[rowStateKey(section.id, r)]?.[first.field.id];
    if (typed != null && String(typed).trim() && !Number.isFinite(Number(typed))) return String(typed).trim();
  }
  return `Row ${r + 1}`;
}

const NOT_RESULTS_TYPES = new Set<string>([
  ComponentType.JOB_INFO,
  ComponentType.NAMEPLATE_DATA,
  ComponentType.EXTENDED_NAMEPLATE,
  ComponentType.LV_BREAKER_NAMEPLATE,
  ComponentType.VISUAL_INSPECTION,
  ComponentType.TEST_EQUIPMENT,
  ComponentType.COMMENTS,
  ComponentType.CUSTOM_TEXT,
  ComponentType.CHART,
  ComponentType.SIGNATURES,
  ComponentType.PHOTOS,
  ComponentType.TEMPERATURE_CORRECTION,
  ComponentType.FUSE_DATA,
  ComponentType.TRIP_UNIT_SETTINGS,
  ComponentType.DEVICE_SETTINGS_AS_FOUND_AS_LEFT,
]);

/** A plain custom table says what it is only in its title. */
const NOT_RESULTS_TITLE = /nameplate|visual|mechanical|inspection|job (info|detail)|customer|test equipment|instrument|comment|notes|signature/i;

/** Columns that describe the test rather than report it. */
const NOT_A_READING_COLUMN = /^(test )?voltage$|^test (kv|duration)$|^units?$|^notes?$|^comments?$/i;

/** Trends only compare results. The form builder can overrule this per table. */
export function isResultsSection(section: SectionConfig): boolean {
  if (!section.columns?.length) return false;
  if (typeof section.trendResults === 'boolean') return section.trendResults;
  if (NOT_RESULTS_TYPES.has(section.componentType)) return false;
  return !NOT_RESULTS_TITLE.test(section.title ?? '');
}

/** Every result on a filled custom form. */
export function customFormReadings(structure: CustomFormStructure, data: FormData): Reading[] {
  const readings: Reading[] = [];
  for (const section of structure.sections.filter(isResultsSection)) {
    const rows = filledRowCount(section, data);
    for (const column of section.columns ?? []) {
      const name = column.label || column.id;
      if (column.field.cellBehavior === 'static' || NOT_A_READING_COLUMN.test(name)) continue;
      for (let r = 0; r < rows; r += 1) {
        if (section.staticCells?.[`row${r}_${column.id}`]) continue;
        const key = rowStateKey(section.id, r);
        const raw = getCellValue(data, column.field, key, section.id, r, structure.sections, section.cellFormulas, column.id);
        const value = readingNumber(raw);
        if (value === null) continue;
        readings.push({
          fieldKey: `${section.id}:${column.id}:${r}`,
          group: section.title,
          label: rows > 1 ? `${name} · ${rowLabel(section, data, r)}` : name,
          value,
          unit: resolveSourceUnit({ section, fieldId: column.field.id, value: raw, rowData: data[key], sectionData: data[section.id] }),
        });
      }
    }
  }
  return readings;
}

export interface TrendSeries {
  key: string;
  columnId: string;
  row: number;
  label: string;
}

export interface TrendPoint {
  instanceId: string;
  /** Test date as a number (ms), for a time axis. */
  t: number;
  date: string;
  [seriesKey: string]: number | string | null;
}

const numberOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, '').replace(/^[<>≤≥]=?\s*/, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * The trend: one point per report (oldest first), one value per series.
 * `unit`, when given, converts every value into it; a value that can't be
 * converted (no unit known, or the wrong kind) is left out rather than shown
 * on the wrong scale.
 */
export function buildTrend(args: {
  reports: TrendReport[];
  sectionId: string;
  columnIds: string[];
  rows: number[];
  unit?: string;
}): { series: TrendSeries[]; points: TrendPoint[] } {
  const { reports, sectionId, columnIds, rows, unit } = args;
  const reference = reports.find((r) => r.structure.sections.some((s) => s.id === sectionId));
  const refSection = reference?.structure.sections.find((s) => s.id === sectionId);
  const columnLabel = (id: string) => refSection?.columns?.find((c) => c.id === id)?.label || id;

  const series: TrendSeries[] = [];
  for (const columnId of columnIds) {
    for (const row of rows) {
      const label =
        rows.length > 1 || columnIds.length === 1
          ? `${columnLabel(columnId)} · ${refSection && reference ? rowLabel(refSection, reference.data, row) : `Row ${row + 1}`}`
          : columnLabel(columnId);
      series.push({ key: `s_${series.length}`, columnId, row, label });
    }
  }

  const points: TrendPoint[] = [];
  for (const report of [...reports].sort((a, b) => a.date.localeCompare(b.date))) {
    const section = report.structure.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const t = Date.parse(`${report.date}T00:00:00`);
    if (!Number.isFinite(t)) continue;
    const point: TrendPoint = { instanceId: report.instanceId, t, date: report.date };
    let any = false;
    for (const s of series) {
      const column = section.columns?.find((c) => c.id === s.columnId);
      if (!column) {
        point[s.key] = null;
        continue;
      }
      const key = rowStateKey(section.id, s.row);
      const raw = getCellValue(report.data, column.field, key, section.id, s.row, report.structure.sections, section.cellFormulas, column.id);
      let value = numberOf(raw);
      if (value !== null && unit) {
        const source = resolveSourceUnit({
          section,
          fieldId: column.field.id,
          value: raw,
          rowData: report.data[key],
          sectionData: report.data[section.id],
        });
        // No unit on record: take the reading as already in the chosen unit.
        value = convertReading(value, source, unit);
      }
      point[s.key] = value;
      if (value !== null) any = true;
    }
    if (any) points.push(point);
  }
  return { series, points };
}

/** Change from the first to the last value, in percent (null when it can't be said). */
export function trendChange(points: { [key: string]: unknown }[], key: string): number | null {
  const values = points.map((p) => p[key]).filter((v): v is number => typeof v === 'number');
  if (values.length < 2 || values[0] === 0) return null;
  return ((values[values.length - 1] - values[0]) / Math.abs(values[0])) * 100;
}

/** The trend as CSV text (date, then one column per series). */
export function trendCsv(
  series: { key: string; label: string }[],
  points: ({ date: string } & { [key: string]: unknown })[],
): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Test date', ...series.map((s) => s.label)].map(esc).join(',')];
  for (const p of points) lines.push([p.date, ...series.map((s) => p[s.key])].map(esc).join(','));
  return lines.join('\n');
}
