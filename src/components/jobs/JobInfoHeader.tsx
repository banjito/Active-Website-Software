import React, { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  Building,
  CheckCircle,
  ChevronDown,
  Clock,
  User,
} from "lucide-react";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import { useDemoMode } from "@/lib/DemoModeContext";
import { formatDivisionDisplay } from "@/lib/utils/divisionDisplay";
import ProjectManagerPicker from "./ProjectManagerPicker";

interface JobInfoHeaderJob {
  status: string;
  priority: string;
  fireteam_lead?: string | null;
  project_manager_id?: string | null;
  job_number: string | null;
  description: string;
  start_date: string | null;
  due_date: string | null;
  division?: string | null;
  site_address?: string | null;
  end_user?: string | null;
  estimated_man_hours?: number | null;
  progress_billing_status?: string | null;
  notes?: string | null;
  customers: {
    id: string;
    name: string;
    company_name?: string | null;
    address?: string | null;
  };
}

interface JobInfoHeaderOpportunity {
  id: string;
  quote_number: string;
  total_man_hours?: number | string | null;
  opportunity_type?: string | null;
}

interface JobInfoHeaderContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

interface JobInfoHeaderProps {
  /** "mobile": the short block at the top of the job page on phone + iPad. */
  variant?: "card" | "mobile";
  /** Job title, only shown by the mobile block. */
  title?: string;
  job: JobInfoHeaderJob;
  opportunity: JobInfoHeaderOpportunity | null;
  contacts: JobInfoHeaderContact[];
  customerPath: string;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onFireteamLeadClick: () => void;
  /** The open user-search popover; rendered under the Lead dropdown. */
  fireteamLeadPicker?: React.ReactNode;
  /** Saves the job's PM. Null clears it. */
  onProjectManagerChange: (id: string | null, name: string | null) => void | Promise<void>;
  /** Saves the new status. Resolves true on success so the editor can close. */
  onSaveProgressBillingStatus: (status: string | null) => Promise<boolean>;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "ready_to_bill", label: "Ready to Bill" },
  { value: "progress_billing", label: "Progress Billing" },
  { value: "billed", label: "Billed" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  ready_to_bill: "bg-purple-500",
  progress_billing: "bg-orange-500",
  billed: "bg-indigo-500",
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PROGRESS_BILLING_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
];

const chipBaseClass =
  "relative inline-flex items-center gap-1.5 px-2.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 hover:bg-neutral-50 dark:hover:bg-dark-100 rounded-none text-sm font-medium text-neutral-900 dark:text-white cursor-pointer";
const chipClass = `${chipBaseClass} h-8`;
/** Same chip, tall enough for a thumb. */
const touchChipClass = `${chipBaseClass} h-11`;

/** Label over value, three across, in the mobile block. */
const tileClass =
  "relative flex min-h-[60px] w-full min-w-0 flex-col justify-center gap-0.5 rounded-none border border-neutral-200 bg-neutral-50 px-3 py-2 text-left dark:border-dark-300 dark:bg-dark-200";
const tileLabelClass =
  "text-xs font-medium text-neutral-600 dark:text-neutral-300";
const tileValueClass =
  "w-full truncate text-[15px] font-semibold text-neutral-900 dark:text-white";

const chipLabelClass =
  "text-xs font-normal text-neutral-500 dark:text-neutral-400";

// Addresses are stored comma-joined with no spaces ("Suite 750,Atlanta,Georgia").
const tidyAddress = (address?: string | null) =>
  address
    ? address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ")
    : "";

const formatDate = (value: string | null) =>
  value ? format(new Date(value), "MMM d, yyyy") : null;

const NotSet = ({ text = "Not set" }: { text?: string }) => (
  <span className="text-neutral-400 dark:text-neutral-500">{text}</span>
);

const TmBadge = () => (
  <span className="ml-1.5 px-1.5 py-0.5 rounded-none bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 font-semibold text-xs">
    T&M
  </span>
);

/**
 * A chip that opens a native dropdown. The select is invisible and covers the
 * whole chip, so a click anywhere on it opens the list.
 */
