/**
 * Hand-built report conversions.
 *
 * A deterministic conversion is written and tested against its source report,
 * so where one exists it replaces the AI generator for that report. The AI
 * output is a starting point to be reviewed; a registered conversion is the
 * reviewed result, and generating it twice gives the same template.
 *
 * Keyed by the source file name, as the Generate dialog lists them.
 */

import type { CustomFormTemplate } from "@/lib/types/customForms";
import {
  LOW_VOLTAGE_SWITCH_GAPS,
  createLowVoltageSwitchDraft,
} from "./low-voltage-switch";

export interface RegisteredConversion {
  /** The template, freshly built on every call so edits never leak between drafts. */
  create: () => CustomFormTemplate;
  /** What still needs a person to review before this can be certified. */
  reviewGaps: readonly string[];
}

const CONVERSIONS: Record<string, RegisteredConversion> = {
  "LowVoltageSwitchReport.tsx": {
    create: createLowVoltageSwitchDraft,
    reviewGaps: LOW_VOLTAGE_SWITCH_GAPS,
  },
};

export function registeredConversion(
  reportFileName: string,
): RegisteredConversion | undefined {
  return CONVERSIONS[reportFileName];
}

export function hasRegisteredConversion(reportFileName: string): boolean {
  return reportFileName in CONVERSIONS;
}
