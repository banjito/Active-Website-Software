import React, { useEffect, useMemo, useState } from "react";
import { FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import { linkReportDocumentToAsset } from "@/services/equipmentAssetsService";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";
import type { ExistingReportAsset } from "./AdoptExistingReportsDialog";

interface AttachReportsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The asset being attached to. */
  asset: EquipmentAssetWithCounts | null;
  /** Every report document on the job, with the identifier the job page parsed out. */
  reportAssets: ExistingReportAsset[];
  /** Identifier by equipment asset id, to name whoever currently owns a report. */
  assetNamesById: Map<string, string>;
  onDone: () => void;
}

/**
 * Point reports that already exist at a piece of equipment.
 *
 * Reports get generated straight from the job page all the time, without going through
 * the asset list, and assets get registered after the fact — so the link has to be
 * repairable from either end rather than only at creation time. Unchecking a report that
 * belongs to this asset detaches it again.
 */
export function AttachReportsDialog({
  open,
  onClose,
  asset,
  reportAssets,
  assetNamesById,
  onDone,
}: AttachReportsDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /** What was already linked to this asset when the dialog opened. */
  const initiallyLinked = useMemo(() => {
    const set = new Set<string>();
    if (!asset) return set;
    for (const r of reportAssets) {
      if (r.equipmentAssetId === asset.id) set.add(r.id);
    }
    return set;
  }, [reportAssets, asset]);

  useEffect(() => {
    if (open) {
      setSelected(new Set(initiallyLinked));
      setSearch("");
    }
  }, [open, initiallyLinked]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reportAssets
      .filter((r) => {
        if (!term) return true;
        return `${r.name ?? ""} ${r.identifier ?? ""} ${r.substation ?? ""}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        // Reports already on this asset first, then unlinked ones, then other assets' —
        // the ones you're most likely to act on are the ones you see without scrolling.
        const rank = (r: ExistingReportAsset) =>
          r.equipmentAssetId === asset?.id ? 0 : r.equipmentAssetId ? 2 : 1;
        const byRank = rank(a) - rank(b);
        if (byRank !== 0) return byRank;
        return compareAlphanumericLabels(a.name ?? "", b.name ?? "");
      });
  }, [reportAssets, search, asset]);

  const toAttach = useMemo(
    () => Array.from(selected).filter((id) => !initiallyLinked.has(id)),
    [selected, initiallyLinked],
  );
  const toDetach = useMemo(
    () => Array.from(initiallyLinked).filter((id) => !selected.has(id)),
    [selected, initiallyLinked],
  );

  const save = async () => {
    if (!asset || (toAttach.length === 0 && toDetach.length === 0)) return;
    setSaving(true);
    try {
      for (const reportId of toAttach) {
        await linkReportDocumentToAsset(reportId, asset.id);
      }
      for (const reportId of toDetach) {
        await linkReportDocumentToAsset(reportId, null);
      }
      const parts = [
        toAttach.length > 0 &&
          `${toAttach.length} report${toAttach.length === 1 ? "" : "s"} attached`,
        toDetach.length > 0 &&
          `${toDetach.length} detached`,
      ].filter(Boolean);
      toast.success(`${parts.join(", ")} — ${asset.identifier}`);
      onDone();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update report links");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Attach reports to {asset?.identifier}
          </DialogTitle>
          <DialogDescription>
            Pick the reports on this job that belong to this equipment. A report already
            attached to something else moves here; unticking one detaches it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="w-full sm:w-72"
          />

          {reportAssets.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              This job has no reports yet.
            </p>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto border border-neutral-200 dark:border-neutral-700">
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No reports match “{search}”.
                </p>
              ) : (
                visible.map((report) => {
                  const ownedByOther =
                    report.equipmentAssetId && report.equipmentAssetId !== asset?.id;
                  return (
                    <label
                      key={report.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(report.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(report.id)) next.delete(report.id);
                            else next.add(report.id);
                            return next;
                          })
                        }
                      />
                      <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="truncate font-medium">
                        {report.name || "Untitled report"}
                      </span>
                      {ownedByOther && (
                        <span className="ml-auto shrink-0 text-xs text-amber-600 dark:text-amber-400">
                          on{" "}
                          {assetNamesById.get(report.equipmentAssetId!) ??
                            "another asset"}
                        </span>
                      )}
                      {!report.equipmentAssetId && report.identifier && (
                        <span className="ml-auto shrink-0 text-xs text-neutral-400">
                          reads as {report.identifier}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          )}

          {(toAttach.length > 0 || toDetach.length > 0) && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {toAttach.length > 0 && <>{toAttach.length} to attach</>}
              {toAttach.length > 0 && toDetach.length > 0 && " · "}
              {toDetach.length > 0 && <>{toDetach.length} to detach</>}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || (toAttach.length === 0 && toDetach.length === 0)}
          >
            {saving ? "Saving…" : "Save links"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AttachReportsDialog;
