/**
 * Job Details used to hold temperature and humidity in one combined box
 * ("Temp °F / °C, Humidity"). It now uses separate fields: Temp (°F with °C
 * beside it) and Humidity (with %). Both store the same values as before
 * (temperature, temperatureCelsius, tcf, humidity), so converting a template
 * leaves every filled-in report readable.
 */

import { FieldType, type FieldConfig } from '@/lib/types/customForms';

export function hasCombinedTemperatureField(fields: readonly FieldConfig[] | undefined): boolean {
  return (fields ?? []).some((f) => f.type === FieldType.TEMPERATURE_HUMIDITY);
}

/** Replace the combined box with Temp and Humidity fields in its place. */
export function splitTemperatureHumidity(fields: readonly FieldConfig[]): FieldConfig[] {
  const out: FieldConfig[] = [];
  for (const f of fields) {
    if (f.type !== FieldType.TEMPERATURE_HUMIDITY) {
      out.push(f);
      continue;
    }
    if (!fields.some((x) => x.id === 'temperature')) {
      out.push({ id: 'temperature', label: 'Temp', type: FieldType.TEMPERATURE, defaultValue: f.defaultTemperature ?? 68 });
    }
    if (!fields.some((x) => x.id === 'humidity')) {
      out.push({ id: 'humidity', label: 'Humidity', type: FieldType.NUMBER, defaultValue: f.defaultHumidity ?? 50, valueSuffix: '%' });
    }
  }
  return out;
}
