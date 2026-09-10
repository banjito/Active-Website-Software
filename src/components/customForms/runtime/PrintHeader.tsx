/**
 * Print header for custom forms.
 *
 * Matches the hard-coded reports: logo left, title centre, NETA section and
 * the pass/fail box right. Honours the template's `includePrintHeader` and
 * `includePassFail` settings, which until now were stored and ignored.
 */

import React from "react";
import type { CustomFormTemplate } from "@/lib/types/customForms";

export type CustomFormStatus = "PASS" | "FAIL" | "LIMITED SERVICE";

const AMP_LOGO_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png";

const STATUS_COLORS: Record<
  CustomFormStatus,
  { border: string; background: string; text: string; className: string }
> = {
  PASS: {
    border: "#16a34a",
    background: "#22c55e",
    text: "white",
    className: "pass",
  },
  FAIL: {
    border: "#dc2626",
    background: "#ef4444",
    text: "white",
    className: "fail",
  },
  "LIMITED SERVICE": {
    border: "#ca8a04",
    background: "#eab308",
    text: "#111827",
    className: "limited",
  },
};

/** Templates saved before the setting existed have no value; show the header. */
function isEnabled(value: boolean | undefined): boolean {
  return value !== false;
}

export const StatusBox: React.FC<{ status: CustomFormStatus }> = ({
  status,
}) => {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.PASS;
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
        borderRadius: "6px",
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
}> = ({ template, status }) => {
  const settings = template.structure.settings;
  if (!isEnabled(settings?.includePrintHeader)) return null;

  return (
    <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
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
          <div className="hidden print:block">
            <StatusBox status={status} />
          </div>
        )}
      </div>
    </div>
  );
};

/** The screen-side status toggle, cycling PASS to FAIL to LIMITED SERVICE. */
export function nextStatus(status: CustomFormStatus): CustomFormStatus {
  if (status === "PASS") return "FAIL";
  if (status === "FAIL") return "LIMITED SERVICE";
  return "PASS";
}

export const StatusToggleButton: React.FC<{
  status: CustomFormStatus;
  onChange: (next: CustomFormStatus) => void;
  disabled?: boolean;
}> = ({ status, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(nextStatus(status))}
    className={`px-4 py-2 text-sm font-medium rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
      status === "PASS"
        ? "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
        : status === "FAIL"
          ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
          : "bg-yellow-500 text-black hover:bg-yellow-600 focus:ring-yellow-400"
    }`}
  >
    {status}
  </button>
);
