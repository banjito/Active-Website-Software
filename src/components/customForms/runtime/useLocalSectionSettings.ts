/**
 * Local settings state for the builder modes.
 *
 * The filler and the preview page store conditional-table settings in form
 * data. The builder has no form data, but its dropdowns still have to work so
 * a designer can check which rows appear. This keeps them in component state
 * behind the same getter/setter the runtime expects.
 */

import { useCallback, useState } from "react";
import type { SectionConfig } from "@/lib/types/customForms";

export function useLocalSectionSettings() {
  const [values, setValues] = useState<Record<string, string>>({});

  const getSettingValue = useCallback(
    (section: SectionConfig, settingId: string) =>
      values[`${section.id}:${settingId}`],
    [values],
  );

  const setSettingValue = useCallback(
    (section: SectionConfig, settingId: string, value: string) =>
      setValues((prev) => ({ ...prev, [`${section.id}:${settingId}`]: value })),
    [],
  );

  /**
   * The same settings shaped the way conditions read them: section id to
   * setting id to value. Lets the builder exercise conditional rows without a
   * filled-in form.
   */
  const conditionValues = useCallback(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(values)) {
      const separator = key.indexOf(":");
      if (separator < 0) continue;
      const sectionId = key.slice(0, separator);
      const settingId = key.slice(separator + 1);
      out[sectionId] = { ...(out[sectionId] ?? {}), [settingId]: value };
    }
    return out;
  }, [values]);

  return { getSettingValue, setSettingValue, conditionValues };
}
