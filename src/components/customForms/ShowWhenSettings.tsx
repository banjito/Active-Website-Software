/**
 * Builder panel: "Show this section only when..." and the optional Include
 * switch. See lib/customForms/sectionVisibility.ts.
 */

import React from "react";
import type { SectionConfig, SectionShowWhen } from "@/lib/types/customForms";
import { controllerChoices } from "@/lib/customForms/sectionVisibility";

interface Props {
  section: SectionConfig;
  allSections: SectionConfig[];
  onUpdate: (updates: Partial<SectionConfig>) => void;
}

/** Drop empty parts so a section with no rule carries no `showWhen` at all. */
function tidy(next: SectionShowWhen): SectionShowWhen | undefined {
  const out: SectionShowWhen = {};
  if (next.field) out.field = next.field;
  if (next.toggle) out.toggle = next.toggle;
  return out.field || out.toggle ? out : undefined;
}

export const ShowWhenSettings: React.FC<Props> = ({ section, allSections, onUpdate }) => {
  const choices = React.useMemo(
    () => controllerChoices(allSections, section.id),
    [allSections, section.id],
  );
  const showWhen = section.showWhen ?? {};
  const rule = showWhen.field;
  const key = rule ? `${rule.sectionId}::${rule.fieldId}` : "";
  const choice = choices.find((c) => `${c.sectionId}::${c.fieldId}` === key);

  const update = (next: SectionShowWhen) => onUpdate({ showWhen: tidy(next) });

  return (
    <div className="space-y-2 border border-neutral-200 dark:border-neutral-700 rounded-none p-2">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        Show this section
      </div>

      <div>
        <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
          Only when this field…
        </label>
        <select
          value={key}
          onChange={(e) => {
            const picked = choices.find((c) => `${c.sectionId}::${c.fieldId}` === e.target.value);
            update({
              ...showWhen,
              field: picked
                ? { sectionId: picked.sectionId, fieldId: picked.fieldId, values: [] }
                : undefined,
            });
          }}
          className="form-input w-full text-xs rounded-none"
        >
          <option value="">Always (no field rule)</option>
          {choices.map((c) => (
            <option key={`${c.sectionId}::${c.fieldId}`} value={`${c.sectionId}::${c.fieldId}`}>
              {c.label}
            </option>
          ))}
          {rule && !choice && <option value={key}>(removed field)</option>}
        </select>
        {choices.length === 0 && (
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Add a dropdown, radio or checkbox field to another section first.
          </p>
        )}
      </div>

      {rule && choice && (
        <div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">…is one of:</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {choice.options.map((o) => (
              <label key={o.value} className="inline-flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  className="rounded-none"
                  checked={rule.values.includes(o.value)}
                  onChange={(e) =>
                    update({
                      ...showWhen,
                      field: {
                        ...rule,
                        values: e.target.checked
                          ? [...rule.values, o.value]
                          : rule.values.filter((v) => v !== o.value),
                      },
                    })
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
          {rule.values.length === 0 && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
              Tick at least one value, or the rule is ignored.
            </p>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          className="rounded-none"
          checked={!!showWhen.toggle}
          onChange={(e) =>
            update({ ...showWhen, toggle: e.target.checked ? { defaultOn: false } : undefined })
          }
        />
        Include switch (optional test the tech turns on/off)
      </label>
      {showWhen.toggle && (
        <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 pl-5">
          <input
            type="checkbox"
            className="rounded-none"
            checked={showWhen.toggle.defaultOn !== false}
            onChange={(e) => update({ ...showWhen, toggle: { defaultOn: e.target.checked } })}
          />
          Included by default on new reports
        </label>
      )}
    </div>
  );
};
