import React, { useEffect, useMemo, useState } from "react";
import { FilePlus2, FileText, Search } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "react-hot-toast";
import { linkReportDocumentToAsset } from "@/services/equipmentAssetsService";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import {
  groupReportTemplates,
  useReportTemplateChoices,
  type ReportTemplateChoice,
} from "./useReportTemplateChoices";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";
import type { ExistingReportAsset } from "./AdoptExistingReportsDialog";

interface AddReportDialogProps {
  open: boolean;
  onClose: () => void;
  asset: EquipmentAssetWithCounts | null;
  /** Start a new report from a form. */
  onPickTemplate: (choice: ReportTemplateChoice) => void;
  /**
   * Report documents already on this job. Omit outside the job context — the "Link
   * existing" tab is hidden and the dialog behaves as a plain template picker.
   */
  reportAssets?: ExistingReportAsset[];
  /** Identifier by equipment asset id, to name whoever currently owns a report. */
  assetNamesById?: Map<string, string>;
  /** Called after report links change, so the job page can refresh its reports list. */
  onLinksChanged?: () => void;
}

/**
 * One doc-plus button for both ways a report attaches to a piece of equipment.
 *
 * These used to be two separate row icons, which meant six controls per row across a
 * couple of hundred rows with a destructive delete a pixel from a copy button. They are
 * the same intent — "this equipment needs a report on it" — so they're one modal with two
 * tabs, keeping the icon everyone's muscle memory already points at.
 */
export function AddReportDialog({
  open,
  onClose,
  asset,
  onPickTemplate,
  reportAssets,
  assetNamesById,
  onLinksChanged,
}: AddReportDialogProps) {
  const canLinkExisting = !!reportAssets && reportAssets.length > 0;
  const [tab, setTab] = useState("new");

  useEffect(() => {
    if (open) setTab("new");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5" />
            Add report to {asset?.identifier}
          </DialogTitle>
          <DialogDescription>
            A new report opens pre-filled with this asset's identifier, substation and
            nameplate.
          </DialogDescription>
        </DialogHeader>

        {canLinkExisting ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="new">New from template</TabsTrigger>
              <TabsTrigger value="existing">Link existing</TabsTrigger>
            </TabsList>
            <TabsContent value="new">
              <TemplateTab
                open={open && tab === "new"}
                onPick={(choice) => {
                  onPickTemplate(choice);
                  onClose();
                }}
              />
            </TabsContent>
            <TabsContent value="existing">
              <LinkExistingTab
                open={open && tab === "existing"}
                asset={asset}
                reportAssets={reportAssets ?? []}
                assetNamesById={assetNamesById ?? new Map()}
                onDone={() => {
                  onLinksChanged?.();
                  onClose();
                }}
                onCancel={onClose}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <TemplateTab
            open={open}
            onPick={(choice) => {
              onPickTemplate(choice);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 1: new from template ──────────────────────────────────────────────────

/**
 * Equipment type deliberately does not filter this list. It's free text, and locking
 * someone out of the form they need because their spreadsheet said "MV Breaker" instead
 * of "Medium Voltage Circuit Breaker" is a worse failure than a long list.
 */
function TemplateTab({
  open,
  onPick,
}: {
  open: boolean;
  onPick: (choice: ReportTemplateChoice) => void;
}) {
  const { choices } = useReportTemplateChoices(open);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const groups = useMemo(
    () => groupReportTemplates(choices, search),
    [choices, search],
  );

  return (
    <div className="pt-2">
      <Input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search report types…"
        leftIcon={<Search className="h-4 w-4" />}
      />

      <div className="max-h-[52vh] overflow-y-auto border border-neutral-200 dark:border-neutral-700">
        {groups.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No report types match “{search}”.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-300">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tab 2: link a report that already exists ──────────────────────────────────

/**
 * Reports get generated straight from the job page all the time, and assets get
 * registered after the fact — so the link has to be repairable from either end rather
 * than only at creation time. Unticking a report that belongs to this asset detaches it.
 */
function LinkExistingTab({
  open,
  asset,
  reportAssets,
  assetNamesById,
  onDone,
  onCancel,
}: {
  open: boolean;
  asset: EquipmentAssetWithCounts | null;
  reportAssets: ExistingReportAsset[];
  assetNamesById: Map<string, string>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /** What was already linked to this asset when the tab opened. */
  const initiallyLinked = useMemo(() => {
    const set = new Set<string>();
    if (!asset) return set;
    for (const r of reportAssets) {
      if (r.equipmentAssetId === asset.id) set.add(r.id);
    }
    return set;
  }, [reportAssets, asset]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initiallyLinked));
    setSearch("");
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
        // the ones you're most likely to act on are visible without scrolling.
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
        toDetach.length > 0 && `${toDetach.length} detached`,
      ].filter(Boolean);
      toast.success(`${parts.join(", ")} — ${asset.identifier}`);
      onDone();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update report links");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search reports on this job…"
        leftIcon={<Search className="h-4 w-4" />}
      />

      <div className="max-h-[45vh] overflow-y-auto border border-neutral-200 dark:border-neutral-700">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {reportAssets.length === 0
              ? "This job has no reports yet."
              : `No reports match “${search}”.`}
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
                    on {assetNamesById.get(report.equipmentAssetId!) ?? "another asset"}
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

      {(toAttach.length > 0 || toDetach.length > 0) && (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {toAttach.length > 0 && <>{toAttach.length} to attach</>}
          {toAttach.length > 0 && toDetach.length > 0 && " · "}
          {toDetach.length > 0 && <>{toDetach.length} to detach</>}
        </p>
      )}

      <DialogFooter className="mt-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={saving || (toAttach.length === 0 && toDetach.length === 0)}
        >
          {saving ? "Saving…" : "Save links"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default AddReportDialog;
