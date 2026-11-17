/**
 * Past values for text fields, offered as suggestions while typing, like the
 * built-in reports. A value typed into a field (Manufacturer, Catalog No.) on
 * another report of the same form on the same job, or on another row of this
 * report, is offered in that same field so it need not be typed in full again.
 *
 * Suggestions only: nothing is filled in.
 */

import { FieldType } from '@/lib/types/customForms';
import type { FieldConfig, SectionConfig } from '@/lib/types/customForms';

/** Most suggestions kept per field. */
const MAX_PER_FIELD = 30;

/** Text the technician types themselves; not formulas, copies or fixed text. */
function remembers(field: FieldConfig | undefined): boolean {
  if (!field || field.type !== FieldType.TEXT || field.readOnly) return false;
  return !field.cellBehavior || field.cellBehavior === 'user';
}

export const historyKey = (sectionId: string, fieldId: string) => `${sectionId}::${fieldId}`;

/** A datalist id that is safe in HTML whatever the ids contain. */
export const historyListId = (key: string) =>
  `cf-history-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/**
 * Values per field, keyed by historyKey. `forms` are runtime form data, in the
 * order their values should be listed. Blank and repeated values are skipped.
 */
export function collectFieldHistory(
  sections: SectionConfig[],
  forms: Record<string, any>[],
): Record<string, string[]> {
  const found = new Map<string, Set<string>>();
  const add = (key: string, value: unknown) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (!text) return;
    let set = found.get(key);
    if (!set) found.set(key, (set = new Set()));
    if (set.size < MAX_PER_FIELD) set.add(text);
  };

  for (const form of forms) {
    for (const section of sections) {
      const fields = (section.fields ?? []).filter(remembers);
      const own = form[section.id];
      if (own) for (const f of fields) add(historyKey(section.id, f.id), own[f.id]);

      const columns = (section.columns ?? []).map((c) => c.field).filter(remembers);
      if (!columns.length) continue;
      const rowPrefix = `${section.id}_row`;
      for (const [stateKey, row] of Object.entries(form)) {
        if (!stateKey.startsWith(rowPrefix) || !row) continue;
        if (!/^\d+$/.test(stateKey.slice(rowPrefix.length))) continue;
        for (const f of columns) add(historyKey(section.id, f.id), (row as any)[f.id]);
      }
    }
  }

  return Object.fromEntries([...found].map(([key, set]) => [key, [...set]]));
}
