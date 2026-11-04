/**
 * Copy readings from the last report on the same equipment.
 *
 * Repeat tests (the yearly IR on the same switchgear) start from what was
 * entered last time. Only empty fields are filled, and the parts that belong
 * to this visit are never copied: job details, signatures, photos and the
 * report's own bookkeeping.
 */

import type { CustomFormStructure, SectionConfig } from '@/lib/types/customForms';
import { INLINE_DEVIATION_KEY } from '@/lib/customForms/deviation';

type FormData = Record<string, Record<string, any>>;

/** Sections whose values belong to one visit, not to the equipment. */
const VISIT_SECTIONS = new Set(['job-info', 'signatures', 'photos', 'temperature-correction']);

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Which section a runtime key belongs to: "sec" or "sec_row3". */
function sectionForKey(key: string, sections: readonly SectionConfig[]): SectionConfig | undefined {
  return sections.find((s) => key === s.id || key.startsWith(`${s.id}_row`));
}

function visitOnlyField(section: SectionConfig, fieldId: string): boolean {
  if (/__(signature|signedAt|signedBy)$/.test(fieldId)) return true;
  // Says how this report was created, so it must not pass to another one.
  if (fieldId === INLINE_DEVIATION_KEY) return true;
  const field =
    section.fields?.find((f) => f.id === fieldId) ??
    (section.field?.id === fieldId ? section.field : undefined) ??
    section.columns?.find((c) => c.field.id === fieldId)?.field;
  return field?.type === 'signature' || field?.type === 'photo';
}

export function copyPreviousReadings(
  structure: CustomFormStructure,
  current: FormData,
  previous: FormData,
): { formData: FormData; copied: number } {
  const next: FormData = { ...current };
  let copied = 0;
  for (const [key, values] of Object.entries(previous ?? {})) {
    if (!values || typeof values !== 'object') continue;
    const section = sectionForKey(key, structure.sections);
    if (!section || VISIT_SECTIONS.has(section.componentType)) continue;
    let row = next[key];
    for (const [fieldId, value] of Object.entries(values)) {
      if (isBlank(value) || visitOnlyField(section, fieldId)) continue;
      if (!isBlank(row?.[fieldId])) continue;
      row = { ...(row ?? {}), [fieldId]: value };
      copied += 1;
    }
    if (row !== current[key]) next[key] = row;
  }
  return { formData: next, copied };
}
