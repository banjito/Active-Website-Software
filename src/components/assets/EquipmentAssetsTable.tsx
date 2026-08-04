import React, { useMemo, useState } from "react";
import { ArrowUpDown, Copy, FilePlus2, Link2Off, Pencil, Trash2 } from "lucide-react";
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
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";

type SortKey =
  | "identifier"
  | "building_area"
  | "substation"
  | "equipment_location"
  | "equipment_type"
  | "report_count";

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
  /** Rendered above the table, right of the filters. */
  actions?: React.ReactNode;
  emptyMessage?: string;
}

const BLANK = "—";

/**
 * The asset list. Shared by the site registry and the job's asset tab; the job passes the
 * extra Create Report / Remove actions.
 */
export function EquipmentAssetsTable({
  assets,
  canEdit,
  onEdit,
  onDuplicate,
  onDelete,
  onCreateReport,
  onRemoveFromJob,
  actions,
  emptyMessage = "No assets yet.",
}: EquipmentAssetsTableProps) {
  const [search, setSearch] = useState("");
  const [substationFilter, setSubstationFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("identifier");
  const [sortAsc, setSortAsc] = useState(true);

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

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = assets.filter((a) => {
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
    });

    const direction = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "report_count") {
        return (a.report_count - b.report_count) * direction;
      }
      // Alphanumeric so CB-2 sorts before CB-10, not after it.
      return (
        compareAlphanumericLabels(
          String(a[sortKey] ?? ""),
          String(b[sortKey] ?? ""),
        ) * direction
      );
    });
  }, [assets, search, substationFilter, buildingFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((s) => !s);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortableHead = (key: SortKey, label: string) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 font-medium hover:text-brand"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${sortKey === key ? "text-brand" : "opacity-40"}`}
        />
      </button>
    </TableHead>
  );

  const showActions =
    canEdit || Boolean(onCreateReport) || Boolean(onRemoveFromJob);

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

      <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
        {visible.length === assets.length
          ? `${assets.length} asset${assets.length === 1 ? "" : "s"}`
          : `${visible.length} of ${assets.length} assets`}
      </p>

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
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showActions ? 7 : 6}
                  className="py-8 text-center text-neutral-500 dark:text-neutral-400"
                >
                  {assets.length === 0 ? emptyMessage : "No assets match those filters."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>{asset.building_area || BLANK}</TableCell>
                  <TableCell>{asset.substation || BLANK}</TableCell>
                  <TableCell className="font-medium">{asset.identifier}</TableCell>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EquipmentAssetsTable;
