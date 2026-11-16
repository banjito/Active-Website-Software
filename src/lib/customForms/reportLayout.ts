/**
 * Which layout rules a report was created under. Finished reports must keep
 * printing as they were issued, but they share this renderer, so a layout change
 * has to tell them apart. New reports carry this mark in their saved values;
 * saved reports without it get the original rules (the `legacyLayout` chrome
 * flag and the cf-legacy-layout class).
 */

export const REPORT_LAYOUT_KEY = '__reportLayout';

/** Mark a new report. An already marked one is returned as it is. */
export function seedReportLayout<T extends Record<string, any>>(formData: T): T {
  if (formData[REPORT_LAYOUT_KEY]) return formData;
  return { ...formData, [REPORT_LAYOUT_KEY]: { version: 3 } };
}

/**
 * Version 3 (2026-11-16): every PASS / FAIL / LIMITED SERVICE / INVESTIGATE
 * shows as a solid green / red / yellow box. Reports issued before keep the
 * pale result tags and plain dropdown text they were issued with.
 */
export function usesSolidResultColors(formData: Record<string, any>): boolean {
  return Number(formData?.[REPORT_LAYOUT_KEY]?.version ?? 0) >= 3;
}

/**
 * What a blank TCF shows. With no temperature there is no correction factor, and
 * new reports say so. Saved reports without the mark keep showing blank.
 */
export function blankTcfText(formData: Record<string, any>): string {
  return usesLegacyLayout(formData) ? '' : 'N/A';
}

/** Was this saved report created before the mark existed? */
export function usesLegacyLayout(formData: Record<string, any>): boolean {
  return !formData[REPORT_LAYOUT_KEY];
}
