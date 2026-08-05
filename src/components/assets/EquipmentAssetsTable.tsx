import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  FilePlus2,
  FileText,
  Link2Off,
  Pencil,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { usePersistentState } from "@/hooks/usePersistentState";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";

type SortKey =
  | "identifier"
  | "building_area"
  | "substation"
  | "equipment_location"
  | "equipment_type"
  | "report_count";

interface SortLevel {
  key: SortKey;
  asc: boolean;
}

/** A report document linked to an asset. */
export interface LinkedReport {
  id: string;
  name?: string;
  url?: string;
}

const SORT_LABELS: Record<SortKey, string> = {
  identifier: "Identifier",
  building_area: "Building / Area",
  substation: "Substation",
  equipment_location: "Equipment Location",
  equipment_type: "Equipment Type",
  report_count: "Reports",
};

const DEFAULT_SORT: SortLevel[] = [{ key: "identifier", asc: true }];

interface EquipmentAssetsTableProps {
  assets: EquipmentAssetWithCounts[];
  canEdit: boolean;
  onEdit: (asset: EquipmentAssetWithCounts) => void;
  onDuplicate: (asset: EquipmentAssetWithCounts) => void;
  onDelete: (asset: EquipmentAssetWithCounts) => void;
  /** Opens the Add report modal — new from template, or link a report that already exists. */
  onAddReport?: (asset: EquipmentAssetWithCounts) => void;
  /** Opens the Schedule test modal for this asset. */
  onScheduleTest?: (asset: EquipmentAssetWithCounts) => void;
  /**
   * Schedule everything currently ticked. Its presence is what turns on the checkbox
   * column and the bulk bar — a list with nothing to do in bulk doesn't grow a column.
   */
  onBatchSchedule?: (assets: EquipmentAssetWithCounts[]) => void;
  /** Job context only — removes from the job's scope, leaving the asset at the site. */
  onRemoveFromJob?: (asset: EquipmentAssetWithCounts) => void;
  /** Detach a sub-asset from its parent. Omitted where sub-assets aren't available. */
  onDetachFromParent?: (asset: EquipmentAssetWithCounts) => void;
  /** The reports pointing at each asset id, revealed by clicking its report count. */
  reportsByAsset?: Map<string, LinkedReport[]>;
  /** Open one of those reports. Without it, they're listed but not clickable. */
  onOpenReport?: (report: LinkedReport) => void;
  /**
   * Detach a report from this asset. The report itself is untouched and stays on the job;
   * it just stops claiming to describe this piece of equipment.
   */
  onDetachReport?: (asset: EquipmentAssetWithCounts, report: LinkedReport) => void;
  /** Rendered above the table, right of the filters. */
  actions?: React.ReactNode;
  emptyMessage?: string;
  /**
   * Namespace for remembering search/sort/filter across a reload. Distinct per list
   * (per job, per site) so one list's filters never show up on another's.
   */
  storageKey?: string;
}

const BLANK = "—";

/** Blanks sort to the bottom whichever way the column is pointing. */
function compareValues(
  a: EquipmentAssetWithCounts,
  b: EquipmentAssetWithCounts,
  key: SortKey,
): number {
  if (key === "report_count") return a.report_count - b.report_count;
  const left = String(a[key] ?? "").trim();
  const right = String(b[key] ?? "").trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  // Alphanumeric so CB-2 sorts before CB-10, not after it.
  return compareAlphanumericLabels(left, right);
}

/**
 * The asset list. Shared by the site registry and the job's asset tab; the job passes the
 * extra Create Report / Remove actions.
 *
 * Two things shape the rendering beyond a plain table:
 *  - Sorting is a stack, not a single column. Sorting by Equipment Type leaves identifiers
 *    in whatever order the rows arrived in unless something breaks the tie, so identifier
 *    is always the last level, and shift-clicking adds levels in between.
 *  - Sub-assets are pinned to their parent under every sort. A switchgear lineup and its
 *    switches/CTs/relays are one thing to walk up to, so they stay one block in the list.
 *
 * The row actions are deliberately four, not six. Two hundred rows of six icons put a
 * destructive delete a pixel from a copy button; Unlink and Delete now live behind the
 * Edit caret, so both irreversible actions take a second, deliberate click.
 */
