import React, { useId } from "react";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface SuggestInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Values already used elsewhere — offered as suggestions, never enforced. */
  suggestions?: string[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  autoFocus?: boolean;
}

/**
 * A free-text field that offers what has already been used.
 *
 * Consistency is most of the point of the asset registry — "Sub 3" and "Substation 3"
 * should not become two different substations — but techs must still be able to type
 * anything, so this suggests rather than restricts. Built on a native <datalist> so
 * keyboard and mobile behaviour come for free.
 */
export function SuggestInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  required,
  hint,
  autoFocus,
}: SuggestInputProps) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;

  return (
    <div>
      <Label htmlFor={inputId}>
        {label}
        {required && <span className="ml-1 text-brand">*</span>}
      </Label>
      <Input
        id={inputId}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {hint && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      )}
    </div>
  );
}

export default SuggestInput;
