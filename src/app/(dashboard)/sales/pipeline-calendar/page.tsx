import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Table2,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  PipelineJob,
  PipelineRegion,
  PipelineStatus,
} from "@/services/pipelineCalendarService";

type ViewMode = "calendar" | "list";
type RangeMode = "month" | "quarter" | "year";
type SortKey = "startDate" | "customer" | "amount" | "region";
type SortDirection = "asc" | "desc";
type PopoverPosition = { top: number; left: number };

const regions: PipelineRegion[] = ["AL", "TN", "GA", "International"];
const statuses: PipelineStatus[] = ["confirmed", "expected", "dropped"];

const regionPalette: Record<
  PipelineRegion,
  { bg: string; light: string; border: string }
> = {
  AL: { bg: "#2563eb", light: "#dbeafe", border: "#93c5fd" },
  TN: { bg: "#16a34a", light: "#dcfce7", border: "#86efac" },
  GA: { bg: "#f26722", light: "#ffedd5", border: "#fdba74" },
  International: { bg: "#7c3aed", light: "#ede9fe", border: "#c4b5fd" },
};

const statusLabels: Record<PipelineStatus, string> = {
  confirmed: "Awarded",
  expected: "Expected",
  dropped: "Dropped",
};

const defaultRegionFilter: Record<PipelineRegion, boolean> = {
  AL: true,
  TN: true,
  GA: true,
  International: true,
};

const defaultStatusFilter: Record<PipelineStatus, boolean> = {
  confirmed: true,
  expected: true,
  dropped: true,
};

const dayMs = 24 * 60 * 60 * 1000;

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number): Date {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
}

function endOfQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth + 3, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

function clampDate(date: Date, minDate: Date, maxDate: Date): Date {
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
}

