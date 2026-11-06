import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { VOLTAGE_LEVELS, type VoltageColors } from "@/lib/diagrams/voltage";

interface VoltageColorsEditorProps {
  colors: VoltageColors;
  /** What Reset puts back: the default on a site, the built-in colors on the defaults page. */
  resetTo: VoltageColors;
  resetLabel: string;
  saving: boolean;
  onSave: (colors: VoltageColors) => void;
}

export default function VoltageColorsEditor({
  colors,
  resetTo,
  resetLabel,
  saving,
  onSave,
}: VoltageColorsEditorProps) {
  const [draft, setDraft] = useState(colors);
  useEffect(() => setDraft(colors), [colors]);

  const changed = VOLTAGE_LEVELS.some((level) => draft[level.key] !== colors[level.key]);

  return (
    <div>
      <ul className="space-y-2">
        {VOLTAGE_LEVELS.map((level) => (
          <li key={level.key} className="flex items-center gap-3">
            <input
              type="color"
              aria-label={`Color for ${level.label}`}
              className="h-8 w-12 cursor-pointer border border-neutral-300 bg-transparent p-0.5 dark:border-neutral-600"
              value={draft[level.key]}
              onChange={(event) => setDraft({ ...draft, [level.key]: event.target.value })}
            />
            <span className="text-sm">{level.label}</span>
            <span className="ml-auto text-xs uppercase text-neutral-500 dark:text-neutral-400">
              {draft[level.key]}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setDraft(resetTo)}>
          {resetLabel}
        </Button>
        <Button type="button" disabled={!changed || saving} onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}
