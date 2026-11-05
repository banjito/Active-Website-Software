/**
 * Contact resistance "Value Deviation" tables: what they show when a section
 * doesn't say otherwise. These were hard-coded in the renderer; they are now
 * defaults the component editor can change (section.deviation).
 */

import type { DeviationConfig, SectionConfig } from '@/lib/types/customForms';

const PHASE_CRITERIA = ['<10%', '<25%', '<50%', '<75%', '<100%'];

/** Deviation settings with every piece filled in, headings included. */
export type ResolvedDeviation = Required<Omit<DeviationConfig, 'headers'>> & {
  headers: Required<NonNullable<DeviationConfig['headers']>>;
};

export const DEFAULT_DEVIATION: ResolvedDeviation = {
  headers: { label: 'Value Deviation', criteria: 'Criteria', results: 'Results' },
  phaseLabel: 'Phase: N/A',
  phaseCriteriaOptions: PHASE_CRITERIA,
  phaseCriteriaDefault: '<50%',
  phaseResultOptions: ['PASS', 'FAIL', 'LIMITED SERVICE', 'N/A'],
  phaseResultDefault: 'N/A',
  // Saved values are keyed `{id}Criteria` / `{id}Result` (neutralCriteria, ...).
  extraRows: [
    { id: 'neutral', label: 'Neutral: N/A' },
    { id: 'ground', label: 'Ground: N/A' },
  ],
  extraCriteriaOptions: ['N/A', ...PHASE_CRITERIA],
  extraResultOptions: ['N/A', 'PASS', 'FAIL', 'LIMITED SERVICE'],
  extraDefault: 'N/A',
};

/** A section's deviation settings with the defaults filled in. */
export function resolveDeviation(section: SectionConfig): ResolvedDeviation {
  const d = section.deviation ?? {};
  return {
    ...DEFAULT_DEVIATION,
    ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
    headers: { ...DEFAULT_DEVIATION.headers, ...(d.headers ?? {}) },
  } as ResolvedDeviation;
}
