import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistentState } from "@/hooks/usePersistentState";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import { fetchAssetsForSite } from "@/services/equipmentAssetsService";
import {
  bulkDelete,
  bulkSetStatus,
  fetchScheduledTestsForJob,
  joinAssets,
  supportsScheduling,
  undoBatch,
  type BulkDateOp,
} from "@/services/scheduledTestsService";
import {
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
  RESULT_LABELS,
  SCHEDULE_STATE_LABELS,
  TERMINAL_TESTING_STATUSES,
  TESTING_STATUS_LABELS,
  TESTING_STATUS_OPTIONS,
  formatScheduleDate,
  getScheduleState,
  todayISO,
  type EquipmentStatus,
  type ScheduleState,
  type ScheduledTest,
  type ScheduledTestRow,
  type TestingStatus,
} from "@/lib/types/testScheduling";
import {
  useReportTemplateChoices,
  workScheduledLabel,
} from "@/components/assets/useReportTemplateChoices";
import ScheduledTestDrawer from "./ScheduledTestDrawer";
import BulkDateDialog from "./BulkDateDialog";
import {
  GROUP_BY_LABELS,
  PRESET_VIEWS,
  describeGroup,
  groupRows,
  loadCustomViews,
  matchesScope,
  saveCustomViews,
  type GroupBy,
  type SortKey,
  type StateScope,
  type TrackerView,
} from "./trackerViews";

interface ProjectTrackerTabProps {
  /**
   * The project whose schedule this is.
   *
   * A schedule is project-specific: start and finish dates belong to a job, not to a
   * facility. The equipment registry is the part that outlives the project. So the
   * tracker always runs inside a job and only ever shows that job's rows.
   */
  jobId: string;
  /** Opens a linked report document. Omitted where there's nowhere to navigate to. */
  onOpenReport?: (reportAssetId: string) => void;
}

/**
 * Colour for the leading stripe. This is what makes past-due readable across a screenful
 * of rows without filtering to it or adding a column nobody scans.
 */
const STATE_STRIPE: Record<ScheduleState, string> = {
  past_due: "bg-destructive",
  due_now: "bg-orange-500",
  on_hold: "bg-amber-400",
  upcoming: "bg-neutral-300 dark:bg-neutral-600",
  complete: "bg-neutral-200 dark:bg-neutral-700",
  unscheduled: "bg-neutral-200 dark:bg-neutral-800",
};

const BLANK = "—";

/**
 * The Project Tracker: this project's scheduled tests, with status and result.
 *
 * The Assets tab answers "what equipment is here", which is a fact about the facility and
 * outlives any one job. This answers the question a PM asks on a Monday morning — what
 * are we testing this week, what's late, what isn't even scheduled — and those are dates
 * belonging to a project, so the tracker lives on the job.
 */
