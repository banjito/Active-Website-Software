import React from "react";
import { Link } from "react-router-dom";
import { ChevronDown, MessageCircle, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import { EvaluationResultBadge } from "@/components/reports/EvaluationResultBadge";
import { TableCell, TableRow } from "@/components/ui/Table";
import type { OutdatedForm } from "@/lib/customForms/formVersionStatus";
import type { EvaluationResult } from "@/lib/reportEvaluations";
import type { AssetReportStatus } from "@/lib/services/assetReportStatus";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<AssetReportStatus, string> = {
  "not started": "Not Started",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  sent: "Sent",
  issue: "Issue",
  archived: "Archived",
};

const STATUS_CLASSES: Record<AssetReportStatus, string> = {
  "not started":
    "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200",
  in_progress:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ready_for_review:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  issue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  archived:
    "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
};

const WORKING: AssetReportStatus[] = [
  "not started",
  "in_progress",
  "ready_for_review",
  "archived",
];

/** What a report can be set to, from the status it has now. */
const STATUS_OPTIONS: Record<AssetReportStatus, AssetReportStatus[]> = {
  "not started": ["not started", "in_progress", "archived"],
  in_progress: WORKING,
  ready_for_review: WORKING,
  approved: ["approved", "ready_for_review", "sent", "archived"],
  sent: ["sent", "approved", "archived"],
  issue: ["issue", "ready_for_review", "in_progress", "not started", "archived"],
  archived: [
    "archived",
    "not started",
    "in_progress",
    "ready_for_review",
    "approved",
  ],
};

interface ReportStatusSelectProps {
  /** Older rows have none; they read as Not Started. */
  status?: AssetReportStatus | null;
  onChange: (next: AssetReportStatus) => void;
  /** A chip with a finger-sized tap area, for the phone and iPad rows. */
  touch?: boolean;
}

/** The status picker on a report row, shared by the table and the phone rows. */
export function ReportStatusSelect({
  status,
  onChange,
  touch = false,
}: ReportStatusSelectProps) {
  const current = status || "not started";
  const options = (status && STATUS_OPTIONS[status]) || WORKING;
  const colors = STATUS_CLASSES[current] ?? STATUS_CLASSES.in_progress;

  const select = (className: string) => (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value as AssetReportStatus)}
      aria-label="Report status"
      className={className}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );

  if (!touch) {
    return select(
      `px-2 py-1 rounded-none text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-brand ${colors}`,
    );
  }

  // The picker sits invisibly over the chip. Its text is 16px because iPhones
  // zoom the page when a smaller field is tapped.
  return (
    <span className="relative inline-flex h-11 shrink-0 items-center">
      {select(
        "peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none text-base opacity-0",
      )}
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-none px-2 py-1 text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
          colors,
        )}
      >
        {current === "ready_for_review"
          ? "Review"
          : (STATUS_LABELS[current] ?? current)}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </span>
    </span>
  );
}

const badgeClass =
  "inline-flex items-center whitespace-nowrap rounded-none px-1.5 py-0.5 text-xs font-semibold";

interface MobileReportRowProps {
  assetId: string;
  /** How many folders deep the row sits */
  depth: number;
  identifier: string;
  reportType: string;
  status?: AssetReportStatus | null;
  critical: boolean;
  result?: EvaluationResult | null;
  /** The one date that matters for the status it has now */
  dateLabel: string;
  date: string;
  actionItems: number;
  flaggedFields: number;
  outdatedForm?: OutdatedForm;
  /** Opens a page in the app */
  to?: string | null;
  /** Opens an uploaded file in a new tab */
  href?: string;
  /** Checkboxes only show once something is selected */
  selecting: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onStatusChange: (next: AssetReportStatus) => void;
  onMenu: (point: { x: number; y: number }) => void;
  onViewComments?: () => void;
  onClickCapture: React.MouseEventHandler;
  onContextMenu: React.MouseEventHandler;
}

/** One report on a phone or upright iPad: equipment first, tap anywhere to open. */
export function MobileReportRow({
  assetId,
  depth,
  identifier,
  reportType,
  status,
  critical,
  result,
  dateLabel,
  date,
  actionItems,
  flaggedFields,
  outdatedForm,
  to,
  href,
  selecting,
  selected,
  onToggleSelected,
  onStatusChange,
  onMenu,
  onViewComments,
  onClickCapture,
  onContextMenu,
}: MobileReportRowProps) {
  const title = identifier || reportType;

  const body = (
    <>
      <span className="block break-words text-base font-semibold text-neutral-900 dark:text-white">
        {title}
      </span>
      {identifier && (
        <span className="block break-words text-sm text-neutral-600 dark:text-neutral-300">
          {reportType}
        </span>
      )}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {critical && (
          <span
            className={cn(
              badgeClass,
              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
            )}
          >
            Critical
          </span>
        )}
        <EvaluationResultBadge result={result} />
        {actionItems > 0 && (
          <span className={cn(badgeClass, "bg-brand/10 text-brand")}>
            {actionItems} action{actionItems === 1 ? "" : "s"}
          </span>
        )}
        {flaggedFields > 0 && (
          <span
            className={cn(
              badgeClass,
              "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
            )}
          >
            {flaggedFields} field{flaggedFields === 1 ? "" : "s"} flagged
          </span>
        )}
        {outdatedForm?.locked && (
          <span
            className={cn(
              badgeClass,
              "bg-neutral-100 font-normal text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
            )}
          >
            Newer form exists
          </span>
        )}
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {dateLabel} {format(new Date(date), "MMM d, yyyy")}
        </span>
      </span>
    </>
  );

  const openClass =
    "block px-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";
  const updateForm = outdatedForm && !outdatedForm.locked ? outdatedForm : null;

  return (
    <TableRow
      data-report-row={assetId}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      className={cn(
        "border-neutral-100 dark:border-neutral-800",
        selected && "bg-brand/5 dark:bg-brand/10",
      )}
    >
      <TableCell
        style={{ padding: `0 0 0 ${depth}rem` }}
        className={
          depth > 0
            ? "border-l-2 border-l-neutral-100 dark:border-l-neutral-800"
            : undefined
        }
      >
        <div className="flex items-center">
          {selecting && (
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                aria-label={`Select ${title}`}
              />
            </label>
          )}
          <div className="min-w-0 flex-1">
            {to ? (
              <Link to={to} className={openClass}>
                {body}
              </Link>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={openClass}
              >
                {body}
              </a>
            )}
            {/* Outside the row's link: a link can't hold another link or button */}
            {(updateForm || onViewComments) && (
              <div className="flex flex-wrap gap-2 px-3 pb-3">
                {onViewComments && (
                  <button
                    type="button"
                    onClick={onViewComments}
                    className="inline-flex h-11 items-center gap-2 rounded-none border border-neutral-300 px-3 text-sm font-medium text-neutral-800 dark:border-neutral-600 dark:text-neutral-100"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Issue comments
                  </button>
                )}
                {updateForm && (
                  <Link
                    to={updateForm.comparePath}
                    className="inline-flex h-11 items-center rounded-none border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                  >
                    Newer form v{updateForm.latest}
                  </Link>
                )}
              </div>
            )}
          </div>
          <ReportStatusSelect touch status={status} onChange={onStatusChange} />
          <button
            type="button"
            aria-label={`More options for ${title}`}
            aria-haspopup="menu"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              onMenu({ x: box.left, y: box.bottom });
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-neutral-400"
          >
            <MoreVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
