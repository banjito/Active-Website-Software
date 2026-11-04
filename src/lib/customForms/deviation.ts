/**
 * Contact resistance Phase Value Deviation: three columns on each table row
 * (Measured, Criteria, Result), as on the Panelboard Assemblies ATS 25 report.
 * Their wording and choices are defaults the component editor can change
 * (section.deviation). Criteria and Result save as phaseCriteria / phaseResult
 * on the row; Measured is worked out from the row's readings, never saved.
 *
 * Reports created before this keep the separate Value Deviation tables they
 * were issued with: see usesLegacyDeviation and LEGACY_DEVIATION.
 */

import { FieldType } from '@/lib/types/customForms';
import type { ColumnConfig, DeviationConfig, SectionConfig } from '@/lib/types/customForms';
import { fitColumnWidths, rowStateKey } from '@/lib/customForms/runtime/layout';

const PHASE_CRITERIA = ['≤10%', '≤25%', '≤50%', '≤75%', '≤100%', 'N/A'];

/** Set on every row of a report created with the in-line columns. */
export const INLINE_DEVIATION_KEY = 'phaseDeviationInline';

/** Deviation settings with every piece filled in, headings included. */
export interface ResolvedDeviation {
  headers: Required<NonNullable<DeviationConfig['headers']>>;
  phaseCriteriaOptions: string[];
  phaseCriteriaDefault: string;
  phaseResultOptions: string[];
  phaseResultDefault: string;
}

export const DEFAULT_DEVIATION: ResolvedDeviation = {
  headers: { label: 'Phase Value Deviation', measured: 'Measured', criteria: 'Criteria', results: 'Result' },
  phaseCriteriaOptions: PHASE_CRITERIA,
  phaseCriteriaDefault: '≤50%',
  phaseResultOptions: ['PASS', 'FAIL', 'LIMITED SERVICE', 'N/A'],
  phaseResultDefault: 'N/A',
};

/** A reading exactly on the limit passes, so a saved "<50%" choice reads "≤50%". */
const atMost = (criteria: string) => criteria.replace(/^<=?(?=\s*\d)/, '≤');

/** A section's deviation settings with the defaults filled in. */
export function resolveDeviation(section: SectionConfig): ResolvedDeviation {
  const d = section.deviation ?? {};
  const merged = {
    ...DEFAULT_DEVIATION,
    ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
    headers: { ...DEFAULT_DEVIATION.headers, ...(d.headers ?? {}) },
  } as ResolvedDeviation;
  return {
    ...merged,
    phaseCriteriaOptions: merged.phaseCriteriaOptions.map(atMost),
    phaseCriteriaDefault: atMost(merged.phaseCriteriaDefault),
  };
}

/** The separate Value Deviation tables, exactly as older reports were issued. */
export const LEGACY_DEVIATION = {
  headers: { label: 'Value Deviation', criteria: 'Criteria', results: 'Results' },
  phaseLabel: 'Phase: N/A',
  phaseCriteriaOptions: ['<10%', '<25%', '<50%', '<75%', '<100%'],
  phaseCriteriaDefault: '<50%',
  phaseResultOptions: ['PASS', 'FAIL', 'LIMITED SERVICE', 'N/A'],
  phaseResultDefault: 'N/A',
  // Saved values are keyed `{id}Criteria` / `{id}Result` (neutralCriteria, ...).
  extraRows: [
    { id: 'neutral', label: 'Neutral: N/A' },
    { id: 'ground', label: 'Ground: N/A' },
  ] as { id: string; label: string }[],
  extraCriteriaOptions: ['N/A', '<10%', '<25%', '<50%', '<75%', '<100%'],
  extraResultOptions: ['N/A', 'PASS', 'FAIL', 'LIMITED SERVICE'],
  extraDefault: 'N/A',
};

export function resolveLegacyDeviation(section: SectionConfig): typeof LEGACY_DEVIATION {
  const d = section.deviation ?? {};
  return {
    ...LEGACY_DEVIATION,
    ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
    headers: { ...LEGACY_DEVIATION.headers, ...(d.headers ?? {}) },
  } as typeof LEGACY_DEVIATION;
}

/**
 * Was this report created before the in-line columns? New reports mark their
 * rows when they open, so saved values without the mark must keep the old
 * tables. A form with no values yet (the builder, a preview) is not old.
 */
