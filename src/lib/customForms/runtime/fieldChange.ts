/**
 * Instance value updates shared by every fill-mode shell.
 */

import type { CustomFormTemplate } from "@/lib/types/customForms";
import { fahrenheitToCelsius, getTCF } from "@/lib/utils/temperatureCorrection";
import type { FormData } from "./rowMutations";

/**
 * Write one field. Typing a temperature also recomputes the Celsius reading
 * and the temperature correction factor, which formulas address as {JD.TCF}.
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
      section.tcf = getTCF(celsius).toFixed(3);
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
      tcf: getTCF(celsius).toFixed(3),
      humidity:
        existing.humidity !== undefined && existing.humidity !== ""
          ? existing.humidity
          : String(humidity),
    },
  };
}