const HeaderSelect = ({
  label,
  icon,
  value,
  options,
  onChange,
  className = chipClass,
  hideLabel = false,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  hideLabel?: boolean;
}) => (
  <label className={`${className} focus-within:ring-2 focus-within:ring-brand`}>
    {!hideLabel && <span className={chipLabelClass}>{label}</span>}
    {icon}
    <span className="capitalize">
      {options.find((o) => o.value === value)?.label ||
        value.replace(/_/g, " ")}
    </span>
    <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </label>
);

/**
 * One label/value cell. Layout (centering, column count, the phone list
 * layout) lives in index.css under `.job-info-*` because it follows the
 * block's own width via container queries.
 */
const Cell = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="job-info-cell border-r border-b border-black/10 dark:border-dark-300 px-2.5 py-2 text-sm text-neutral-900 dark:text-white">
    <div className="job-info-label text-xs font-bold">{label}:</div>
    <div className="min-w-0">{children}</div>
  </div>
);

/**
 * Job + customer facts in one bordered table, laid out like the Job
 * Information table on test reports (see reports/common/JobInfoPrintTable).
 * Status, priority and fireteam lead sit as dropdowns beside the title.
 */
export default function JobInfoHeader({
  variant = "card",
  title,
  job,
  opportunity,
  contacts,
  customerPath,
  onStatusChange,
  onPriorityChange,
  onFireteamLeadClick,
  fireteamLeadPicker,
  onProjectManagerChange,
  onSaveProgressBillingStatus,
}: JobInfoHeaderProps) {
  const navigate = useNavigate();
  const { isDemoMode, maskCustomerName, maskCustomerAddress } = useDemoMode();

  const [isBillingEditing, setIsBillingEditing] = useState(false);
  const [billingDraft, setBillingDraft] = useState("");
  const [isBillingSaving, setIsBillingSaving] = useState(false);

  // Mobile block only: the full list of facts starts folded.
  const [showDetails, setShowDetails] = useState(false);

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDescriptionClamped, setIsDescriptionClamped] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const description = job.description && !isDemoMode ? job.description : "";

  // Only offer "Show more" when the 2-line clamp is actually cutting text off.
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el || isDescriptionExpanded) return;
    const measure = () =>
      setIsDescriptionClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [description, isDescriptionExpanded, showDetails]);

  const customerName = maskCustomerName(
    job.customers.company_name || job.customers.name,
  );
  const customerAddress = maskCustomerAddress(
    tidyAddress(job.customers.address),
  );
  const siteAddress = maskCustomerAddress(tidyAddress(job.site_address));
  const endUser = job.end_user ? maskCustomerName(job.end_user) : "";

  const manHours = (() => {
    const fromJob =
      job.estimated_man_hours != null ? Number(job.estimated_man_hours) : null;
    const fromOpp =
      opportunity?.total_man_hours != null
        ? Number(opportunity.total_man_hours)
        : null;
    const val = fromJob ?? fromOpp;
    return val != null && !Number.isNaN(val) ? String(val) : null;
  })();

  const isTmFromNotes =
    !opportunity && !!job.notes && /T&M|time.*material/i.test(job.notes);

  const primaryContact = contacts.find((c) => c.is_primary);
  const primaryContactText = primaryContact
    ? [
        `${primaryContact.first_name} ${primaryContact.last_name}`.trim(),
        primaryContact.email,
        primaryContact.phone,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const startDate = formatDate(job.start_date);
  const dueDate = formatDate(job.due_date);

  const startBillingEdit = () => {
    setBillingDraft(job.progress_billing_status || "");
    setIsBillingEditing(true);
  };

  const saveBilling = async () => {
    setIsBillingSaving(true);
    const ok = await onSaveProgressBillingStatus(billingDraft || null);
    setIsBillingSaving(false);
    if (ok) setIsBillingEditing(false);
  };

  // Clips the cells' outer borders (see .job-info-grid in index.css).
  const details = (
    <div className="job-info-block overflow-hidden">
      {/* All 10 cells always render so 5, 2 or 1 columns fill evenly. */}
      <div className="job-info-grid border-t border-black/10 dark:border-dark-300">
        <Cell label="Customer">
          <Link
            to={customerPath}
            title={customerName}
            className="line-clamp-2 font-semibold hover:text-brand hover:underline"
          >
            {customerName}
          </Link>
        </Cell>
        <Cell label="Job #">
          <span className="font-mono">{job.job_number || "Pending"}</span>
        </Cell>
        <Cell label="Division">
          {job.division ? formatDivisionDisplay(job.division) : <NotSet />}
        </Cell>
        <Cell label="Start Date">{startDate || <NotSet />}</Cell>
        <Cell label="Opportunity">
          {opportunity ? (
            <>
              <a
                href={`/opportunities/${opportunity.id}`}
                className="text-brand hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(
                    `/sales-dashboard/opportunities/${opportunity.id}`,
                  );
                }}
              >
                {opportunity.quote_number || `Opportunity #${opportunity.id}`}
              </a>
              {opportunity.opportunity_type === "time_materials" && (
                <TmBadge />
              )}
            </>
          ) : (
            <>
              <NotSet />
              {isTmFromNotes && <TmBadge />}
            </>
          )}
        </Cell>
        <Cell label="Customer Address">
          {customerAddress ? (
            <span className="line-clamp-2" title={customerAddress}>
              {customerAddress}
            </span>
          ) : (
            <NotSet />
          )}
        </Cell>
        <Cell label="Job Site">
          {siteAddress ? (
            <span className="line-clamp-2" title={siteAddress}>
              {siteAddress}
            </span>
          ) : (
            <NotSet />
          )}
        </Cell>
        <Cell label="User">
          {endUser ? (
            <span className="line-clamp-2" title={endUser}>
              {endUser}
            </span>
          ) : (
            <NotSet />
          )}
        </Cell>
        <Cell label="Due Date">{dueDate || <NotSet />}</Cell>
        <Cell label="Est. Man Hours">{manHours || <NotSet />}</Cell>
      </div>

      <div
        className={`job-info-foot ${
          isBillingEditing ? "job-info-foot--editing" : ""
        }`}
      >
        <Cell label="Primary Contact">
          {primaryContact ? (
            <span className="line-clamp-2" title={primaryContactText}>
              {primaryContactText}
            </span>
          ) : (
            <span className="job-info-inline inline-flex flex-wrap items-center justify-center gap-2">
              <NotSet text="None set" />
              <Link to={customerPath} className="text-brand hover:underline">
                {contacts.length > 0 ? "Set primary" : "Add"}
              </Link>
            </span>
          )}
        </Cell>
        <Cell label="Progress Billing">
          {!isBillingEditing ? (
            <span className="job-info-inline inline-flex flex-wrap items-center justify-center gap-2">
              {job.progress_billing_status ? (
                <span className="capitalize">
                  {job.progress_billing_status.replace("_", " ")}
                </span>
              ) : (
                <NotSet />
              )}
              <button
                type="button"
                className="px-2.5 py-0.5 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                onClick={startBillingEdit}
              >
                {job.progress_billing_status ? "Change" : "Set"}
              </button>
            </span>
          ) : (
            <div className="job-info-inline flex flex-wrap items-center justify-center gap-2">
              <select
                value={billingDraft}
                onChange={(e) => setBillingDraft(e.target.value)}
                className="min-w-0 flex-1 max-w-xs p-1.5 bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-900 dark:text-white text-sm"
              >
                <option value="">Not set</option>
                {PROGRESS_BILLING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isBillingSaving}
                className="px-3 py-1 text-sm text-white bg-brand rounded-none hover:bg-brand-dark disabled:opacity-60"
                onClick={saveBilling}
              >
                {isBillingSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                disabled={isBillingSaving}
                className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                onClick={() => setIsBillingEditing(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </Cell>
        <Cell label="Description">
          {description ? (
            <>
              <div
                ref={descriptionRef}
                className={`whitespace-pre-line ${
                  isDescriptionExpanded ? "" : "line-clamp-2"
                }`}
              >
                {description}
              </div>
              {(isDescriptionClamped || isDescriptionExpanded) && (
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() => setIsDescriptionExpanded((v) => !v)}
                >
                  {isDescriptionExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </>
          ) : (
            <NotSet />
          )}
        </Cell>
      </div>
    </div>
  );

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-bold text-brand">
              Job #{job.job_number || "Pending"}
            </span>
            <HeaderSelect
              label="Status"
              hideLabel
              className={touchChipClass}
              icon={
                <span
                  className={`h-2.5 w-2.5 rounded-none ${
                    STATUS_COLORS[job.status] || "bg-neutral-500"
                  }`}
                />
              }
              value={job.status}
              options={STATUS_OPTIONS}
              onChange={onStatusChange}
            />
          </div>
          <h1 className="mt-1 text-xl font-semibold leading-tight text-neutral-900 dark:text-white">
            {title}
          </h1>
          <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            <Link to={customerPath} className="hover:text-brand hover:underline">
              {customerName}
            </Link>
            {siteAddress && <span> · {siteAddress}</span>}
          </div>
        </div>

        {/* relative: the Lead picker opens under the whole row, so it stays on screen. */}
        <div className="relative grid grid-cols-3 gap-2">
          <label
            className={`${tileClass} focus-within:ring-2 focus-within:ring-brand`}
          >
            <span className={tileLabelClass}>Priority</span>
            <span className={tileValueClass}>
              {PRIORITY_OPTIONS.find((o) => o.value === job.priority)?.label ||
                job.priority}
            </span>
            <select
              aria-label="Priority"
              value={job.priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer bg-white text-neutral-900 opacity-0 dark:bg-dark-150 dark:text-white"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {/* fireteam-lead-selector: JobDetail closes the picker on clicks outside it */}
          <div className="fireteam-lead-selector min-w-0">
            <button
              type="button"
              className={tileClass}
              onClick={onFireteamLeadClick}
            >
              <span className={tileLabelClass}>Lead</span>
              <span className={tileValueClass}>
                {job.fireteam_lead || <NotSet />}
              </span>
            </button>
            {fireteamLeadPicker}
          </div>
          <div className={tileClass}>
            <span className={tileLabelClass}>Due</span>
            <span className={tileValueClass}>{dueDate || <NotSet />}</span>
          </div>
        </div>

        {showDetails && (
          <div className="flex flex-col gap-3">
            <div className="w-full sm:w-auto sm:self-end">
              <ProjectManagerPicker
                value={job.project_manager_id}
                division={job.division}
                onChange={onProjectManagerChange}
                chipClassName={touchChipClass}
                labelClassName={chipLabelClass}
              />
            </div>
            <div className="border-x border-b border-black/10 dark:border-dark-300">
              {details}
            </div>
          </div>
        )}

        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
          className="inline-flex h-11 items-center justify-center gap-1.5 self-center px-4 text-sm font-semibold text-brand"
        >
          {showDetails ? "Hide details" : "Show all details"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center space-x-2">
            <Building className="h-5 w-5 text-brand" />
            <span>Job Information</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderSelect
              label="Status"
              icon={
                <span
                  className={`h-2.5 w-2.5 rounded-none ${
                    STATUS_COLORS[job.status] || "bg-neutral-500"
                  }`}
                />
              }
              value={job.status}
              options={STATUS_OPTIONS}
              onChange={onStatusChange}
            />
            <HeaderSelect
              label="Priority"
              icon={
                job.priority === "high" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                ) : job.priority === "medium" ? (
                  <Clock className="h-3.5 w-3.5 text-yellow-500" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                )
              }
              value={job.priority}
              options={PRIORITY_OPTIONS}
              onChange={onPriorityChange}
            />
            {/* fireteam-lead-selector: JobDetail closes the picker on clicks outside it */}
            <div className="relative fireteam-lead-selector">
              <button
                type="button"
                className={chipClass}
                onClick={onFireteamLeadClick}
              >
                <span className={chipLabelClass}>Lead</span>
                <User className="h-3.5 w-3.5 text-brand" />
                {job.fireteam_lead || <NotSet text="Not assigned" />}
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
              </button>
              {fireteamLeadPicker}
            </div>
            <ProjectManagerPicker
              value={job.project_manager_id}
              division={job.division}
              onChange={onProjectManagerChange}
              chipClassName={chipClass}
              labelClassName={chipLabelClass}
            />
          </div>
        </div>
      </CardHeader>

      {details}
    </Card>
  );
}