function formatMillions(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })}m`;
}

function formatDate(value?: string): string {
  if (!value) return "Open";

  return parseDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRangeLabel(date: Date, rangeMode: RangeMode): string {
  if (rangeMode === "month") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  if (rangeMode === "year") {
    return String(date.getFullYear());
  }

  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

function jobOverlapsRange(
  job: PipelineJob,
  viewStart: Date,
  viewEnd: Date,
): boolean {
  const jobStart = parseDate(job.startDate);
  const jobEnd = job.endDate ? parseDate(job.endDate) : viewEnd;

  return jobStart <= viewEnd && jobEnd >= viewStart;
}

function getMonthSegments(viewStart: Date, viewEnd: Date) {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const segments: Array<{ label: string; left: number; width: number }> = [];
  let cursor = startOfMonth(viewStart);

  while (cursor <= viewEnd) {
    const monthStart = cursor < viewStart ? viewStart : cursor;
    const rawMonthEnd = endOfMonth(cursor);
    const monthEnd = rawMonthEnd > viewEnd ? viewEnd : rawMonthEnd;

    segments.push({
      label: cursor.toLocaleDateString("en-US", { month: "short" }),
      left: ((monthStart.getTime() - viewStart.getTime()) / totalMs) * 100,
      width:
        ((addDays(monthEnd, 1).getTime() - monthStart.getTime()) / totalMs) *
        100,
    });

    cursor = addMonths(cursor, 1);
  }

  return segments;
}

function getDateTicks(viewStart: Date, viewEnd: Date, rangeMode: RangeMode) {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const ticks: Array<{ label: string; left: number }> = [];
  let cursor = rangeMode === "month" ? viewStart : startOfMonth(viewStart);
  const stepDays = rangeMode === "month" ? 7 : 0;

  while (cursor <= viewEnd) {
    ticks.push({
      label:
        rangeMode === "month"
          ? String(cursor.getDate())
          : cursor.toLocaleDateString("en-US", { month: "short" }),
      left: ((cursor.getTime() - viewStart.getTime()) / totalMs) * 100,
    });

    cursor =
      rangeMode === "month" ? addDays(cursor, stepDays) : addMonths(cursor, 1);
  }

  return ticks;
}

function getBarStyle(
  job: PipelineJob,
  viewStart: Date,
  viewEnd: Date,
): React.CSSProperties {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const jobStart = clampDate(parseDate(job.startDate), viewStart, viewEnd);
  const rawJobEnd = job.endDate ? parseDate(job.endDate) : viewEnd;
  const jobEnd = clampDate(rawJobEnd, viewStart, viewEnd);
  const left = ((jobStart.getTime() - viewStart.getTime()) / totalMs) * 100;
  const width =
    ((addDays(jobEnd, 1).getTime() - jobStart.getTime()) / totalMs) * 100;
  const baseColor =
    job.status === "dropped" ? "#9ca3af" : regionPalette[job.region].bg;

  return {
    left: `${left}%`,
    width: `${Math.max(width, 2.8)}%`,
    backgroundColor: baseColor,
  };
}

function sortJobs(
  jobs: PipelineJob[],
  sortKey: SortKey,
  direction: SortDirection,
): PipelineJob[] {
  return [...jobs].sort((jobA, jobB) => {
    let result = 0;

    if (sortKey === "amount") {
      result = jobA.amount - jobB.amount;
    } else if (sortKey === "startDate") {
      result =
        parseDate(jobA.startDate).getTime() -
        parseDate(jobB.startDate).getTime();
    } else {
      result = String(jobA[sortKey]).localeCompare(String(jobB[sortKey]));
    }

    return direction === "asc" ? result : -result;
  });
}

function StatusIcon({ status }: { status: PipelineStatus }) {
  if (status === "confirmed") return <Check className="h-3.5 w-3.5" />;
  if (status === "dropped") return <X className="h-3.5 w-3.5" />;
  return <span className="h-2 w-2 rounded-full bg-current" />;
}

function getStatusBadgeClasses(status: PipelineStatus): string {
  if (status === "confirmed") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (status === "expected") {
    return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  }
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
}

function StatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        getStatusBadgeClasses(status),
      )}
    >
      <StatusIcon status={status} />
      {statusLabels[status]}
    </span>
  );
}

function getRegionFromOpportunity(opportunity: any): PipelineRegion {
  const division = String(opportunity?.amp_division || "").toLowerCase();

  if (division.includes("tennessee")) return "TN";
  if (division.includes("georgia")) return "GA";
  if (division.includes("international")) return "International";
  return "AL";
}

function getStatusFromOpportunity(opportunity: any): PipelineStatus {
  const status = String(opportunity?.status || "").toLowerCase();

  if (
    status === "awarded" ||
    status === "decision - forecasted win" ||
    status === "won"
  ) {
    return "confirmed";
  }

  if (
    status === "lost" ||
    status === "no quote" ||
    status === "decision - forecast lose"
  ) {
    return "dropped";
  }

  return "expected";
}

function isAwardedOpportunity(opportunity: any): boolean {
  return String(opportunity?.status || "").toLowerCase() === "awarded";
}

function mapOpportunityToPipelineJob(
  opportunity: any,
  customerMap: Record<string, any>,
): PipelineJob {
  const customer = opportunity?.customer_id
    ? customerMap[opportunity.customer_id]
    : null;
  const customerName =
    customer?.company_name || customer?.name || "Unknown Customer";
  const amountDollars = Number(opportunity?.quoted_amount || 0);
  const startDate =
    opportunity?.estimated_start_date ||
    opportunity?.proposal_due_date ||
    opportunity?.opportunity_created_date ||
    opportunity?.created_at?.slice(0, 10) ||
    toDateInputValue(new Date());
  const endDate = opportunity?.estimated_end_date || undefined;

  return {
    id: String(opportunity.id),
    customer: customerName,
    dataCenterId: opportunity?.title || opportunity?.quote_number || "",
    location: opportunity?.jobsite_location || customer?.address || "Not set",
    region: getRegionFromOpportunity(opportunity),
    amount: Number.isFinite(amountDollars) ? amountDollars / 1000000 : 0,
    startDate,
    endDate,
    status: getStatusFromOpportunity(opportunity),
    isAwarded: isAwardedOpportunity(opportunity),
  };
}

export default function PipelineCalendarPage() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [rangeMode, setRangeMode] = useState<RangeMode>("quarter");
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [regionFilter, setRegionFilter] =
    useState<Record<PipelineRegion, boolean>>(defaultRegionFilter);
  const [statusFilter, setStatusFilter] =
    useState<Record<PipelineStatus, boolean>>(defaultStatusFilter);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] =
    useState<PopoverPosition | null>(null);
  const [selectedProjectionIds, setSelectedProjectionIds] = useState<
    Set<string>
  >(new Set());
  const [storageError, setStorageError] = useState("");
  const [isLoadingProjection, setIsLoadingProjection] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    let isMounted = true;

    async function loadProjectionOpportunities() {
      setIsLoadingProjection(true);
      setStorageError("");

      try {
        const { data: opportunityData, error: opportunityError } =
          await supabase
            .schema("business")
            .from("opportunities")
            .select("*")
            .eq("in_pipeline_projection", true);

        if (opportunityError) throw opportunityError;

        const customerIds = [
          ...new Set(
            (opportunityData || [])
              .map((opportunity: any) => opportunity.customer_id)
              .filter(Boolean),
          ),
        ];
        const customerMap: Record<string, any> = {};

        if (customerIds.length > 0) {
          const { data: customerData, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name, address")
            .in("id", customerIds);

          if (customerError) throw customerError;

          (customerData || []).forEach((customer: any) => {
            customerMap[customer.id] = customer;
          });
        }

        const nextJobs = (opportunityData || [])
          .map((opportunity: any) =>
            mapOpportunityToPipelineJob(opportunity, customerMap),
          )
          .sort(
            (jobA, jobB) =>
              parseDate(jobA.startDate).getTime() -
              parseDate(jobB.startDate).getTime(),
          );

        if (isMounted) setJobs(nextJobs);
      } catch (error) {
        console.error(
          "Error loading pipeline projection opportunities:",
          error,
        );
        if (isMounted) {
          setJobs([]);
          setStorageError("Could not load Pipeline Projection opportunities.");
        }
      } finally {
        if (isMounted) setIsLoadingProjection(false);
      }
    }

    loadProjectionOpportunities();
    window.addEventListener(
      "pipelineProjectionChanged",
      loadProjectionOpportunities,
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        "pipelineProjectionChanged",
        loadProjectionOpportunities,
      );
    };
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;

    function closePopover() {
      setSelectedJobId(null);
      setPopoverPosition(null);
    }

    window.addEventListener("resize", closePopover);
    window.addEventListener("scroll", closePopover, true);

    return () => {
      window.removeEventListener("resize", closePopover);
      window.removeEventListener("scroll", closePopover, true);
    };
  }, [selectedJobId]);

  const viewStart = useMemo(() => {
    if (rangeMode === "month") return startOfMonth(anchorDate);
    if (rangeMode === "year") return startOfYear(anchorDate);
    return startOfQuarter(anchorDate);
  }, [anchorDate, rangeMode]);
  const viewEnd = useMemo(() => {
    if (rangeMode === "month") return endOfMonth(anchorDate);
    if (rangeMode === "year") return endOfYear(anchorDate);
    return endOfQuarter(anchorDate);
  }, [anchorDate, rangeMode]);

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        return regionFilter[job.region] && statusFilter[job.status];
      }),
    [jobs, regionFilter, statusFilter],
  );

  const visibleCalendarJobs = useMemo(
    () =>
      sortJobs(
        filteredJobs.filter((job) => jobOverlapsRange(job, viewStart, viewEnd)),
        "startDate",
        "asc",
      ),
    [filteredJobs, viewStart, viewEnd],
  );

  const sortedListJobs = useMemo(
    () =>
      sortJobs(
        filteredJobs.filter((job) => jobOverlapsRange(job, viewStart, viewEnd)),
        sortKey,
        sortDirection,
      ),
    [filteredJobs, sortDirection, sortKey, viewStart, viewEnd],
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId],
  );

  const totals = useMemo(() => {
    const awarded = filteredJobs
      .filter((job) => job.status === "confirmed")
      .reduce((sum, job) => sum + job.amount, 0);
    const expected = filteredJobs
      .filter((job) => job.status === "expected")
      .reduce((sum, job) => sum + job.amount, 0);
    const dropped = filteredJobs
      .filter((job) => job.status === "dropped")
      .reduce((sum, job) => sum + job.amount, 0);

    return {
      awarded,
      expected,
      dropped,
      active: awarded + expected,
    };
  }, [filteredJobs]);

  const monthSegments = useMemo(
    () => getMonthSegments(viewStart, viewEnd),
    [viewEnd, viewStart],
  );
  const dateTicks = useMemo(
    () => getDateTicks(viewStart, viewEnd, rangeMode),
    [rangeMode, viewEnd, viewStart],
  );

  const moveRange = (direction: -1 | 1) => {
    setAnchorDate((currentDate) =>
      addMonths(
        currentDate,
        rangeMode === "month"
          ? direction
          : rangeMode === "quarter"
            ? direction * 3
            : direction * 12,
      ),
    );
  };

  const toggleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc" ? "desc" : "asc",
      );
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  };

  const closeJobPopover = () => {
    setSelectedJobId(null);
    setPopoverPosition(null);
  };

  const toggleProjectionSelection = (jobId: string) => {
    setSelectedProjectionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(jobId)) {
        nextIds.delete(jobId);
      } else {
        nextIds.add(jobId);
      }
      return nextIds;
    });
  };

  const toggleAllVisibleProjectionSelection = () => {
    setSelectedProjectionIds((currentIds) => {
      const visibleIds = sortedListJobs.map((job) => job.id);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => currentIds.has(id));
      const nextIds = new Set(currentIds);

      visibleIds.forEach((id) => {
        if (allSelected) {
          nextIds.delete(id);
        } else {
          nextIds.add(id);
        }
      });

      return nextIds;
    });
  };

  const handleRemoveSelectedFromProjection = async () => {
    const ids = Array.from(selectedProjectionIds);
    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ in_pipeline_projection: false })
        .in("id", ids);

      if (error) throw error;

      setJobs((currentJobs) =>
        currentJobs.filter((job) => !selectedProjectionIds.has(job.id)),
      );
      if (selectedJobId && selectedProjectionIds.has(selectedJobId)) {
        closeJobPopover();
      }
      setSelectedProjectionIds(new Set());
      setStorageError("");
      window.dispatchEvent(new Event("pipelineProjectionChanged"));
    } catch (error) {
      console.error(
        "Error removing opportunities from Pipeline Projection:",
        error,
      );
      setStorageError("Could not remove selected opportunities from Pipeline.");
    }
  };

  const toggleJobPopover = (jobId: string, point: { x: number; y: number }) => {
    if (selectedJobId === jobId) {
      closeJobPopover();
      return;
    }

    const width = 288;
    const estimatedHeight = 220;
    const gap = 8;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(margin, point.x + gap), maxLeft);
    const belowTop = point.y + gap;
    const aboveTop = point.y - estimatedHeight - gap;
    const top =
      belowTop + estimatedHeight > window.innerHeight && aboveTop > margin
        ? aboveTop
        : belowTop;

    setSelectedJobId(jobId);
    setPopoverPosition({ top, left });
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-gray-50">
            Pipeline Projection
          </h1>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Pipeline
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.awarded)} / {formatMillions(totals.active)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Awarded
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.awarded)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Expected
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.expected)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Dropped
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-500 dark:text-gray-400">
            {formatMillions(totals.dropped)}
          </div>
        </div>
      </div>

      {storageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {storageError}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-dark-150">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300",
                    viewMode === "calendar" &&
                      "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50",
                  )}
                >
                  <CalendarRange className="h-4 w-4" />
                  Calendar
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300",
                    viewMode === "list" &&
                      "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50",
                  )}
                >
                  <Table2 className="h-4 w-4" />
                  Table
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setRangeMode("month")}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300",
                    rangeMode === "month" &&
                      "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50",
                  )}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("quarter")}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300",
                    rangeMode === "quarter" &&
                      "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50",
                  )}
                >
                  Quarter
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("year")}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300",
                    rangeMode === "year" &&
                      "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50",
                  )}
                >
                  Year
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  aria-label="Previous range"
                  onClick={() => moveRange(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-32 px-2 text-center text-sm font-semibold text-gray-950 dark:text-gray-50">
                  {getRangeLabel(anchorDate, rangeMode)}
                </div>
                <button
                  type="button"
                  aria-label="Next range"
                  onClick={() => moveRange(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    setStatusFilter((current) => ({
                      ...current,
                      [status]: !current[status],
                    }))
                  }
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
                    statusFilter[status]
                      ? cn("border-transparent", getStatusBadgeClasses(status))
                      : "border-gray-200 bg-gray-50 text-gray-400 opacity-70 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500",
                  )}
                >
                  <StatusIcon status={status} />
                  {statusLabels[status]}
                </button>
              ))}

              {regions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() =>
                    setRegionFilter((current) => ({
                      ...current,
                      [region]: !current[region],
                    }))
                  }
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                    regionFilter[region]
                      ? "border-gray-300 bg-white text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50"
                      : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: regionPalette[region].bg }}
                  />
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedProjectionIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-red-50 px-4 py-2 dark:border-gray-800 dark:bg-red-950/20">
            <div className="text-sm font-medium text-red-800 dark:text-red-200">
              {selectedProjectionIds.size} selected
            </div>
            <button
              type="button"
              onClick={handleRemoveSelectedFromProjection}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              <Trash2 className="h-4 w-4" />
              Remove from Pipeline
            </button>
          </div>
        )}

        {viewMode === "calendar" ? (
          <div className="p-4">
            <div className="min-w-0 overflow-x-auto">
              <div
                className={cn(
                  "rounded-lg border border-gray-200 dark:border-gray-800",
                  rangeMode === "year" ? "min-w-[1320px]" : "min-w-[900px]",
                )}
              >
                <div className="grid grid-cols-[230px_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  <div className="border-r border-gray-200 px-3 py-3 dark:border-gray-800">
                    Job
                  </div>
                  <div className="relative h-11">
                    {monthSegments.map((segment) => (
                      <div
                        key={segment.label}
                        className="absolute top-0 flex h-full items-center justify-center border-l border-gray-200 first:border-l-0 dark:border-gray-800"
                        style={{
                          left: `${segment.left}%`,
                          width: `${segment.width}%`,
                        }}
                      >
                        {segment.label}
                      </div>
                    ))}
                  </div>
                </div>

                {visibleCalendarJobs.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {isLoadingProjection
                      ? "Loading Pipeline Projection..."
                      : "No opportunities in this Projection view."}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {visibleCalendarJobs.map((job) => {
                      const isSelected = selectedJobId === job.id;
                      const barStyle = getBarStyle(job, viewStart, viewEnd);

                      return (
                        <div
                          key={job.id}
                          className={cn(
                            "grid min-h-14 grid-cols-[230px_1fr] bg-white dark:bg-dark-150",
                            job.status === "dropped" &&
                              "bg-gray-50 text-gray-500 dark:bg-gray-900/60 dark:text-gray-500",
                          )}
                        >
                          <button
                            type="button"
                            onClick={(event) =>
                              toggleJobPopover(job.id, {
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }
                            className={cn(
                              "min-w-0 border-r border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900",
                              isSelected &&
                                "bg-orange-50 dark:bg-orange-950/20",
                            )}
                          >
                            <div
                              className={cn(
                                "truncate text-sm font-semibold text-gray-950 dark:text-gray-50",
                                job.status === "dropped" &&
                                  "text-gray-500 line-through dark:text-gray-500",
                              )}
                            >
                              {job.customer}
                            </div>
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {job.dataCenterId || "No DC ID"} · {job.location}
                            </div>
                          </button>

                          <div
                            className={cn(
                              "relative h-14 bg-white dark:bg-dark-150",
                            )}
                          >
                            {dateTicks.map((tick) => (
                              <div
                                key={`${job.id}-${tick.label}-${tick.left}`}
                                className="absolute top-0 h-full border-l border-gray-100 dark:border-gray-800"
                                style={{ left: `${tick.left}%` }}
                              />
                            ))}
                            <button
                              type="button"
                              aria-expanded={isSelected}
                              onClick={(event) =>
                                toggleJobPopover(job.id, {
                                  x: event.clientX,
                                  y: event.clientY,
                                })
                              }
                              className={cn(
                                "absolute top-2 z-10 flex h-9 min-w-7 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-xs font-semibold text-white shadow-sm ring-1 ring-black/10",
                                isSelected &&
                                  "z-30 ring-2 ring-gray-950 dark:ring-white",
                                job.status === "dropped" &&
                                  "text-gray-100 line-through opacity-70",
                              )}
                              style={barStyle}
                              title={`${job.customer} ${job.dataCenterId || ""} ${formatMillions(job.amount)}`}
                            >
                              <StatusIcon status={job.status} />
                              <span className="min-w-0 truncate">
                                {job.customer} · {formatMillions(job.amount)}
                              </span>
                              {!job.endDate && (
                                <span
                                  className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-md"
                                  style={{
                                    backgroundImage:
                                      "repeating-linear-gradient(135deg, rgba(255,255,255,.72) 0 4px, rgba(255,255,255,.08) 4px 8px)",
                                  }}
                                />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all visible pipeline rows"
                      checked={
                        sortedListJobs.length > 0 &&
                        sortedListJobs.every((job) =>
                          selectedProjectionIds.has(job.id),
                        )
                      }
                      onChange={toggleAllVisibleProjectionSelection}
                      className="h-4 w-4 rounded border-gray-300 text-[#f26722] focus:ring-[#f26722] dark:border-gray-700 dark:bg-gray-900"
                    />
                  </th>
                  {[
                    ["startDate", "Date"],
                    ["customer", "Customer"],
                    ["amount", "Amount"],
                    ["region", "Region"],
                  ].map(([key, label]) => (
                    <th key={key} className="px-3 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort(key as SortKey)}
                        className="inline-flex items-center gap-1 hover:text-gray-950 dark:hover:text-gray-50"
                      >
                        {label}
                        {sortKey === key && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-semibold">Data center</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {sortedListJobs.map((job) => (
                  <tr
                    key={job.id}
                    tabIndex={0}
                    onClick={(event) =>
                      toggleJobPopover(job.id, {
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      toggleJobPopover(job.id, {
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                      });
                    }}
                    className={cn(
                      "cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-900 dark:hover:bg-gray-900 dark:focus:ring-white",
                      selectedJobId === job.id &&
                        "bg-orange-50 dark:bg-orange-950/20",
                      selectedProjectionIds.has(job.id) &&
                        "bg-orange-50 dark:bg-orange-950/20",
                      job.status === "dropped" &&
                        "bg-gray-50 text-gray-500 dark:bg-gray-900/60 dark:text-gray-500",
                    )}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${job.customer}`}
                        checked={selectedProjectionIds.has(job.id)}
                        onChange={() => toggleProjectionSelection(job.id)}
                        className="h-4 w-4 rounded border-gray-300 text-[#f26722] focus:ring-[#f26722] dark:border-gray-700 dark:bg-gray-900"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(job.startDate)} –{" "}
                      {job.endDate ? formatDate(job.endDate) : ""}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 font-semibold text-gray-950 dark:text-gray-50",
                        job.status === "dropped" &&
                          "text-gray-500 line-through dark:text-gray-500",
                      )}
                    >
                      {job.customer}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">
                      {formatMillions(job.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: regionPalette[job.region].bg,
                          }}
                        />
                        {job.region}
                      </span>
                    </td>
                    <td className="px-3 py-3">{job.dataCenterId || "-"}</td>
                    <td className="px-3 py-3">{job.location}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={job.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedListJobs.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {isLoadingProjection
                  ? "Loading Pipeline Projection..."
                  : "No opportunities match these filters."}
              </div>
            )}
          </div>
        )}
      </section>

      {selectedJob &&
        popoverPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[1000] w-72 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            style={{
              top: popoverPosition.top,
              left: popoverPosition.left,
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={`/sales-dashboard/opportunities/${selectedJob.id}`}
                  className={cn(
                    "block truncate font-semibold text-gray-950 hover:text-[#f26722] hover:underline dark:text-gray-50 dark:hover:text-[#f26722]",
                    selectedJob.status === "dropped" &&
                      "text-gray-500 line-through dark:text-gray-500",
                  )}
                >
                  {selectedJob.customer}
                </a>
                <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {selectedJob.dataCenterId || "No DC ID"}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close job details"
                onClick={closeJobPopover}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <div className="font-medium uppercase text-gray-500 dark:text-gray-400">
                  Amount
                </div>
                <div className="mt-0.5 font-semibold">
                  {formatMillions(selectedJob.amount)}
                </div>
              </div>
              <div>
                <div className="font-medium uppercase text-gray-500 dark:text-gray-400">
                  Status
                </div>
                <div className="mt-0.5">
                  <StatusBadge status={selectedJob.status} />
                </div>
              </div>
              <div>
                <div className="font-medium uppercase text-gray-500 dark:text-gray-400">
                  Region
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: regionPalette[selectedJob.region].bg,
                    }}
                  />
                  {selectedJob.region}
                </div>
              </div>
              <div>
                <div className="font-medium uppercase text-gray-500 dark:text-gray-400">
                  Dates
                </div>
                <div className="mt-0.5 font-semibold">
                  {formatDate(selectedJob.startDate)} -{" "}
                  {selectedJob.endDate
                    ? formatDate(selectedJob.endDate)
                    : "Open"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="font-medium uppercase text-gray-500 dark:text-gray-400">
                  Location
                </div>
                <div className="mt-0.5 font-semibold">
                  {selectedJob.location}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
