import React, { useState } from "react";

interface EstimateNumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "type" | "inputMode"
  > {
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
}

function numericValue(value: EstimateNumberInputProps["value"]): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export default function EstimateNumberInput({
  value,
  onValueChange,
  onChange,
  onFocus,
  onBlur,
  ...props
}: EstimateNumberInputProps) {
  // Keep the literal draft through numeric parent updates until focus leaves.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft ?? String(numericValue(value))}
      onFocus={(event) => {
        setDraft(event.currentTarget.value);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        setDraft(raw);
        onValueChange(numericValue(raw));
        onChange?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
