/**
 * Conditional visibility for custom-form rows and columns.
 *
 * Single source of truth. Every renderer (builder canvas, builder preview,
 * template preview page, filler) must use these helpers so a row that is
 * hidden in one mode is hidden in all of them.
 */

import type {
  ColumnConfig,
  ConditionalRowConfig,
  SectionConfig,
  SettingFieldConfig,
} from "@/lib/types/customForms";

export type SettingValues = Record<string, string>;

/** True when every setting named in visibleWhen currently holds an allowed value. */
export function isVisibleWhen(
  visibleWhen: Record<string, string | string[]> | undefined,
  settings: SettingValues,
): boolean {
  if (!visibleWhen || Object.keys(visibleWhen).length === 0) return true;
  for (const [settingId, allowed] of Object.entries(visibleWhen)) {
    const current = settings[settingId] ?? "";
    const allowedList = Array.isArray(allowed) ? allowed : [allowed];
    if (!allowedList.includes(current)) return false;
  }
  return true;
}

export function isConditionalRowVisible(
  row: ConditionalRowConfig,
  settings: SettingValues,
): boolean {
  return isVisibleWhen(row.visibleWhen, settings);
}

export function isColumnVisible(
  column: ColumnConfig,
  settings: SettingValues,
): boolean {
  return isVisibleWhen(column.visibleWhen, settings);
}

/** The value a setting falls back to when nothing has been chosen yet. */
export function defaultSettingValue(setting: SettingFieldConfig): string {
  return setting.defaultValue ?? setting.options[0]?.value ?? "";
}

/**
 * Current values for a section's setting dropdowns, filling in defaults for
 * anything the caller has not supplied. `read` returns the stored value, which
 * may be undefined, null or "" for a setting the user has never touched.
 */
export function resolveSettingValues(
  section: SectionConfig,
  read: (settingId: string) => unknown,
): SettingValues {
  const settings: SettingValues = {};
  for (const setting of section.settingFields ?? []) {
    const current = read(setting.id);
    settings[setting.id] =
      current !== undefined && current !== null && current !== ""
        ? String(current)
        : defaultSettingValue(setting);
  }
  return settings;
}
