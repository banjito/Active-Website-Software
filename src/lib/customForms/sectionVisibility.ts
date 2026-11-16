/**
 * Whole-section visibility ("Show this table when...").
 *
 * A section can be shown only when another field on the form holds one of a
 * set of values (Battery Type = VLA), and/or only when its own "Include"
 * switch is on (an optional NETA test the customer may not be paying for).
 *
 * A hidden section keeps its data, so switching back restores it. Hidden
 * sections never print and never count toward the report's pass/fail.
 *
 * Templates without `showWhen` are untouched, so issued reports are unchanged.
 */

import {
  FieldType,
  type SectionConfig,
  type SectionShowWhen,
} from "@/lib/types/customForms";
import { defaultSettingValue } from "./runtime/visibility";

/** formData[section.id][INCLUDE_KEY] holds the Include switch: "yes" / "no". */
export const INCLUDE_KEY = "__include";

export interface ControllerChoice {
  sectionId: string;
  fieldId: string;
  /** "Nameplate › Battery Type" */
  label: string;
  options: { value: string; label: string }[];
}

const CHECKBOX_OPTIONS = [
  { value: "checked", label: "Checked" },
  { value: "unchecked", label: "Unchecked" },
];

/** Fields on other sections that can turn a section on or off. */
export function controllerChoices(
  sections: readonly SectionConfig[],
  excludeSectionId?: string,
): ControllerChoice[] {
  const out: ControllerChoice[] = [];
  for (const section of sections) {
    if (section.id === excludeSectionId) continue;
    const fields = [...(section.fields ?? []), ...(section.field ? [section.field] : [])];
    for (const field of fields) {
      const options =
        field.type === FieldType.CHECKBOX
          ? CHECKBOX_OPTIONS
          : field.type === FieldType.SELECT || field.type === FieldType.RADIO
            ? (field.options ?? [])
            : null;
      if (!options?.length) continue;
      out.push({
        sectionId: section.id,
        fieldId: field.id,
        label: `${section.title} › ${field.label}`,
        options,
      });
    }
    for (const setting of section.settingFields ?? []) {
      if (!setting.options.length) continue;
      out.push({
        sectionId: section.id,
        fieldId: setting.id,
        label: `${section.title} › ${setting.label}`,
        options: setting.options,
      });
    }
  }
  return out;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

/** The controller's current value, with the field's default for an untouched field. */
function readController(
  sections: readonly SectionConfig[],
  formData: Record<string, any>,
  sectionId: string,
  fieldId: string,
): string | null {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const stored = formData[sectionId]?.[fieldId];

  const setting = section.settingFields?.find((s) => s.id === fieldId);
  if (setting) return isBlank(stored) ? defaultSettingValue(setting) : String(stored);

  const field = [...(section.fields ?? []), ...(section.field ? [section.field] : [])].find(
    (f) => f.id === fieldId,
  );
  if (!field) return null;
  if (field.type === FieldType.CHECKBOX) {
    const raw = isBlank(stored) ? field.defaultValue : stored;
    const on = raw === true || ["true", "yes", "on", "checked", "1"].includes(String(raw).toLowerCase());
    return on ? "checked" : "unchecked";
  }
  const raw = isBlank(stored) ? field.defaultValue : stored;
  return isBlank(raw) ? "" : String(raw);
}

/** The Include switch's current state. True when the section has no switch. */
export function isSectionIncluded(
  section: SectionConfig,
  formData: Record<string, any>,
): boolean {
  const toggle = section.showWhen?.toggle;
  if (!toggle) return true;
  const stored = formData[section.id]?.[INCLUDE_KEY];
  if (stored === "yes") return true;
  if (stored === "no") return false;
  return toggle.defaultOn !== false;
}

/** True when the controlling field allows this section. A missing controller allows it. */
export function controllerAllows(
  section: SectionConfig,
  sections: readonly SectionConfig[],
  formData: Record<string, any>,
): boolean {
  const rule = section.showWhen?.field;
  if (!rule || !rule.values.length) return true;
  const value = readController(sections, formData, rule.sectionId, rule.fieldId);
  // The controlling field was deleted: show the section rather than lose it.
  if (value === null) return true;
  return rule.values.includes(value);
}

export function isSectionShown(
  section: SectionConfig,
  sections: readonly SectionConfig[],
  formData: Record<string, any>,
): boolean {
  if (!section.showWhen) return true;
  return controllerAllows(section, sections, formData) && isSectionIncluded(section, formData);
}

/** "Shown when Nameplate › Battery Type is Flooded or VLA", or null. */
export function describeShowWhen(
  showWhen: SectionShowWhen | undefined,
  sections: readonly SectionConfig[],
): string | null {
  const rule = showWhen?.field;
  if (!rule || !rule.values.length) return null;
  const choice = controllerChoices(sections).find(
    (c) => c.sectionId === rule.sectionId && c.fieldId === rule.fieldId,
  );
  if (!choice) return "Controlling field was removed — always shown";
  const labels = rule.values.map(
    (v) => choice.options.find((o) => o.value === v)?.label ?? v,
  );
  return `Shown when ${choice.label} is ${labels.join(" or ")}`;
}
