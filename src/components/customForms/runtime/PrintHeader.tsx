/**
 * Print header for custom forms.
 *
 * Matches the hard-coded reports: logo left, title centre, NETA section and
 * the pass/fail box right. Honours the template's `includePrintHeader` and
 * `includePassFail` settings, which until now were stored and ignored.
 */

import React from "react";
import type { CustomFormTemplate } from "@/lib/types/customForms";
import {
  DEFAULT_RESULT_OPTIONS,
  nextResult,
  resolveResultOptions,
  resultColor,
  resultTextColor,
  type ResultOption,
} from "@/lib/customForms/resultOptions";

/** PASS / FAIL / LIMITED SERVICE, or one of the template's own result choices. */
export type CustomFormStatus = string;

export const AMP_LOGO_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png";

const STATUS_CLASS: Record<string, string> = {
  PASS: "pass",
  FAIL: "fail",
  "LIMITED SERVICE": "limited",
};

/** Templates saved before the setting existed have no value; show the header. */
function isEnabled(value: boolean | undefined): boolean {
  return value !== false;
}

export const StatusBox: React.FC<{
  status: CustomFormStatus;
  options?: readonly ResultOption[];
}> = ({ status, options = DEFAULT_RESULT_OPTIONS }) => {
  const background = resultColor(status, options);
  const colors = {
    border: background,
    background,
    text: resultTextColor(background),
    className: STATUS_CLASS[status] ?? "custom",
  };
  return (
    <div
      className={`pass-fail-status-box ${colors.className}`}
      style={{
        display: "inline-block",
        padding: "4px 10px",
        fontSize: "12px",
        fontWeight: "bold",
        textAlign: "center",
        width: "fit-content",
        borderRadius: 0,
        border: `2px solid ${colors.border}`,
        backgroundColor: colors.background,
        color: colors.text,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact" as any,
        boxSizing: "border-box",
        minWidth: "50px",
      }}
    >
      {status}
    </div>
  );
};

export const CustomFormPrintHeader: React.FC<{
  template: CustomFormTemplate;
  status: CustomFormStatus;
  /** Render on screen (paper view) instead of only in print. */
  onScreen?: boolean;
}> = ({ template, status, onScreen = false }) => {
  const settings = template.structure.settings;
  if (!isEnabled(settings?.includePrintHeader)) return null;

  // No rule of its own: the first section's accent rule sits right below it,
  // and the two together printed as a heavy double line.
  return (
    <div
      className={`${onScreen ? "flex print:hidden" : "print:flex hidden"} items-center justify-between pb-2 mb-2`}
    >
      <div
        style={{ width: "120px", display: "flex", justifyContent: "flex-start" }}
      >
        <img
          src={AMP_LOGO_URL}
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 35, marginLeft: "5px", marginTop: "2px" }}
        />
      </div>
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-bold text-black mb-1">{template.name}</h1>
      </div>
      <div
        className="text-right font-extrabold text-xl flex flex-col items-end gap-0.5 print:gap-0.5"
        style={{ color: "#1a4e7c", width: "120px" }}
      >
        {template.netaSection && (
          <span className="text-base">NETA - {template.netaSection}</span>
        )}
        {isEnabled(settings?.includePassFail) && (
          <div className={onScreen ? "block" : "hidden print:block"}>
            <StatusBox status={status} options={resolveResultOptions(settings)} />
          </div>
        )}
      </div>
    </div>
  );
};

/** The screen-side status toggle, cycling through the template's choices. */
export function nextStatus(
  status: CustomFormStatus,
  options: readonly ResultOption[] = DEFAULT_RESULT_OPTIONS,
): CustomFormStatus {
  return nextResult(status, options);
}

export const StatusToggleButton: React.FC<{
  status: CustomFormStatus;
  onChange: (next: CustomFormStatus) => void;
  /** The template's result choices; defaults to PASS / FAIL / LIMITED SERVICE. */
  options?: readonly ResultOption[];
  disabled?: boolean;
  /**
   * Set when the template has pass/fail result columns: the status follows
   * them ("auto") until the user clicks; `onAuto` hands it back.
   */
  autoState?: { manual: boolean; onAuto: () => void };
}> = ({ status, onChange, options = DEFAULT_RESULT_OPTIONS, disabled, autoState }) => (
  <span className="inline-flex items-stretch">
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(nextStatus(status, options))}
    className="px-4 py-2 text-sm font-medium rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-400 hover:brightness-90 disabled:opacity-50"
    style={{
      backgroundColor: resultColor(status, options),
      color: resultTextColor(resultColor(status, options)),
    }}
    title={
      autoState && !autoState.manual
        ? "Set from the form's results. Click to choose by hand."
        : "Click to change"
    }
  >
    {status}
    {autoState && !autoState.manual && (
      <span className="ml-1.5 text-[10px] font-semibold opacity-80">AUTO</span>
    )}
  </button>
  {autoState?.manual && (
    <button
      type="button"
      onClick={autoState.onAuto}
      disabled={disabled}
      className="px-2 text-xs border border-l-0 border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-600 dark:text-neutral-300 hover:text-brand hover:border-brand"
      title="Let the form's pass/fail results set the status again"
    >
      Auto
    </button>
  )}
  </span>
);
