import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import { bulkInsertEquipmentAssets } from "@/services/equipmentAssetsService";
import type {
  EquipmentAsset,
  EquipmentAssetInput,
} from "@/lib/types/assetTracking";

/**
 * Split an identifier into its trailing number and everything before it, keeping the
 * zero padding: "CB-101" -> { prefix: "CB-", number: 101, width: 3 }.
 * Returns null when there is no trailing number to count from.
 */
export function splitTrailingNumber(
  identifier: string,
): { prefix: string; suffix: string; number: number; width: number } | null {
  const match = identifier.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    width: match[2].length,
    suffix: match[3],
  };
}

/** CB-101 + 3 -> [CB-102, CB-103, CB-104]. Padding is preserved: CB-009 -> CB-010. */
export function buildDuplicateIdentifiers(
  identifier: string,
  count: number,
): string[] {
  const parts = splitTrailingNumber(identifier);
  if (!parts) {
    // No number to increment — fall back to a plain numeric suffix.
    return Array.from({ length: count }, (_, i) => `${identifier}-${i + 2}`);
  }
  return Array.from({ length: count }, (_, i) => {
    const next = String(parts.number + i + 1).padStart(parts.width, "0");
    return `${parts.prefix}${next}${parts.suffix}`;
  });
}

interface DuplicateAssetDialogProps {
  open: boolean;
  onClose: () => void;
  asset: EquipmentAsset | null;
  existingIdentifiers: Set<string>;
  userId?: string;
  onDone: (created: EquipmentAsset[]) => void;
}

const MAX_COUNT = 500;

/**
 * Make N copies of an asset with an incrementing identifier — the fast way to lay in
 * CB-101 … CB-125 without typing each one.
 */
export function DuplicateAssetDialog({
  open,
  onClose,
  asset,
  existingIdentifiers,
  userId,
  onDone,
}: DuplicateAssetDialogProps) {
  const [countText, setCountText] = useState("10");
  const [saving, setSaving] = useState(false);

  const count = Math.min(Math.max(parseInt(countText, 10) || 0, 0), MAX_COUNT);

  const preview = useMemo(() => {
    if (!asset || count === 0) return [];
    return buildDuplicateIdentifiers(asset.identifier, count);
  }, [asset, count]);

  const collisions = useMemo(
    () => preview.filter((id) => existingIdentifiers.has(id.toLowerCase())),
    [preview, existingIdentifiers],
  );

  const toCreate = useMemo(
    () => preview.filter((id) => !existingIdentifiers.has(id.toLowerCase())),
    [preview, existingIdentifiers],
  );

  const run = async () => {
    if (!asset || toCreate.length === 0) return;
    setSaving(true);
    try {
      const inputs: EquipmentAssetInput[] = toCreate.map((identifier) => ({
        site_id: asset.site_id,
        identifier,
        // Copies of a sub-asset stay under the same parent — duplicating CT-1 inside a
        // switchgear is exactly how you lay in CT-2 … CT-12.
        parent_asset_id: asset.parent_asset_id ?? null,
        building_area: asset.building_area ?? null,
        substation: asset.substation ?? null,
        equipment_location: asset.equipment_location ?? null,
        equipment_type: asset.equipment_type ?? null,
        manufacturer: asset.manufacturer ?? null,
        model: asset.model ?? null,
        serial_number: null, // serials are unique per unit — never copy them
        notes: asset.notes ?? null,
      }));

      const result = await bulkInsertEquipmentAssets(inputs, userId);
      toast.success(
        `Created ${result.inserted.length} asset${result.inserted.length === 1 ? "" : "s"}`,
      );
      onDone(result.inserted);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to duplicate asset");
    } finally {
      setSaving(false);
    }
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Duplicate {asset.identifier}</DialogTitle>
          <DialogDescription>
            Copies the building, substation, location and type. Serial numbers are not
            copied.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div>
            <Label htmlFor="dup-count">How many copies?</Label>
            <Input
              id="dup-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              className="w-32"
            />
          </div>

          {preview.length > 0 && (
            <div className="rounded-none border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              <p className="mb-1 font-medium text-neutral-700 dark:text-neutral-200">
                Will create {toCreate.length} asset
                {toCreate.length === 1 ? "" : "s"}:
              </p>
              <p className="break-words text-neutral-600 dark:text-neutral-400">
                {preview.slice(0, 6).join(", ")}
                {preview.length > 6 && ` … ${preview[preview.length - 1]}`}
              </p>
              {collisions.length > 0 && (
                <p className="mt-2 text-amber-600 dark:text-amber-400">
                  {collisions.length} already exist and will be skipped:{" "}
                  {collisions.slice(0, 4).join(", ")}
                  {collisions.length > 4 && " …"}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={run} disabled={saving || toCreate.length === 0}>
            {saving ? "Creating…" : `Create ${toCreate.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DuplicateAssetDialog;
