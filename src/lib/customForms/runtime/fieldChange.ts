/**
 * Instance value updates shared by every fill-mode shell.
 */

import type { CustomFormTemplate } from "@/lib/types/customForms";
import { fahrenheitToCelsius, getRoundedTCF } from "@/lib/utils/temperatureCorrection";
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
 * Seed the job-info temperature block from the template defaults, leaving a
 * value the user already entered alone. Returns the original object when there
 * is nothing to seed, so callers can skip a state update.
 */
export function seedTemperatureDefaults(
  template: CustomFormTemplate,
  formData: FormData,
): FormData {
  const jobInfo = template.structure.sections.find(
    (s) => s.componentType === "job-info",
  );
  if (!jobInfo?.fields?.length) return formData;

  const tempField = jobInfo.fields.find((f) => f.id === "temperature");
  const tempHumidityField = jobInfo.fields.find(
    (f) => f.id === "temperatureHumidity",
  );

  let fahrenheit: number | null = null;
  let humidity = 50;
  if (
    tempField &&
    tempField.defaultValue !== undefined &&
    tempField.defaultValue !== ""
  ) {
    fahrenheit = parseFloat(String(tempField.defaultValue));
  } else if (tempHumidityField?.defaultTemperature != null) {
    fahrenheit = Number(tempHumidityField.defaultTemperature) || 68;
    humidity = Number(tempHumidityField.defaultHumidity) || 50;
  }
  if (fahrenheit == null || isNaN(fahrenheit)) return formData;

  const existing = formData[jobInfo.id] || {};
  if (existing.temperature !== undefined && existing.temperature !== "")
    return formData;

  const celsius = fahrenheitToCelsius(fahrenheit);
  return {
    ...formData,
    [jobInfo.id]: {
      ...existing,
      temperature: String(fahrenheit),
      temperatureCelsius: celsius.toFixed(2),
      tcf: getRoundedTCF(celsius).toFixed(3),
      humidity:
        existing.humidity !== undefined && existing.humidity !== ""
          ? existing.humidity
          : String(humidity),
    },
  };
}
