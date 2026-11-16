/**
 * The "Result" input type: a dropdown whose choices each carry a colour, shown
 * on the form and on paper like the report's overall PASS / FAIL box.
 *
 * Stored as an ordinary dropdown (type "select") plus `colorCoded: true`, so
 * every reader that handles dropdowns keeps working. Each option may carry
 * its own `color`; without one, PASS / FAIL / INVESTIGATE-style words get the
 * standard green / red / yellow.
 */

import { ComponentType, FieldType, type FieldConfig, type SectionConfig } from '@/lib/types/customForms';

/**
 * Does this section colour its results? Set per section with the "Color-code
 * results" switch; unset, everything is coloured except Visual Inspection
 * components, whose results print as plain text.
 */
export function sectionColorsResults(
  section: Pick<SectionConfig, 'colorResults' | 'componentType' | 'checklistItems' | 'columns'>,
): boolean {
  if (typeof section.colorResults === 'boolean') return section.colorResults;
  const checklist = !!section.checklistItems?.length && !section.columns?.length;
  return section.componentType !== ComponentType.VISUAL_INSPECTION && !checklist;
}
import { resultTone, type ResultTone } from './resultRules';

/** The type dropdown's value for this input type (not a stored field type). */
export const RESULT_TYPE_VALUE = 'result';
export const RESULT_TYPE_LABEL = 'Result (color-coded)';

export const TONE_COLOR: Record<ResultTone, string> = {
  pass: '#22c55e',
  fail: '#ef4444',
  limited: '#eab308',
};

/** A new Result field's choices. */
export const DEFAULT_RESULT_FIELD_OPTIONS: { label: string; value: string; color: string }[] = [
  { label: 'PASS', value: 'PASS', color: TONE_COLOR.pass },
  { label: 'FAIL', value: 'FAIL', color: TONE_COLOR.fail },
  { label: 'INVESTIGATE', value: 'INVESTIGATE', color: TONE_COLOR.limited },
];

/** Grey for a new choice that isn't a known result word. */
const NEUTRAL = '#9ca3af';

export function isResultField(field: Pick<FieldConfig, 'type' | 'colorCoded'> | undefined | null): boolean {
  return !!field?.colorCoded && field.type === FieldType.SELECT;
}

/** What the builder's type dropdown should show for `field`. */
export function typeSelectValue(field: Pick<FieldConfig, 'type' | 'colorCoded'>): string {
  return isResultField(field) ? RESULT_TYPE_VALUE : field.type;
}

/** The colour suggested for an option's text before one is picked. */
export function suggestedOptionColor(label: string): string {
  const tone = resultTone(label);
  return tone ? TONE_COLOR[tone] : NEUTRAL;
}

/**
 * The changes for picking `value` in a type dropdown. Picking Result keeps a
 * dropdown's existing choices (colouring known words); otherwise PASS / FAIL /
 * INVESTIGATE.
 */
export function typeChoicePatch(field: FieldConfig, value: string): Partial<FieldConfig> {
  if (value === RESULT_TYPE_VALUE) {
    const existing = field.type === FieldType.SELECT || field.type === FieldType.RADIO ? field.options ?? [] : [];
    const keep = existing.length > 0 && !(existing.length === 1 && /^Option \d+$/.test(existing[0].label));
    return {
      type: FieldType.SELECT,
      colorCoded: true,
      options: keep
        ? existing.map((o) => ({ ...o, color: o.color ?? suggestedOptionColor(o.label) }))
        : DEFAULT_RESULT_FIELD_OPTIONS.map((o) => ({ ...o })),
    };
  }
  return { type: value as FieldConfig['type'], colorCoded: undefined };
}

/**
 * A form's own colour keywords (settings.colorKeywords): any result, dropdown
 * or calculated cell whose text is exactly this word (any capitals) gets this
 * colour. They win over the standard PASS / FAIL / LIMITED colours.
 */
export interface ColorKeyword {
  label: string;
  color: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Keywords tidied: no blanks, no repeats, valid colours only. */
export function cleanColorKeywords(raw: unknown): ColorKeyword[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ColorKeyword[] = [];
  for (const entry of raw) {
    const label = String((entry as any)?.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const color = String((entry as any)?.color ?? '');
    const key = label.toUpperCase();
    if (!label || seen.has(key) || !HEX.test(color)) continue;
    seen.add(key);
    out.push({ label, color: color.toLowerCase() });
  }
  return out;
}

/** The keyword colour for `text`, or null. */
export function keywordColor(text: unknown, keywords: readonly ColorKeyword[] | undefined): string | null {
  const t = String(text ?? '').trim().toUpperCase();
  if (!t || !keywords?.length) return null;
  return keywords.find((k) => k.label.toUpperCase() === t)?.color ?? null;
}

/** The background colour for a chosen value, or null when nothing is chosen. */
export function resultFieldColor(
  field: FieldConfig,
  value: unknown,
  keywords?: readonly ColorKeyword[],
): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const option = field.options?.find((o) => String(o.value ?? o.label) === text);
  if (option?.color) return option.color;
  const byKeyword = keywordColor(option?.label ?? text, keywords) ?? keywordColor(text, keywords);
  if (byKeyword) return byKeyword;
  const tone = resultTone(option?.label ?? text);
  return tone ? TONE_COLOR[tone] : null;
}
