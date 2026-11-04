import React from "react";

/** A checklist column width, typed as a plain percentage. Blank = automatic. */
export const ChecklistWidthInput: React.FC<{
  value?: string;
  onChange: (next: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => (
  <div className="flex items-center gap-1">
    <input
      type="number"
      min={1}
      max={100}
      value={value?.endsWith("%") ? value.slice(0, -1) : ""}
      onChange={(e) => onChange(e.target.value ? `${e.target.value}%` : "")}
      placeholder="Auto"
      title="Column width as a percentage of the table. Blank = automatic."
      className={className}
    />
    <span className="pr-1 text-xs font-normal text-neutral-500 dark:text-neutral-400">%</span>
  </div>
);