export function ProjectTrackerTab({ jobId, onOpenReport }: ProjectTrackerTabProps) {
  const { user } = useAuth();
  const { getUserRole, isAdmin } = usePermissions();
  const userId = user?.id;
  // Same role list the Assets tab uses. Bulk date tools arguably want a narrower set
  // (a tech shifting 47 items by accident is worse than a tech having to ask), but
  // splitting that is a permissions decision, not a guess to make here.
  const canEdit =
    isAdmin ||
    ["Admin", "Super Admin", "Office Admin", "Manager", "NETA Technician"].includes(
      getUserRole() as string,
    );

  const [rows, setRows] = useState<ScheduledTestRow[]>([]);
  /**
   * Read off the job rather than passed in, so this tab doesn't depend on the job page
   * happening to select site_id — the same reason the Assets tab resolves it itself.
   */
  const [siteId, setSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  /** Ticked rows. Never persisted — 47 items still selected tomorrow is a hazard. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [dateOp, setDateOp] = useState<BulkDateOp | null>(null);

  const { choices } = useReportTemplateChoices(true);

  const [search, setSearch] = usePersistentState(`tracker:${jobId}:search`, "");
  const [substationFilter, setSubstationFilter] = usePersistentState(
    `tracker:${jobId}:substation`,
    "all",
  );
  const [testingFilter, setTestingFilter] = usePersistentState(
    `tracker:${jobId}:testing`,
    "all",
  );
  const [equipmentFilter, setEquipmentFilter] = usePersistentState(
    `tracker:${jobId}:equipment`,
    "all",
  );
  const [resultFilter, setResultFilter] = usePersistentState(
    `tracker:${jobId}:result`,
    "all",
  );
  const [showCompleted, setShowCompleted] = usePersistentState(
    `tracker:${jobId}:completed`,
    false,
  );
  const [sortKey, setSortKey] = usePersistentState<SortKey>(
    `tracker:${jobId}:sortKey`,
    "finish_date",
  );
  const [sortAsc, setSortAsc] = usePersistentState(`tracker:${jobId}:sortAsc`, true);

  // ── Views ──────────────────────────────────────────────────────────────────
  // Due & Past Due is the default because it's the Monday-morning question. Anything
  // else landing first means filtering your way to it every time.
  const [stateScope, setStateScope] = usePersistentState<StateScope>(
    `tracker:${jobId}:scope`,
    "due_and_late",
  );
  const [groupBy, setGroupBy] = usePersistentState<GroupBy>(
    `tracker:${jobId}:groupBy`,
    "due_bucket",
  );
  const [viewId, setViewId] = usePersistentState(`tracker:${jobId}:view`, "due");
  const [customViews, setCustomViews] = useState<TrackerView[]>([]);
  /** Collapsed group headers. Survives a reload so a collapsed hall stays collapsed. */
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<string[]>(
    `tracker:${jobId}:collapsedGroups`,
    [],
  );

  useEffect(() => {
    setCustomViews(loadCustomViews(jobId));
  }, [jobId]);

  const allViews = useMemo(
    () => [...PRESET_VIEWS, ...customViews],
    [customViews],
  );

  const applyView = (view: TrackerView) => {
    setViewId(view.id);
    setSubstationFilter(view.substation);
    setTestingFilter(view.testing);
    setEquipmentFilter(view.equipment);
    setResultFilter(view.result);
    setShowCompleted(view.showCompleted);
    setStateScope(view.stateScope);
    setSortKey(view.sortKey);
    setSortAsc(view.sortAsc);
    setGroupBy(view.groupBy);
    setCollapsedGroups([]);
  };

  const saveCurrentAsView = () => {
    const label = window.prompt("Name this view")?.trim();
    if (!label) return;
    const view: TrackerView = {
      id: `custom-${Date.now()}`,
      label,
      hint: "Your saved view.",
      custom: true,
      substation: substationFilter,
      testing: testingFilter,
      equipment: equipmentFilter,
      result: resultFilter,
      showCompleted,
      stateScope,
      sortKey,
      sortAsc,
      groupBy,
    };
    const next = [...customViews, view];
    setCustomViews(next);
    saveCustomViews(jobId, next);
    setViewId(view.id);
    toast.success(`Saved "${label}"`);
  };

  const deleteCustomView = (id: string) => {
    const next = customViews.filter((v) => v.id !== id);
    setCustomViews(next);
    saveCustomViews(jobId, next);
    if (viewId === id) applyView(PRESET_VIEWS[0]);
  };

  /**
   * Assets are fetched alongside the schedule and joined here rather than embedded in the
   * query: "Part of" needs a self-join through a column that's optional on instances
   * without the sub-asset migration.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: jobRow, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("site_id")
        .eq("id", jobId)
        .maybeSingle();

      // 42703/42P01 = the asset-tracking migration hasn't been applied here.
      if (error?.code === "42703" || error?.code === "42P01") {
        setMigrationMissing(true);
        return;
      }

      const jobSiteId = (jobRow as { site_id?: string } | null)?.site_id ?? null;
      setSiteId(jobSiteId);
      if (!jobSiteId) {
        setRows([]);
        return;
      }

      // Assets come from the site because that's where equipment lives; the schedule
      // comes from the job because that's whose dates these are.
      const [tests, assets] = await Promise.all([
        fetchScheduledTestsForJob(jobId),
        fetchAssetsForSite(jobSiteId),
      ]);
      if (!supportsScheduling()) {
        setMigrationMissing(true);
        return;
      }
      setRows(joinAssets(tests, assets));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load the tracker");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Recomputed against today, never stored — a stored "past due" is wrong by morning. */
  const today = todayISO();

  const substationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.substation?.trim()) set.add(r.substation.trim());
    return [
      { value: "all", label: "All substations" },
      ...Array.from(set)
        .sort(compareAlphanumericLabels)
        .map((s) => ({ value: s, label: s })),
    ];
  }, [rows]);

  const labelFor = useCallback(
    (row: ScheduledTestRow) => workScheduledLabel(row, choices),
    [choices],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      // The view's scope runs before the column filters, so switching views never
      // silently drops a substation the user picked by hand.
      if (!matchesScope(row, stateScope, today)) return false;
      if (substationFilter !== "all" && (row.substation ?? "") !== substationFilter)
        return false;
      if (testingFilter !== "all" && row.testing_status !== testingFilter) return false;
      if (equipmentFilter !== "all") {
        const value = row.equipment_status ?? "";
        // "blank" is a real filter target: an unset equipment status is different from
        // somebody having said "not installed".
        if (equipmentFilter === "blank" ? value !== "" : value !== equipmentFilter)
          return false;
      }
      if (resultFilter !== "all") {
        const value = row.result ?? "";
        if (resultFilter === "none" ? value !== "" : value !== resultFilter) return false;
      }
      if (!showCompleted && TERMINAL_TESTING_STATUSES.includes(row.testing_status))
        return false;
      if (!term) return true;
      return [
        row.identifier,
        row.substation,
        row.building_area,
        row.equipment_location,
        row.equipment_type,
        row.part_of,
        labelFor(row),
        row.notes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });

    const value = (row: ScheduledTestRow): string | number => {
      switch (sortKey) {
        case "work":
          return labelFor(row);
        case "start_date":
        case "finish_date":
          return row[sortKey] ?? "";
        case "part_of":
          return row.part_of ?? "";
        case "equipment_status":
          return row.equipment_status ?? "";
        case "testing_status":
          return row.testing_status;
        case "result":
          return row.result ?? "";
        default:
          return row[sortKey] ?? "";
      }
    };

    return [...filtered].sort((a, b) => {
      const left = String(value(a));
      const right = String(value(b));
      // Blanks sort to the bottom whichever way the column points — an unscheduled row
      // shouldn't crowd out the top of a date sort.
      if (!left && !right) return compareAlphanumericLabels(a.identifier, b.identifier);
      if (!left) return 1;
      if (!right) return -1;
      const compared =
        sortKey === "start_date" || sortKey === "finish_date"
          ? left.localeCompare(right)
          : compareAlphanumericLabels(left, right);
      if (compared !== 0) return compared * (sortAsc ? 1 : -1);
      return compareAlphanumericLabels(a.identifier, b.identifier);
    });
  }, [
    rows,
    search,
    substationFilter,
    testingFilter,
    equipmentFilter,
    resultFilter,
    showCompleted,
    sortKey,
    sortAsc,
    labelFor,
    stateScope,
    today,
  ]);

  /**
   * Display groups. The table's own sort still governs rows inside a group — grouping
   * only decides which header they sit under.
   */
  const groups = useMemo(
    () => groupRows(visible, groupBy, today),
    [visible, groupBy, today],
  );
  const collapsedSet = useMemo(() => new Set(collapsedGroups), [collapsedGroups]);

  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const counts = useMemo(() => {
    let pastDue = 0;
    let dueNow = 0;
    let unscheduled = 0;
    for (const row of rows) {
      const state = getScheduleState(row, today);
      if (state === "past_due") pastDue += 1;
      else if (state === "due_now") dueNow += 1;
      else if (state === "unscheduled") unscheduled += 1;
    }
    return { pastDue, dueNow, unscheduled };
  }, [rows, today]);

  const openRow = useMemo(
    () => visible.find((r) => r.id === openRowId) ?? null,
    [visible, openRowId],
  );

  const applySaved = (saved: ScheduledTest) => {
    setRows((current) =>
      current.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)),
    );
  };

  // ── Selection ──────────────────────────────────────────────────────────────
  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  // Rows filtered out of view drop out of the selection. Acting on rows nobody can see
  // is the exact failure this feature has to avoid.
  useEffect(() => {
    setSelectedIds((current) => {
      const kept = current.filter((id) => visibleIdSet.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [visibleIdSet]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(
    () => visible.filter((r) => selectedSet.has(r.id)),
    [visible, selectedSet],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  /** Shift-click ticks everything between the last click and this one. */
  const toggleRow = (id: string, withShift: boolean) => {
    setSelectedIds((current) => {
      if (withShift && lastClickedId) {
        const from = visibleIds.indexOf(lastClickedId);
        const to = visibleIds.indexOf(id);
        if (from >= 0 && to >= 0) {
          const range = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
          return Array.from(new Set([...current, ...range]));
        }
      }
      return current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
    });
    setLastClickedId(id);
  };

  /**
   * Success toast with a 30-second Undo. The batch stays revertible from the audit log
   * afterwards, but the toast is what catches the mistake in the ten seconds where the
   * person still remembers what they clicked.
   */
  const toastWithUndo = (message: string, batchId: string | null) => {
    if (!batchId) {
      toast.success(message);
      return;
    }
    toast.success(
      (t) => (
        <span className="flex items-center gap-3">
          {message}
          <button
            type="button"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await undoBatch(batchId, userId);
                toast.success("Reverted");
                await load();
              } catch (e: any) {
                console.error(e);
                toast.error(e?.message || "Failed to undo");
              }
            }}
            className="font-semibold text-brand hover:underline"
          >
            Undo
          </button>
        </span>
      ),
      { duration: 30_000 },
    );
  };

  const afterBulk = async (
    message: string,
    batchId: string | null,
    affected: number,
  ) => {
    setSelectedIds([]);
    await load();
    toastWithUndo(`${message} on ${affected} item${affected === 1 ? "" : "s"}`, batchId);
  };

  const handleBulkStatus = async (patch: {
    equipmentStatus?: EquipmentStatus | null;
    testingStatus?: TestingStatus;
  }) => {
    if (!siteId) return;
    try {
      const { batchId, affected } = await bulkSetStatus({
        siteId,
        rows: selectedRows,
        ...patch,
        userId,
      });
      await afterBulk("Status updated", batchId, affected);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update status");
    }
  };

  const handleBulkDelete = async () => {
    if (!siteId) return;
    if (
      !window.confirm(
        `Delete ${selectedRows.length} scheduled test${selectedRows.length === 1 ? "" : "s"}? The equipment and any reports are kept — only the schedule rows go.`,
      )
    )
      return;
    try {
      const { batchId, affected } = await bulkDelete({
        siteId,
        rows: selectedRows,
        userId,
      });
      await afterBulk("Deleted", batchId, affected);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete");
    }
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((asc) => !asc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortableHead = (key: SortKey, label: string, className?: string) => {
    const active = key === sortKey;
    const Icon = active ? (sortAsc ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="flex items-center gap-1 font-medium hover:text-brand"
          title={`Sort by ${label}`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-brand" : "opacity-40"}`} />
        </button>
      </TableHead>
    );
  };

  if (migrationMissing) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Test scheduling isn't set up on this database yet. Run{" "}
            <code className="font-mono">
              database/migrations/create_scheduled_tests.sql
            </code>{" "}
            in the Supabase SQL editor, then reload.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // The schedule hangs off the site's equipment, so there's nothing to show until the
  // job knows which facility it's at. The Assets tab is where that gets set.
  if (!siteId) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg border border-neutral-200 p-8 text-center dark:border-neutral-700">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
          <h3 className="mb-1 text-lg font-medium">No site set for this job</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Pick the facility on the Assets tab first. The schedule is built from that
            site's equipment list.
          </p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg border border-neutral-200 p-8 text-center dark:border-neutral-700">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
          <h3 className="mb-1 text-lg font-medium">Nothing scheduled on this job yet</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Go to the Assets tab, tick the equipment this project covers and use Schedule
            test. Everything you schedule for this job shows up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Views ── */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-700">
        {allViews.map((view) => (
          <span key={view.id} className="flex items-center">
            <button
              type="button"
              onClick={() => applyView(view)}
              title={view.hint}
              className={`px-3 py-1.5 text-sm ${
                viewId === view.id
                  ? "border-b-2 border-brand font-medium text-brand"
                  : "text-neutral-500 hover:text-brand dark:text-neutral-400"
              }`}
            >
              {view.label}
            </button>
            {view.custom && viewId === view.id && (
              <button
                type="button"
                onClick={() => deleteCustomView(view.id)}
                className="text-neutral-400 hover:text-destructive"
                aria-label={`Delete the "${view.label}" view`}
                title="Delete this saved view"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-44">
            <Select
              value={groupBy}
              onChange={(e) => {
                setGroupBy(e.target.value as GroupBy);
                setCollapsedGroups([]);
              }}
              options={(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((value) => ({
                value,
                label: `Group: ${GROUP_BY_LABELS[value]}`,
              }))}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={saveCurrentAsView}>
            Save view
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Wrapped rather than sized directly: Input puts className on the <input>, so
            an unwrapped one keeps its w-full wrapper and takes the whole row. */}
        <div className="w-full sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search identifier, location, work…"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={substationFilter}
            onChange={(e) => setSubstationFilter(e.target.value)}
            options={substationOptions}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={testingFilter}
            onChange={(e) => setTestingFilter(e.target.value)}
            options={[
              { value: "all", label: "All testing statuses" },
              ...TESTING_STATUS_OPTIONS,
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            options={[
              { value: "all", label: "All equipment statuses" },
              { value: "blank", label: "Not set" },
              ...EQUIPMENT_STATUS_OPTIONS,
            ]}
          />
        </div>
        <div className="w-full sm:w-40">
          <Select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            options={[
              { value: "all", label: "All results" },
              { value: "none", label: "No result" },
              { value: "pass", label: "PASS" },
              { value: "fail", label: "FAIL" },
              { value: "limited_service", label: "LIMITED SERVICE" },
            ]}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>

      {/* One strip, two states. The bulk bar replaces the count line rather than
          appearing above it, so ticking a row doesn't shove the table down the page. */}
      {!(canEdit && selectedRows.length > 0) ? (
        <div className="mb-2 flex min-h-[2.5rem] flex-wrap items-center gap-x-3 gap-y-1 px-3 text-sm text-neutral-500 dark:text-neutral-400">
          <span>
            {visible.length === rows.length
              ? `${rows.length} scheduled test${rows.length === 1 ? "" : "s"}`
              : `${visible.length} of ${rows.length} scheduled tests`}
          </span>
          {counts.pastDue > 0 && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="font-medium text-destructive">
                {counts.pastDue} past due
              </span>
            </>
          )}
          {counts.dueNow > 0 && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="font-medium text-orange-600 dark:text-orange-400">
                {counts.dueNow} due now
              </span>
            </>
          )}
          {counts.unscheduled > 0 && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span>{counts.unscheduled} with no dates</span>
            </>
          )}
        </div>
      ) : (
        <div className="mb-2 flex min-h-[2.5rem] flex-wrap items-center gap-2 border border-brand/40 bg-brand/10 px-3 text-sm">
          <span className="font-medium">
            {selectedRows.length} selected
            {!allVisibleSelected && visibleIds.length > selectedRows.length && (
              <button
                type="button"
                onClick={() => setSelectedIds(visibleIds)}
                className="ml-2 font-normal text-brand hover:underline"
              >
                Select all {visibleIds.length} in this view
              </button>
            )}
          </span>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>

          <Button size="sm" variant="ghost" onClick={() => setDateOp("set_start")}>
            Change start
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDateOp("set_finish")}>
            Change finish
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDateOp("shift")}
            leftIcon={<CalendarRange className="h-4 w-4" />}
          >
            Shift dates
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                Set status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Testing status</DropdownMenuLabel>
              {TESTING_STATUS_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() =>
                    void handleBulkStatus({
                      testingStatus: option.value as TestingStatus,
                    })
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Equipment status</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => void handleBulkStatus({ equipmentStatus: null })}
              >
                Not set
              </DropdownMenuItem>
              {EQUIPMENT_STATUS_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() =>
                    void handleBulkStatus({
                      equipmentStatus: option.value as EquipmentStatus,
                    })
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleBulkDelete()}
            leftIcon={<Trash2 className="h-4 w-4 text-destructive" />}
          >
            Delete
          </Button>

          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-auto flex items-center gap-1 text-neutral-500 hover:text-brand"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      <div className="rounded-none border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[6px] p-0">
                <span className="sr-only">Schedule state</span>
              </TableHead>
              {canEdit && (
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelectedIds(allVisibleSelected ? [] : visibleIds)
                    }
                    aria-label="Select all rows in this view"
                  />
                </TableHead>
              )}
              {sortableHead("substation", "Substation")}
              {sortableHead("identifier", "Identifier")}
              {sortableHead("part_of", "Part of")}
              {sortableHead("work", "Work scheduled")}
              {sortableHead("start_date", "Start")}
              {sortableHead("finish_date", "Finish")}
              {sortableHead("equipment_status", "Equipment status")}
              {sortableHead("testing_status", "Testing status")}
              {sortableHead("result", "Result")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 11 : 10}
                  className="py-8 text-center text-neutral-500 dark:text-neutral-400"
                >
                  No items match this view.
                </TableCell>
              </TableRow>
            ) : (
              groups.flatMap((group) => {
                const collapsed = collapsedSet.has(group.key);
                const header =
                  groupBy === "none" ? null : (
                    <TableRow
                      key={`group-${group.key}`}
                      className="bg-neutral-100 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-900"
                    >
                      <TableCell colSpan={canEdit ? 11 : 10} className="py-2">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className="flex w-full items-center gap-2 text-left"
                          aria-expanded={!collapsed}
                        >
                          {collapsed ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
                          )}
                          <span
                            className={`font-semibold ${
                              group.key === "past_due" ? "text-destructive" : ""
                            }`}
                          >
                            {group.label}
                          </span>
                          {/* The rollup is the point of the header: the "how many are
                              left and when" answer, before anyone expands anything. */}
                          <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">
                            {describeGroup(group, groupBy)}
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  );

                if (collapsed) return header ? [header] : [];

                const body = group.rows.map((row) => {
                  const state = getScheduleState(row, today);
                const isCustomWork =
                  !row.report_slug && !row.custom_form_template_id;
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => setOpenRowId(row.id)}
                    className="cursor-pointer"
                    title={SCHEDULE_STATE_LABELS[state]}
                  >
                    <TableCell className="w-[6px] p-0">
                      <div
                        className={`h-full min-h-[2.5rem] w-[6px] ${STATE_STRIPE[state]}`}
                        aria-label={SCHEDULE_STATE_LABELS[state]}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedSet.has(row.id)}
                          onChange={(e) =>
                            // Shift state rides on the click that produced the change;
                            // a keyboard toggle has no MouseEvent, so it reads false.
                            toggleRow(
                              row.id,
                              (e.nativeEvent as MouseEvent).shiftKey === true,
                            )
                          }
                          aria-label={`Select ${row.identifier}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>{row.substation || BLANK}</TableCell>
                    <TableCell className="font-medium">{row.identifier}</TableCell>
                    <TableCell className="text-neutral-500 dark:text-neutral-400">
                      {row.part_of || BLANK}
                    </TableCell>
                    <TableCell>
                      <span className={isCustomWork ? "italic" : undefined}>
                        {labelFor(row)}
                      </span>
                      {isCustomWork && (
                        <span
                          className="ml-1 text-neutral-400"
                          title="Free-text scope, not a report template"
                        >
                          •
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={
                        row.start_date ? undefined : "text-neutral-400"
                      }
                    >
                      {formatScheduleDate(row.start_date)}
                    </TableCell>
                    <TableCell
                      className={
                        state === "past_due"
                          ? "font-medium text-destructive"
                          : row.finish_date
                            ? undefined
                            : "text-neutral-400"
                      }
                    >
                      {formatScheduleDate(row.finish_date)}
                    </TableCell>
                    <TableCell>
                      {row.equipment_status ? (
                        EQUIPMENT_STATUS_LABELS[row.equipment_status]
                      ) : (
                        <span className="text-neutral-400">{BLANK}</span>
                      )}
                    </TableCell>
                    <TableCell>{TESTING_STATUS_LABELS[row.testing_status]}</TableCell>
                    <TableCell>
                      {row.result ? (
                        <span
                          className={`font-semibold ${
                            row.result === "pass"
                              ? "text-green-600 dark:text-green-400"
                              : row.result === "fail"
                                ? "text-destructive"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {RESULT_LABELS[row.result]}
                        </span>
                      ) : (
                        <span className="text-neutral-400">{BLANK}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                });

                return header ? [header, ...body] : body;
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ScheduledTestDrawer
        row={openRow}
        onClose={() => setOpenRowId(null)}
        canEdit={canEdit}
        userId={userId}
        onSaved={applySaved}
        workLabel={openRow ? labelFor(openRow) : ""}
        onOpenReport={onOpenReport}
      />

      <BulkDateDialog
        open={dateOp !== null && !!siteId}
        onClose={() => setDateOp(null)}
        siteId={siteId ?? ""}
        op={dateOp ?? "shift"}
        rows={selectedRows}
        userId={userId}
        onApplied={(batchId, affected) =>
          void afterBulk("Dates changed", batchId, affected)
        }
      />
    </div>
  );
}

export default ProjectTrackerTab;
