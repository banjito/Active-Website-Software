import React from "react";
import { Pipette } from "lucide-react";

export const JOB_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

type Props = {
  value: string;
  onChange: (color: string) => void;
};

/** Square color swatches for a job, plus an eyedropper square for a custom color. */
export const JobColorSwatches: React.FC<Props> = ({ value, onChange }) => {
  const current = (value || "").toLowerCase();
  const isCustom = !!current && !JOB_COLOR_PRESETS.includes(current);
  const border = (selected: boolean) =>
    selected
      ? "border-neutral-900 dark:border-white"
      : "border-neutral-300 dark:border-neutral-600";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {JOB_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-none border-2 ${border(current === color)}`}
          style={{ backgroundColor: color }}
          title={color}
          aria-label={`Color ${color}`}
        />
      ))}
      {/* Eyedropper, same height as the swatches. Once a custom color is
          picked, the icon takes that color. */}
      <label
        className={`relative w-7 h-7 cursor-pointer flex items-center justify-center ${
          isCustom
            ? ""
            : "text-neutral-600 dark:text-neutral-300 hover:text-brand"
        }`}
        style={isCustom ? { color: value } : undefined}
        title={isCustom ? `Custom color ${value}` : "Pick a custom color"}
      >
        <Pipette className="w-7 h-7 pointer-events-none" />
        <input
          type="color"
          value={value || "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Pick a custom color"
        />
      </label>
    </div>
  );
};

export default JobColorSwatches;