export function EquipmentAssetsTable({
  assets,
  canEdit,
  onEdit,
  onDuplicate,
  onDelete,
  onAddReport,
  onScheduleTest,
  onBatchSchedule,
  onRemoveFromJob,
  onDetachFromParent,
  reportsByAsset,
  onOpenReport,
  onDetachReport,
  actions,
  emptyMessage = "No assets yet.",
  storageKey,
}: EquipmentAssetsTableProps) {
  /** Which rows have their linked reports expanded. Transient — not worth persisting. */
  const [expandedReports, setExpandedReports] = useState<string[]>([]);
  /**
   * Ticked rows. Deliberately not persisted: coming back to a page and finding 47 items
   * still selected is how the wrong 47 items get acted on.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Anchor for shift-click range select. */
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [search, setSearch] = usePersistentState(
    storageKey && `${storageKey}:search`,
    "",
  );
  const [substationFilter, setSubstationFilter] = usePersistentState(
    storageKey && `${storageKey}:substation`,
    "all",
  );
  const [buildingFilter, setBuildingFilter] = usePersistentState(
    storageKey && `${storageKey}:building`,
    "all",
  );
  const [sorts, setSorts] = usePersistentState<SortLevel[]>(
    storageKey && `${storageKey}:sort`,
    DEFAULT_SORT,
  );
  const [collapsed, setCollapsed] = usePersistentState<string[]>(
    storageKey && `${storageKey}:collapsed`,
    [],
  );

  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed]);

  const substationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.substation?.trim()) set.add(a.substation.trim());
    return [
      { value: "all", label: "All substations" },
      ...Array.from(set)
        .sort(compareAlphanumericLabels)
        .map((s) => ({ value: s, label: s })),
    ];
  }, [assets]);

  const buildingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.building_area?.trim()) set.add(a.building_area.trim());
    return [
      { value: "all", label: "All buildings / areas" },
      ...Array.from(set)
        .sort(compareAlphanumericLabels)
        .map((s) => ({ value: s, label: s })),
    ];
  }, [assets]);

  const comparator = useMemo(() => {
    const levels = sorts.length > 0 ? sorts : DEFAULT_SORT;
    // Identifier is the implicit last level: without it, ties keep whatever order the rows
    // were fetched in, which is what makes "sort by type" look unsorted within a type.
    const withTiebreak = levels.some((l) => l.key === "identifier")
      ? levels
      : [...levels, { key: "identifier" as SortKey, asc: true }];

    return (a: EquipmentAssetWithCounts, b: EquipmentAssetWithCounts): number => {
      for (const level of withTiebreak) {
        const result = compareValues(a, b, level.key) * (level.asc ? 1 : -1);
        if (result !== 0) return result;
      }
      return 0;
    };
  }, [sorts]);

  /**
   * Rows in display order: each top-level asset followed by its sub-assets. A sub-asset
   * whose parent isn't in this list (linked to the site but not to this job, say) is
   * promoted to top level rather than vanishing.
   */
  const { rows, matchCount } = useMemo(() => {
    const term = search.trim().toLowerCase();

    const matches = (a: EquipmentAssetWithCounts) => {
      if (substationFilter !== "all" && (a.substation ?? "") !== substationFilter)
        return false;
      if (buildingFilter !== "all" && (a.building_area ?? "") !== buildingFilter)
        return false;
      if (!term) return true;
      return [
        a.identifier,
        a.substation,
        a.building_area,
        a.equipment_location,
        a.equipment_type,
        a.manufacturer,
        a.model,
        a.serial_number,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    };

    const byId = new Map(assets.map((a) => [a.id, a]));
    const childrenOf = new Map<string, EquipmentAssetWithCounts[]>();
    const topLevel: EquipmentAssetWithCounts[] = [];

    for (const asset of assets) {
      const parentId = asset.parent_asset_id;
      if (parentId && byId.has(parentId)) {
        const siblings = childrenOf.get(parentId) ?? [];
        siblings.push(asset);
        childrenOf.set(parentId, siblings);
      } else {
        topLevel.push(asset);
      }
    }

    // A group survives filtering if the parent matches or any of its children do, so a
    // search for a switchgear still shows what's inside it, and a search for a CT still
    // shows which switchgear it belongs to.
    const visibleRows: {
      asset: EquipmentAssetWithCounts;
      depth: 0 | 1;
      children: EquipmentAssetWithCounts[];
      childReports: number;
    }[] = [];
    let matched = 0;

    for (const parent of [...topLevel].sort(comparator)) {
      const children = (childrenOf.get(parent.id) ?? []).sort(comparator);
      const parentMatches = matches(parent);
      const matchingChildren = children.filter(matches);
      if (!parentMatches && matchingChildren.length === 0) continue;

      const shownChildren = parentMatches ? children : matchingChildren;
      matched += (parentMatches ? 1 : 0) + matchingChildren.length;

      visibleRows.push({
        asset: parent,
        depth: 0,
        children: shownChildren,
        childReports: children.reduce((sum, c) => sum + c.report_count, 0),
      });

      if (collapsedSet.has(parent.id)) continue;
      for (const child of shownChildren) {
        visibleRows.push({ asset: child, depth: 1, children: [], childReports: 0 });
      }
    }

    return { rows: visibleRows, matchCount: matched };
  }, [assets, search, substationFilter, buildingFilter, comparator, collapsedSet]);

  const toggleSort = (key: SortKey, additive: boolean) => {
    setSorts((current) => {
      const existing = current.find((l) => l.key === key);
      if (additive) {
        // Shift-click cycles this level: add ascending, flip to descending, then drop it.
        if (!existing) return [...current, { key, asc: true }];
        if (existing.asc)
          return current.map((l) => (l.key === key ? { ...l, asc: false } : l));
        const remaining = current.filter((l) => l.key !== key);
        return remaining.length > 0 ? remaining : DEFAULT_SORT;
      }
      if (current.length === 1 && existing) return [{ key, asc: !existing.asc }];
      return [{ key, asc: true }];
    });
  };

  const toggleGroup = (parentId: string) =>
    setCollapsed((current) =>
      current.includes(parentId)
        ? current.filter((id) => id !== parentId)
        : [...current, parentId],
    );

  // ── Selection ──────────────────────────────────────────────────────────────
  const selectable = Boolean(onBatchSchedule) && canEdit;
  /** Ids in the order they're on screen — what a shift-click range walks over. */
  const visibleIds = useMemo(() => rows.map((r) => r.asset.id), [rows]);
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  // Anything filtered out of view is dropped from the selection. Acting on rows the user
  // can no longer see is the failure mode this whole feature has to avoid.
  useEffect(() => {
    setSelectedIds((current) => {
      const kept = current.filter((id) => visibleIdSet.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [visibleIdSet]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedAssets = useMemo(
    () => rows.filter((r) => selectedSet.has(r.asset.id)).map((r) => r.asset),
    [rows, selectedSet],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  /** Shift-click ticks everything between the last click and this one. */
  const toggleRow = (assetId: string, withShift: boolean) => {
    setSelectedIds((current) => {
      if (withShift && lastClickedId) {
        const from = visibleIds.indexOf(lastClickedId);
        const to = visibleIds.indexOf(assetId);
        if (from >= 0 && to >= 0) {
          const range = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
          return Array.from(new Set([...current, ...range]));
        }
      }
      return current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId];
    });
    setLastClickedId(assetId);
  };

  const sortableHead = (key: SortKey, label: string) => {
    const level = sorts.findIndex((l) => l.key === key);
    const active = level >= 0;
    const Icon = active ? (sorts[level].asc ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead>
        <button
          type="button"
          onClick={(e) => toggleSort(key, e.shiftKey)}
          className="flex items-center gap-1 font-medium hover:text-brand"
          title={`Sort by ${label} — shift-click to add it as an extra level`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-brand" : "opacity-40"}`} />
          {active && sorts.length > 1 && (
            <span className="text-[10px] font-semibold text-brand">{level + 1}</span>
          )}
        </button>
      </TableHead>
    );
  };

  const showActions =
    canEdit ||
    Boolean(onAddReport) ||
    Boolean(onScheduleTest) ||
    Boolean(onRemoveFromJob);
  const columnCount = 6 + (showActions ? 1 : 0) + (selectable ? 1 : 0);
  const totalAssets = assets.length;
  const hasSubAssets = assets.some((a) => a.parent_asset_id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Wrapped rather than sized directly: Input puts className on the <input>, so
            an unwrapped one keeps its w-full wrapper and takes the whole row. */}
        <div className="w-full sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search identifier, location, type…"
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            options={buildingOptions}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={substationFilter}
            onChange={(e) => setSubstationFilter(e.target.value)}
            options={substationOptions}
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
      </div>

      {/* One strip, two states. The bulk bar replaces the count line rather than
          appearing above it, so ticking a row doesn't shove the table down the page. */}
      {selectable && selectedAssets.length > 0 ? (
        <div className="mb-2 flex min-h-[2.5rem] flex-wrap items-center gap-2 border border-brand/40 bg-brand/10 px-3 text-sm">
          <span className="font-medium">
            {selectedAssets.length} selected
            {!allVisibleSelected && visibleIds.length > selectedAssets.length && (
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onBatchSchedule?.(selectedAssets)}
            leftIcon={<CalendarPlus className="h-4 w-4" />}
          >
            Schedule test
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
      ) : (
        <div className="mb-2 flex min-h-[2.5rem] flex-wrap items-center gap-x-3 gap-y-1 px-3 text-sm text-neutral-500 dark:text-neutral-400">
          <span>
            {matchCount === totalAssets
              ? `${totalAssets} asset${totalAssets === 1 ? "" : "s"}`
              : `${matchCount} of ${totalAssets} assets`}
          </span>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span>
            Sorted by{" "}
            {(sorts.length > 0 ? sorts : DEFAULT_SORT).map((level, i) => (
              <span key={level.key}>
                {i > 0 && ", then "}
                <span className="text-neutral-700 dark:text-neutral-200">
                  {SORT_LABELS[level.key]}
                </span>{" "}
                {level.asc ? "↑" : "↓"}
              </span>
            ))}
            {!sorts.some((l) => l.key === "identifier") && ", then Identifier ↑"}
          </span>
          {sorts.length > 1 && (
            <button
              type="button"
              onClick={() => setSorts(DEFAULT_SORT)}
              className="text-brand hover:underline"
            >
              Reset sort
            </button>
          )}
          <span className="text-neutral-400 dark:text-neutral-500">
            Shift-click a column to sort by it as well.
          </span>
        </div>
      )}

      <div className="rounded-none border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
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
              {sortableHead("building_area", "Building / Area")}
              {sortableHead("substation", "Substation")}
              {sortableHead("identifier", "Identifier")}
              {sortableHead("equipment_location", "Equipment Location")}
              {sortableHead("equipment_type", "Equipment Type")}
              {sortableHead("report_count", "Reports")}
              {showActions && <TableHead className="w-[150px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-8 text-center text-neutral-500 dark:text-neutral-400"
                >
                  {totalAssets === 0 ? emptyMessage : "No assets match those filters."}
                </TableCell>
              </TableRow>
            ) : (
              rows.flatMap(({ asset, depth, children, childReports }) => {
                const isChild = depth === 1;
                const isCollapsed = collapsedSet.has(asset.id);
                const linkedReports = reportsByAsset?.get(asset.id) ?? [];
                const reportsExpanded = expandedReports.includes(asset.id);
                return [
                  <TableRow
                    key={asset.id}
                    className={
                      isChild ? "bg-neutral-50/60 dark:bg-dark-100/40" : undefined
                    }
                  >
                    {selectable && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedSet.has(asset.id)}
                          onChange={(e) =>
                            // Shift state rides on the click that produced the change;
                            // a keyboard toggle has no MouseEvent, so it reads false.
                            toggleRow(
                              asset.id,
                              (e.nativeEvent as MouseEvent).shiftKey === true,
                            )
                          }
                          aria-label={`Select ${asset.identifier}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>{asset.building_area || BLANK}</TableCell>
                    <TableCell>{asset.substation || BLANK}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {isChild ? (
                          <CornerDownRight className="ml-3 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        ) : children.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleGroup(asset.id)}
                            className="text-neutral-500 hover:text-brand"
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isCollapsed
                                ? `Show sub-assets of ${asset.identifier}`
                                : `Hide sub-assets of ${asset.identifier}`
                            }
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          hasSubAssets && <span className="w-4 shrink-0" />
                        )}
                        <span>{asset.identifier}</span>
                        {!isChild && children.length > 0 && (
                          <span className="ml-1 text-xs font-normal text-neutral-400">
                            ({children.length})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{asset.equipment_location || BLANK}</TableCell>
                    <TableCell>{asset.equipment_type || BLANK}</TableCell>
                    <TableCell>
                      {asset.report_count > 0 && linkedReports.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReports((current) =>
                              current.includes(asset.id)
                                ? current.filter((id) => id !== asset.id)
                                : [...current, asset.id],
                            )
                          }
                          className="font-medium text-brand hover:underline"
                          aria-expanded={reportsExpanded}
                          title={
                            reportsExpanded
                              ? "Hide linked reports"
                              : "Show linked reports"
                          }
                        >
                          {asset.report_count}
                        </button>
                      ) : asset.report_count > 0 ? (
                        <span className="font-medium text-brand">
                          {asset.report_count}
                        </span>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                      {childReports > 0 && (
                        <span
                          className="ml-1 text-xs text-neutral-400"
                          title={`${childReports} more on sub-assets`}
                        >
                          +{childReports}
                        </span>
                      )}
                    </TableCell>
                    {showActions && (
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          {onAddReport && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onAddReport(asset)}
                              aria-label={`Add report to ${asset.identifier}`}
                              title="Add report — new from a template, or link one that already exists"
                            >
                              <FilePlus2 className="h-4 w-4" />
                            </Button>
                          )}
                          {onScheduleTest && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onScheduleTest(asset)}
                              aria-label={`Schedule a test for ${asset.identifier}`}
                              title="Schedule test"
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              {/* Split button: the icon edits, the caret opens the
                                  menu holding everything you can't take back. */}
                              <div className="flex items-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onEdit(asset)}
                                  aria-label={`Edit ${asset.identifier}`}
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="-ml-1 px-0.5 py-1 text-neutral-500 hover:text-brand"
                                      aria-label={`More actions for ${asset.identifier}`}
                                      title="More actions"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(asset)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit asset…
                                    </DropdownMenuItem>

                                    {isChild && onDetachFromParent && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => onDetachFromParent(asset)}
                                        >
                                          <Unlink className="mr-2 h-4 w-4" />
                                          Unlink from parent
                                        </DropdownMenuItem>
                                      </>
                                    )}

                                    {onRemoveFromJob && (
                                      <DropdownMenuItem
                                        onClick={() => onRemoveFromJob(asset)}
                                      >
                                        <Link2Off className="mr-2 h-4 w-4" />
                                        Remove from this job
                                      </DropdownMenuItem>
                                    )}

                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={asset.report_count > 0}
                                      onClick={() => {
                                        if (asset.report_count === 0) onDelete(asset);
                                      }}
                                      className={
                                        asset.report_count > 0
                                          ? undefined
                                          : "text-destructive focus:text-destructive"
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {asset.report_count > 0
                                        ? "Delete — has linked reports"
                                        : "Delete asset"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDuplicate(asset)}
                                aria-label={`Duplicate ${asset.identifier}`}
                                title="Duplicate"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>,

                  reportsExpanded && linkedReports.length > 0 ? (
                    <TableRow
                      key={`${asset.id}-reports`}
                      className="bg-neutral-50 dark:bg-dark-100/60"
                    >
                      <TableCell colSpan={columnCount} className="py-2">
                        <div className="flex flex-col gap-1 pl-8">
                          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Reports on {asset.identifier}
                          </span>
                          {linkedReports.map((report) => (
                            <div key={report.id} className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                              {onOpenReport && report.url ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenReport(report)}
                                  className="text-left text-sm text-brand hover:underline"
                                >
                                  {report.name || "Untitled report"}
                                </button>
                              ) : (
                                <span className="text-sm text-neutral-700 dark:text-neutral-200">
                                  {report.name || "Untitled report"}
                                </span>
                              )}
                              {onDetachReport && (
                                <button
                                  type="button"
                                  onClick={() => onDetachReport(asset, report)}
                                  aria-label={`Unlink ${report.name || "this report"} from ${asset.identifier}`}
                                  title="Unlink this report from the asset (the report itself is kept)"
                                  className="ml-1 text-neutral-400 hover:text-destructive"
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {asset.report_count > linkedReports.length && (
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {asset.report_count - linkedReports.length} more on other
                              jobs at this site.
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EquipmentAssetsTable;
