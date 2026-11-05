/**
 * Builder setting: what a Job Details field starts with on a new report. A link
 * to the job overview, a typed value, or blank.
 */

import React from "react";
import { FieldType, type FieldConfig } from "@/lib/types/customForms";
import { canHaveJobFill, jobFillSetting, jobFillSourcesFor } from "@/lib/customForms/jobFill";

const box =
  "h-7 px-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const TYPED = "__typed";

export const JobFillControl: React.FC<{
  field: FieldConfig;
  onChange: (patch: Partial<FieldConfig>) => void;
}> = ({ field, onChange }) => {
  if (!canHaveJobFill(field)) return null;

  const setting = jobFillSetting(field);
  const sources = jobFillSourcesFor(field);
  const linked = sources.some((s) => s.id === setting.source);
  const typed = !linked && setting.value !== undefined;
  const groups = Array.from(new Set(sources.map((s) => s.group)));
  // `defaultValue` is cleared so an old default cannot show through on the form.
  const update = (jobFill: NonNullable<FieldConfig["jobFill"]>) =>
    onChange({ jobFill, defaultValue: undefined });

  return (
    <>
      <label
        className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400"
        title="Copied in once when a report is created. The technician can still change it on the report."
      >
        Starts with
        <select
          value={linked ? setting.source : typed ? TYPED : ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === TYPED) update({ value: "" });
            else update(next ? { source: next } : {});
          }}
          className={`${box} w-36`}
        >
          <option value="">Blank</option>
          <option value={TYPED}>Typed value</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {sources
                .filter((s) => s.group === group)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {typed && (
        <input
          type={field.type === FieldType.DATE ? "date" : "text"}
          value={setting.value ?? ""}
          onChange={(e) => update({ value: e.target.value })}
          placeholder="Default value"
          title="Value the field starts with on a new report"
          className={`${box} w-28`}
        />
      )}
    </>
  );
};

export default JobFillControl;
