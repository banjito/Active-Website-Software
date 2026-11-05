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
  return { ...formData, [REPORT_LAYOUT_KEY]: { version: 2 } };
}

/** Was this saved report created before the mark existed? */
export function usesLegacyLayout(formData: Record<string, any>): boolean {
  return !formData[REPORT_LAYOUT_KEY];
}
