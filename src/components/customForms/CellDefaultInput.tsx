import React from "react";
import { FieldType, type FieldConfig } from "@/lib/types/customForms";

/** Field types a one-line starting value makes sense for. */
export function canHaveCellDefault(field: FieldConfig): boolean {
  const types: string[] = [
    FieldType.TEXT,
    FieldType.TEXTAREA,
    FieldType.NUMBER,
    FieldType.DATE,
    FieldType.SELECT,
    FieldType.RADIO,
  ];
  return types.includes(field.type);
}

/** Field types that can show a hint while empty. */
export function canHaveHint(field: FieldConfig): boolean {
  const types: string[] = [FieldType.TEXT, FieldType.TEXTAREA, FieldType.NUMBER, FieldType.SELECT];
  return types.includes(field.type);
}

export const HINT_TITLE = "Shown in the empty field to guide the technician. Does not print.";

const TITLE = "Starting value on a new form. The technician can still change it.";

/** The value one table cell starts with, entered the way the cell is filled in. */
export const CellDefaultInput: React.FC<{
  field: FieldConfig;
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  className?: string;
}> = ({ field, value, onChange, onFocus, className }) => {
  if (field.type === FieldType.SELECT || field.type === FieldType.RADIO) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        title={TITLE}
        className={className}
      >
        <option value="" className="dark:bg-dark-150">
          No default
        </option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value} className="dark:bg-dark-150">
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  const inputType =
    field.type === FieldType.NUMBER ? "number" : field.type === FieldType.DATE ? "date" : "text";
  return (
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder="Default"
      title={TITLE}
      className={className}
    />
  );
};
