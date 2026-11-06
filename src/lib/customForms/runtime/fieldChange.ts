/**
 * Instance value updates shared by every fill-mode shell.
 */

import type { CustomFormTemplate } from "@/lib/types/customForms";
import { fahrenheitToCelsius, getRoundedTCF } from "@/lib/utils/temperatureCorrection";
import { isJobInfoSection, jobInfoStartValues } from "@/lib/customForms/jobFill";
import { INLINE_DEVIATION_KEY, deviationResult, phaseDeviation } from "@/lib/customForms/deviation";
import type { FormData } from "./rowMutations";

/**
 * Write one field. Typing a temperature also recomputes the Celsius reading
 * and the temperature correction factor, which formulas address as {JD.TCF}.
 * The TCF reads the table at the nearest whole °C, as the built reports do.
 */
export function applyFieldChange(
  formData: FormData,
  stateKey: string,
  fieldId: string,
  value: any,
): FormData {
  const section = { ...(formData[stateKey] || {}), [fieldId]: value };

  if (fieldId === "temperature") {
    if (value === "" || value === null || value === undefined) {
      section.temperatureCelsius = "";
      section.tcf = "";
    } else if (!isNaN(parseFloat(value))) {
      const celsius = fahrenheitToCelsius(parseFloat(value));
      section.temperatureCelsius = celsius.toFixed(2);
      section.tcf = getRoundedTCF(celsius).toFixed(3);
    }
  }

  // A contact resistance row re-judges its deviation when the readings or the
  // criteria change. A result picked by hand stands until then. Older reports
  // never did this, so their rows are left as issued.
  if (section[INLINE_DEVIATION_KEY]) {
    const deviation = phaseDeviation(section);
    if (fieldId === "phaseCriteria" || deviation !== phaseDeviation(formData[stateKey])) {
      section.phaseResult = deviationResult(deviation, section.phaseCriteria);
    }
  }

  return { ...formData, [stateKey]: section };
}

/**
 * Temperature and humidity outside Job Details, such as an Environmental Data
 * section. Saved templates carry a default there too. A saved blank stays blank,
 * where a missing value would use the default, so new reports get a blank.
 */
export function seedBlankEnvironment(
  template: CustomFormTemplate,
  formData: FormData,
): FormData {
  let next = formData;
  for (const section of template.structure.sections) {
    if (section.componentType === "job-info") continue;
    for (const field of section.fields ?? []) {
      if (field.id !== "fahrenheit" && field.id !== "humidity") continue;
      if (field.defaultValue === undefined || field.defaultValue === null) continue;
      if (next[section.id]?.[field.id] !== undefined) continue;
      if (next === formData) next = { ...formData };
      next[section.id] = { ...next[section.id], [field.id]: "" };
    }
  }
  return next;
}

/**
 * Seed the Job Details block for a preview, which has no job: typed start values
 * only, leaving anything already entered alone. Returns the original object when
 * there is nothing to seed, so callers can skip a state update.
 */
export function seedJobInfoDefaults(
  template: CustomFormTemplate,
  formData: FormData,
): FormData {
  const jobInfo = template.structure.sections.find(isJobInfoSection);
  if (!jobInfo?.fields?.length) return formData;

  const existing = formData[jobInfo.id] || {};
  const block = { ...existing };
  let changed = false;
  for (const [key, value] of Object.entries(jobInfoStartValues(jobInfo.fields, {}))) {
    const blank = existing[key] === undefined || existing[key] === null || existing[key] === "";
    if (blank && existing[key] !== value) {
      block[key] = value;
      changed = true;
    }
  }
  return changed ? { ...formData, [jobInfo.id]: block } : formData;
}
