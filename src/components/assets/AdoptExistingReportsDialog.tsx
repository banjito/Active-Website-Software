import React, { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { toast } from "react-hot-toast";
import {
  bulkInsertEquipmentAssets,
  linkAssetsToJob,
  linkReportDocumentToAsset,
} from "@/services/equipmentAssetsService";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type { EquipmentAssetInput } from "@/lib/types/assetTracking";

/**
 * A report document already on the job, with the identifier and substation the job page
 * has already worked out for it.
 */
export interface ExistingReportAsset {
  id: string;
  identifier: string;
  substation: string;
  /** Already linked to an equipment asset — nothing to adopt. */
  equipmentAssetId?: string | null;
}

interface AdoptExistingReportsDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  siteId: string;
  siteName: string;
  reportAssets: ExistingReportAsset[];
  /** Lowercased identifiers already registered at the site. */
  existingIdentifiers: Set<string>;
  /** Site asset id by lowercased identifier, for reports whose equipment already exists. */
  assetIdByIdentifier: Map<string, string>;
  userId?: string;
  onDone: () => void;
}

const PREVIEW_ROWS = 10;

/**
 * Turn the reports already on a job into real asset records.
 *
 * Reports built before the registry existed encode their equipment in the asset name
 * ("<Report Type> - CB-101"). The job page already parses that out, so we reuse its
 * result rather than re-deriving it. Safe to run twice: reports that are already linked
 * are skipped, and identifiers that already exist at the site get linked to the existing
 * asset instead of creating a duplicate.
 */
export function AdoptExistingReportsDialog({
  open,
  onClose,
  jobId,
  siteId,
  siteName,
  reportAssets,
  existingIdentifiers,
  assetIdByIdentifier,
  userId,
  onDone,
}: AdoptExistingReportsDialogProps) {
  const [running, setRunning] = useState(false);

  /** One row per distinct identifier found across the job's reports. */
  const plan = useMemo(() => {
    const byIdentifier = new Map<
      string,
      {
        identifier: string;
        substation: string;
        reportAssetIds: string[];
        existingAssetId?: string;
      }
    >();

    for (const report of reportAssets) {
      if (report.equipmentAssetId) continue; // already adopted
      const identifier = report.identifier?.trim();
      if (!identifier) continue;

      const key = identifier.toLowerCase();
      const entry = byIdentifier.get(key);
      if (entry) {
        entry.reportAssetIds.push(report.id);
        if (!entry.substation && report.substation) entry.substation = report.substation;
      } else {
        byIdentifier.set(key, {
          identifier,
          substation: report.substation?.trim() ?? "",
          reportAssetIds: [report.id],
          existingAssetId: assetIdByIdentifier.get(key),
        });
      }
    }

    return Array.from(byIdentifier.values()).sort((a, b) =>
      compareAlphanumericLabels(a.identifier, b.identifier),
    );
  }, [reportAssets, existingIdentifiers, assetIdByIdentifier]);

  const toCreate = plan.filter((p) => !p.existingAssetId);
  const toReuse = plan.filter((p) => p.existingAssetId);
  const linkedReportCount = plan.reduce((n, p) => n + p.reportAssetIds.length, 0);
  const skippedNoIdentifier = reportAssets.filter(
    (r) => !r.equipmentAssetId && !r.identifier?.trim(),
  ).length;

  const run = async () => {
    if (plan.length === 0) return;
    setRunning(true);
    try {
      // 1. Create the assets that don't exist at the site yet.
      const inputs: EquipmentAssetInput[] = toCreate.map((p) => ({
        site_id: siteId,
        identifier: p.identifier,
        substation: p.substation || null,
        building_area: null,
        equipment_location: null,
        equipment_type: null,
        manufacturer: null,
        model: null,
        serial_number: null,
        notes: null,
      }));
      const created = await bulkInsertEquipmentAssets(inputs, userId);

      // 2. Resolve every identifier to an equipment asset id.
      const resolved = new Map<string, string>();
      for (const p of toReuse) resolved.set(p.identifier.toLowerCase(), p.existingAssetId!);
      for (const asset of created.inserted) {
        resolved.set(asset.identifier.toLowerCase(), asset.id);
      }

      // 3. Put them on the job and point each report document at its equipment.
      await linkAssetsToJob(jobId, Array.from(new Set(resolved.values())), userId);

      let linkedReports = 0;
      for (const p of plan) {
        const equipmentAssetId = resolved.get(p.identifier.toLowerCase());
        if (!equipmentAssetId) continue;
        for (const reportAssetId of p.reportAssetIds) {
          await linkReportDocumentToAsset(reportAssetId, equipmentAssetId);
          linkedReports++;
        }
      }

      toast.success(
        `Created ${created.inserted.length} assets and linked ${linkedReports} reports`,
      );
      onDone();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to adopt reports");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Build assets from existing reports
          </DialogTitle>
          <DialogDescription>
            Reads the equipment identifiers off the reports already on this job and
            registers them at {siteName}. Nothing is deleted, and running it again does
            nothing new.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {plan.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nothing to adopt — every report on this job is either already linked to an
              asset or has no identifier to read.
            </p>
          ) : (
            <>
              <div className="border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                <p className="text-neutral-700 dark:text-neutral-200">
                  <strong>{toCreate.length}</strong> new asset
                  {toCreate.length === 1 ? "" : "s"} will be created
                  {toReuse.length > 0 && (
                    <>
                      {" "}
                      and <strong>{toReuse.length}</strong> matched to equipment already at
                      the site
                    </>
                  )}
                  , linking <strong>{linkedReportCount}</strong> report
                  {linkedReportCount === 1 ? "" : "s"}.
                </p>
                {skippedNoIdentifier > 0 && (
                  <p className="mt-1 text-amber-600 dark:text-amber-400">
                    {skippedNoIdentifier} report
                    {skippedNoIdentifier === 1 ? " has" : "s have"} no identifier and will
                    be left alone.
                  </p>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-none border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Substation</TableHead>
                      <TableHead>Reports</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.slice(0, PREVIEW_ROWS).map((p) => (
                      <TableRow key={p.identifier}>
                        <TableCell className="font-medium">{p.identifier}</TableCell>
                        <TableCell>{p.substation || "—"}</TableCell>
                        <TableCell>{p.reportAssetIds.length}</TableCell>
                        <TableCell>
                          {p.existingAssetId ? (
                            <span className="text-neutral-500 dark:text-neutral-400">
                              Link to existing
                            </span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">
                              Create
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {plan.length > PREVIEW_ROWS && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Showing the first {PREVIEW_ROWS} of {plan.length}.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button onClick={run} disabled={running || plan.length === 0}>
            {running ? "Working…" : `Adopt ${plan.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdoptExistingReportsDialog;
