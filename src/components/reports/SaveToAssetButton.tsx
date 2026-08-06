import React, { useMemo, useState } from "react";
import { ArrowRight, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import {
  applyReportDataToAsset,
  diffReportAgainstAsset,
  type AssetFieldUpdate,
} from "@/services/equipmentAssetsService";
import { getNameplateSchema } from "@/lib/assetNameplateSchema";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

interface SaveToAssetButtonProps {
  /** The asset this report describes. Null when the report isn't linked to one. */
  asset: EquipmentAsset | null;
  /** What the report currently holds. Blank values are ignored, never written. */
  values: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    /** Type-specific values keyed as in assetNameplateSchema.ts. */
    nameplate?: Record<string, string>;
  };
  userId?: string;
  /** Lets the report refresh its idea of the asset after a write. */
  onSaved?: (asset: EquipmentAsset) => void;
  className?: string;
}

/**
 * "Save to asset" — pushes what the tech just recorded onto the equipment record.
 *
 * The registry can't be filled in from the office: a serial number is only knowable with
 * the device in front of you. Making techs register equipment before writing a report, or
 * type the same serial into both, are the two failure modes this exists to prevent. So
 * the report is where the data is captured, and this is how it gets promoted.
 *
 * Renders nothing when the report isn't linked to an asset, or when it has nothing new to
 * offer — a report opened from an asset row was prefilled from it, so on first save there
 * is genuinely nothing to push and a button would be noise.
 */
export function SaveToAssetButton({
  asset,
  values,
  userId,
  onSaved,
  className,
}: SaveToAssetButtonProps) {
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /** Field labels for this equipment type, so the dialog doesn't show raw JSON keys. */
  const labels = useMemo(() => {
    const schema = getNameplateSchema(asset?.equipment_type);
    const map: Record<string, string> = {};
    for (const field of schema?.fields ?? []) map[field.key] = field.label;
    return map;
  }, [asset?.equipment_type]);

  const updates = useMemo(
    () => (asset ? diffReportAgainstAsset(asset, values, labels) : []),
    [asset, values, labels],
  );

  const selected = useMemo(
    () => updates.filter((u) => !skipped.includes(u.field)),
    [updates, skipped],
  );

  if (!asset || updates.length === 0) return null;

  const conflicts = updates.filter((u) => u.conflicts).length;

  const apply = async () => {
    setSaving(true);
    try {
      const saved = await applyReportDataToAsset(asset, selected, userId);
      toast.success(
        `${selected.length} field${selected.length === 1 ? "" : "s"} saved to ${asset.identifier}`,
      );
      onSaved?.(saved);
      setOpen(false);
      setSkipped([]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save to asset");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (update: AssetFieldUpdate) =>
    setSkipped((current) =>
      current.includes(update.field)
        ? current.filter((f) => f !== update.field)
        : [...current, update.field],
    );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        leftIcon={<HardDrive className="h-4 w-4" />}
        className={className}
      >
        Save to asset ({updates.length})
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Save to {asset.identifier}</DialogTitle>
            <DialogDescription>
              These values are on the report but not yet on the equipment record. Saving
              them means nobody has to type them again on the next report for this device.
            </DialogDescription>
          </DialogHeader>

          <div className="border border-neutral-200 dark:border-neutral-700">
            {updates.map((update) => {
              const included = !skipped.includes(update.field);
              return (
                <label
                  key={update.field}
                  className="flex cursor-pointer items-start gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 dark:border-neutral-800"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={included}
                    onChange={() => toggle(update)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{update.label}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      {update.current ? (
                        <span className="text-neutral-500 line-through dark:text-neutral-400">
                          {update.current}
                        </span>
                      ) : (
                        <span className="text-neutral-400">(empty)</span>
                      )}
                      <ArrowRight className="h-3 w-3 shrink-0 text-neutral-400" />
                      <span className="font-medium text-brand">{update.incoming}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {conflicts > 0 && (
            <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {conflicts} of these would replace a value already on the asset. Untick
              anything the report has wrong.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={saving || selected.length === 0}>
              {saving
                ? "Saving…"
                : `Save ${selected.length} field${selected.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SaveToAssetButton;
