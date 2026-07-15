import React, { useState } from "react";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Check, LogOut, Printer, Save, SquarePen } from "lucide-react";

export type StatusVariant = "PASS" | "FAIL" | "LIMITED_SERVICE";

interface ReportHeaderProps {
  /** Report title shown on the left */
  title: string;
  /** Passed to AutoSaveIndicator */
  isAutoSaving: boolean;
  /** Whether the report is in edit mode */
  isEditing: boolean;
  /** Whether a manual save just completed (shows green "Saved") */
  justSaved: boolean;
  /** Whether a manual save is in progress (shows spinner) */
  isSaving: boolean;
  /** Current report status */
  status: string;
  /** Whether this is an existing report */
  hasReport: boolean;
  /** Called when the status toggle is clicked */
  onStatusToggle: () => void;
  /** Called when Save is clicked */
  onSave: () => void;
  /** Called when Save & Close is clicked */
  onSaveAndClose?: () => void;
  /** Called when Edit is clicked */
  onEdit: () => void;
  /** Called when Print is clicked */
  onPrint?: () => void;
  /** Hidden when in print mode */
  isPrintMode?: boolean;
  /** Show a loading spinner instead of buttons while data loads */
  loading?: boolean;
  /** Called when the back button is clicked. If not provided, no back button is shown. */
  onBack?: () => void;
  /** Label for the back button. Defaults to "Back to Job". */
  backLabel?: string;
}

const STATUS_STYLES: Record<string, string> = {
  PASS: "bg-green-600 text-white focus:ring-green-500 hover:bg-green-700",
  FAIL: "bg-red-600 text-white focus:ring-red-500 hover:bg-red-700",
  "LIMITED SERVICE":
    "bg-yellow-500 text-black focus:ring-yellow-400 hover:bg-yellow-600",
};

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  title,
  isAutoSaving,
  isEditing,
  justSaved,
  isSaving,
  status,
  hasReport,
  onStatusToggle,
  onSave,
  onSaveAndClose,
  onEdit,
  onPrint,
  onBack,
  backLabel = "Back",
  isPrintMode = false,
  loading = false,
}) => {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const showTooltip = (text: string) => (e: React.MouseEvent) =>
    setTooltip({ text, x: e.clientX, y: e.clientY });
  const moveTooltip = (e: React.MouseEvent) =>
    setTooltip((prev) =>
      prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
    );
  const hideTooltip = () => setTooltip(null);

  return (
    <div
      className={`${isPrintMode ? "hidden" : ""} print:hidden flex justify-between items-center mb-6`}
    >
      <div className="flex items-center gap-4">
        {onBack && !isEditing && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 dark:text-white dark:hover:text-neutral-200"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {backLabel}
          </button>
        )}
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          {title}
        </h1>
      </div>
      <div className="flex gap-2 items-center">
        {loading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            <AutoSaveIndicator isSaving={isAutoSaving} />

            {/* Status Toggle */}
            <div
              onMouseEnter={showTooltip(status)}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              <button
                onClick={onStatusToggle}
                disabled={!isEditing}
                className={`px-4 py-2 text-sm font-medium rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  STATUS_STYLES[status] || STATUS_STYLES.PASS
                } ${!isEditing ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {status}
              </button>
            </div>

            {/* Edit / Print buttons (view mode) */}
            {hasReport && !isEditing ? (
              <>
                <div
                  onMouseEnter={showTooltip("Edit")}
                  onMouseMove={moveTooltip}
                  onMouseLeave={hideTooltip}
                >
                  <button
                    onClick={onEdit}
                    className="px-2 py-2 text-sm rounded-none text-white bg-blue-600 border border-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    title="Edit Report"
                  >
                    <SquarePen className="w-6 h-6" />
                  </button>
                </div>
                <div
                  onMouseEnter={showTooltip("Print")}
                  onMouseMove={moveTooltip}
                  onMouseLeave={hideTooltip}
                >
                  <button
                    onClick={onPrint || (() => window.print())}
                    className="px-2 py-2 text-sm rounded-none text-white bg-neutral-600 border border-neutral-600 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500"
                    title="Print Report"
                  >
                    <Printer className="w-6 h-6" />
                  </button>
                </div>
              </>
            ) : (
              /* Save buttons (edit mode or new report) */
              <>
                <div
                  className="relative"
                  onMouseEnter={showTooltip(justSaved ? "Saved" : "Save")}
                  onMouseMove={moveTooltip}
                  onMouseLeave={hideTooltip}
                >
                  <button
                    onClick={onSave}
                    disabled={!isEditing || isSaving}
                    className={`flex h-10 w-10 items-center justify-center rounded-none text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      justSaved
                        ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                        : `bg-brand hover:bg-brand/90 focus:ring-brand ${!isEditing ? "hidden" : ""}`
                    }`}
                    aria-label={justSaved ? "Saved" : "Save"}
                    title={justSaved ? "Saved" : "Save"}
                  >
                    {isSaving ? (
                      <LoadingSpinner
                        className="h-5 w-5"
                        size="xs"
                        variant="light"
                      />
                    ) : justSaved ? (
                      <Check className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <Save className="h-6 w-6" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {hasReport && (
                  <div
                    onMouseEnter={showTooltip("Save & Close")}
                    onMouseMove={moveTooltip}
                    onMouseLeave={hideTooltip}
                  >
                    <button
                      onClick={
                        onSaveAndClose ||
                        (() => {
                          onSave();
                          setTimeout(() => window.location.reload(), 500);
                        })
                      }
                      disabled={!isEditing || isSaving}
                      className="px-2 py-2 text-sm rounded-none text-white bg-brand border border-brand hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Save & Close"
                    >
                      <LogOut className="w-6 h-6" />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {tooltip && (
        <span
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded-none bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
          style={{
            left: tooltip.x,
            top: tooltip.y + 14,
            transform: "translateX(-100%)",
          }}
        >
          {tooltip.text}
        </span>
      )}
    </div>
  );
};

export default ReportHeader;
