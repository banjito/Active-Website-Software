/**
 * Builder setting: make a table column an equipment search, and choose which
 * of the row's other columns the picked record fills.
 */

import React from "react";
import { Wrench } from "lucide-react";
import type { FieldConfig, SectionConfig } from "@/lib/types/customForms";
import {
  isEquipmentColumn,
  resolveEquipmentFill,
  type EquipmentFill,
} from "@/lib/customForms/equipment";

const box =
  "h-7 px-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const TARGETS: [keyof EquipmentFill, string][] = [
  ["serialNumber", "Serial"],
  ["ampId", "AMP ID"],
  ["calibrationDate", "Cal. date"],
  ["calibrationDue", "Cal. due"],
];

export const EquipmentPickerSettings: React.FC<{
  section: SectionConfig;
  columnId: string;
  field: FieldConfig;
  onChange: (field: FieldConfig) => void;
}> = ({ section, columnId, field, onChange }) => {
  const builtIn = section.componentType === "test-equipment" && columnId === "equipment";
  const on = isEquipmentColumn(section, columnId);
  const others = (section.columns ?? []).filter((c) => c.id !== columnId);
  const resolved = on ? resolveEquipmentFill(section, columnId) : null;
  const explicit = field.equipmentPicker?.fill ?? {};
  // Show the column each target lands in (explicit, or matched by name).
  const columnFor = (key: keyof EquipmentFill) =>
    explicit[key] ?? others.find((c) => c.field.id === resolved?.[key])?.id ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer"
        title="Technicians search the test equipment list; picking a record fills the row"
      >
        <input
          type="checkbox"
          checked={on}
          disabled={builtIn}
          onChange={(e) =>
            onChange({ ...field, equipmentPicker: e.target.checked ? field.equipmentPicker ?? {} : undefined })
          }
          className="rounded-none"
        />
        <Wrench className="w-3.5 h-3.5" />
        Equipment search
      </label>
      {on &&
        TARGETS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {label} →
            <select
              value={columnFor(key)}
              onChange={(e) =>
                onChange({
                  ...field,
                  equipmentPicker: {
                    ...field.equipmentPicker,
                    fill: { ...explicit, [key]: e.target.value || undefined },
                  },
                })
              }
              className={`${box} w-28`}
              title={`Column that receives the equipment's ${label.toLowerCase()}`}
            >
              <option value="">(none)</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.id}
                </option>
              ))}
            </select>
          </label>
        ))}
    </div>
  );
};

export default EquipmentPickerSettings;
