import React, { useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  FilePlus2,
  Link2Off,
  Pencil,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
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
  /** Job context only — opens the report template picker for this asset. */
  onCreateReport?: (asset: EquipmentAssetWithCounts) => void;
  /** Job context only — removes from the job's scope, leaving the asset at the site. */
  onRemoveFromJob?: (asset: EquipmentAssetWithCounts) => void;
  /** Detach a sub-asset from its parent. Omitted where sub-assets aren't available. */
  onDetachFromParent?: (asset: EquipmentAssetWithCounts) => void;
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
 */
export function EquipmentAssetsTable({
  assets,
  canEdit,
  onEdit,
  onDuplicate,
  onDelete,
  onCreateReport,
  onRemoveFromJob,
  onDetachFromParent,
  actions,
  emptyMessage = "No assets yet.",
  storageKey,
}: EquipmentAssetsTableProps) {
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
    canEdit || Boolean(onCreateReport) || Boolean(onRemoveFromJob);
  const columnCount = showActions ? 7 : 6;
  const totalAssets = assets.length;
  const hasSubAssets = assets.some((a) => a.parent_asset_id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search identifier, location, type…"
          className="w-full sm:w-64"
        />
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

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
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

      <div className="rounded-none border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
              rows.map(({ asset, depth, children, childReports }) => {
                const isChild = depth === 1;
                const isCollapsed = collapsedSet.has(asset.id);
                return (
                  <TableRow
                    key={asset.id}
                    className={
                      isChild ? "bg-neutral-50/60 dark:bg-dark-100/40" : undefined
                    }
                  >
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
                      {asset.report_count > 0 ? (
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
                        <div className="flex items-center gap-1">
                          {onCreateReport && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onCreateReport(asset)}
                              aria-label={`Create report for ${asset.identifier}`}
                              title="Create report"
                            >
                              <FilePlus2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEdit(asset)}
                                aria-label={`Edit ${asset.identifier}`}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
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
                          {canEdit && isChild && onDetachFromParent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDetachFromParent(asset)}
                              aria-label={`Detach ${asset.identifier} from its parent`}
                              title="Detach from parent asset"
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          )}
                          {onRemoveFromJob && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveFromJob(asset)}
                              aria-label={`Remove ${asset.identifier} from this job`}
                              title="Remove from this job (keeps the asset at the site)"
                            >
                              <Link2Off className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDelete(asset)}
                              disabled={asset.report_count > 0}
                              aria-label={`Delete ${asset.identifier}`}
                              title={
                                asset.report_count > 0
                                  ? "Has linked reports — cannot be deleted"
                                  : "Delete asset"
                              }
                            >
                              <Trash2
                                className={`h-4 w-4 ${asset.report_count > 0 ? "opacity-30" : "text-destructive"}`}
                              />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EquipmentAssetsTable;
