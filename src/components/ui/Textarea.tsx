import React, { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, error, hint, className = "", fullWidth = true, id, ...props },
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={`${fullWidth ? "w-full" : ""} mb-4`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-1.5 text-sm font-medium text-neutral-700 dark:text-white"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          className={`
            block w-full p-2.5
            bg-white dark:bg-dark-150 text-neutral-900 dark:text-white
            border ${error ? "border-red-500" : "border-neutral-300 dark:border-neutral-600"}
            rounded-md shadow-sm
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${error ? "focus:ring-red-500" : "focus:ring-orange-500 dark:focus:ring-orange-400"}
            disabled:bg-neutral-100 dark:disabled:bg-neutral-700
            disabled:text-neutral-500 dark:disabled:text-neutral-400
            disabled:cursor-not-allowed
            transition-colors
            resize-vertical
            ${className}
          `}
          {...props}
        />

        {(error || hint) && (
          <p
            className={`mt-1.5 text-sm ${error ? "text-red-500" : "text-neutral-500 dark:text-white"}`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

// Export as TextArea for backward compatibility
export const TextArea = Textarea;

export default Textarea;
