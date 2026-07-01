import React from "react";

interface SwitchProps extends React.HTMLAttributes<HTMLDivElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** When provided, used as the background class when checked (e.g. "bg-[#f26722]" for AMP orange). */
  checkedClassName?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
  checkedClassName = "bg-blue-600",
  ...props
}) => {
  return (
    <div
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-none transition-colors
        ${checked ? checkedClassName : "bg-neutral-200 dark:bg-dark-150"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}`}
      onClick={() => !disabled && onCheckedChange(!checked)}
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      {...props}
    >
      <span
        className={`${
          checked ? "translate-x-6" : "translate-x-1"
        } inline-block h-4 w-4 transform rounded-none bg-white transition-transform`}
      />
    </div>
  );
};