export function usesLegacyDeviation(
  section: SectionConfig,
  values: Record<string, any>,
): boolean {
  if (section.componentType !== 'contact-resistance') return false;
  const firstRow = values[rowStateKey(section.id, 0)];
  if (firstRow) return !firstRow[INLINE_DEVIATION_KEY];
  return Object.keys(values[section.id] ?? {}).some((key) => /(Criteria|Result)$/.test(key));
}

/** The ids of the three columns; they exist only when the table is drawn. */
export const DEVIATION_COLUMN_IDS = new Set(['phaseMeasured', 'phaseCriteria', 'phaseResult']);

/** Spread of a row's A/B/C readings against the smallest, e.g. "12.50%". */
export function phaseDeviation(row: Record<string, any> | undefined): string {
  const readings = [row?.aPhase, row?.bPhase, row?.cPhase]
    .map((value) => parseFloat(String(value).trim()))
    .filter((value) => Number.isFinite(value));
  if (readings.length < 2) return 'N/A';
  const min = Math.min(...readings);
  if (min === 0) return 'N/A';
  return `${(((Math.max(...readings) - min) / min) * 100).toFixed(2)}%`;
}

/** PASS or FAIL against a criteria like "≤50%"; N/A when either is not a number. */
export function deviationResult(deviation: string, criteria: unknown): string {
  const threshold = String(criteria ?? '').match(/(\d+(?:\.\d+)?)%/);
  if (deviation === 'N/A' || !threshold) return 'N/A';
  return parseFloat(deviation) <= parseFloat(threshold[1]) ? 'PASS' : 'FAIL';
}

/** The part of the table the readings keep; the deviation columns take the rest. */
const READINGS_SHARE = 0.66;

/**
 * The section as drawn, with the deviation columns after its own. Done at
 * render time so every saved form gets them without its template changing.
 */
export function withInlineDeviation(section: SectionConfig): SectionConfig {
  const own = section.columns ?? [];
  if (section.componentType !== 'contact-resistance' || section.showDeviation === false || !own.length) {
    return section;
  }
  const dev = resolveDeviation(section);
  const select = (id: string, label: string, options: string[]) => ({
    id,
    label,
    type: FieldType.SELECT,
    options: options.map((value) => ({ label: value, value })),
  });
  const fitted = fitColumnWidths(own.map((column) => column.width));
  const columns: ColumnConfig[] = [
    ...own.map((column, i) => ({
      ...column,
      width: `${(fitted[i] ? parseFloat(fitted[i]!) : 100 / own.length) * READINGS_SHARE}%`,
    })),
    {
      id: 'phaseMeasured',
      label: dev.headers.measured,
      width: '10%',
      field: { id: 'phaseMeasured', label: dev.headers.measured, type: FieldType.TEXT, readOnly: true },
    },
    {
      id: 'phaseCriteria',
      label: dev.headers.criteria,
      width: '10%',
      field: select('phaseCriteria', dev.headers.criteria, dev.phaseCriteriaOptions),
    },
    {
      id: 'phaseResult',
      label: dev.headers.results,
      width: '14%',
      field: select('phaseResult', dev.headers.results, dev.phaseResultOptions),
    },
  ];

  // Rows saved before these columns existed show the starting values too.
  const cellDefaults = { ...section.cellDefaults };
  const rowCount = section.rows ?? 5;
  for (let row = 0; row < rowCount; row++) {
    cellDefaults[`row${row}_phaseCriteria`] = dev.phaseCriteriaDefault;
    cellDefaults[`row${row}_phaseResult`] = dev.phaseResultDefault;
  }

  // A split table has no single place for the group headings.
  const grouped = !section.tableLayout?.rows?.length && !section.v2?.header;
  return {
    ...section,
    showDeviation: false,
    columns,
    cellDefaults,
    ...(grouped && {
      v2: {
        ...section.v2,
        header: [
          {
            id: 'deviation-groups',
            cells: [
              { id: 'group-readings', columnId: own[0].id, label: 'Resistance Measurements', colSpan: own.length, align: 'center' as const },
              { id: 'group-deviation', columnId: 'phaseMeasured', label: dev.headers.label, colSpan: 3, align: 'center' as const },
            ],
          },
          {
            id: 'deviation-columns',
            cells: columns.map((column) => ({ id: `head-${column.id}`, columnId: column.id, label: column.label })),
          },
        ],
      },
    }),
  };
}
