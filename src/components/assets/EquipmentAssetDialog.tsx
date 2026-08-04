import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import Select from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import { SuggestInput } from "./SuggestInput";
import {
  createEquipmentType,
  upsertEquipmentAsset,
} from "@/services/equipmentAssetsService";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

export interface AssetFieldSuggestions {
  buildingAreas: string[];
  substations: string[];
  locations: string[];
  equipmentTypes: string[];
}

interface EquipmentAssetDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  /** Null when adding. */
  asset: EquipmentAsset | null;
  suggestions: AssetFieldSuggestions;
  /**
   * Every asset at the site, for the parent picker. Left out where sub-assets aren't
   * available (the migration hasn't run), which hides the field entirely.
   */
  siteAssets?: EquipmentAsset[];
  userId?: string;
  /** Saved asset is handed back so the caller can link it to a job. */
  onSaved: (asset: EquipmentAsset, wasCreated: boolean) => void;
}

const NO_PARENT = "";

const emptyForm = {
  parent_asset_id: "",
  building_area: "",
  substation: "",
  identifier: "",
  equipment_location: "",
  equipment_type: "",
  manufacturer: "",
  model: "",
  serial_number: "",
  notes: "",
};

/**
 * Add or edit one piece of equipment. Deliberately creates nothing else — the whole point
 * is that you can record equipment without producing a report.
 */
export function EquipmentAssetDialog({
  open,
  onClose,
  siteId,
  siteName,
  asset,
  suggestions,
  siteAssets,
  userId,
  onSaved,
}: EquipmentAssetDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showNameplate, setShowNameplate] = useState(false);

  // One layer only: this asset can be nested under another unless it is already a parent
  // itself, and only top-level assets are offered as the parent.
  const ownSubAssetCount = useMemo(
    () =>
      asset ? (siteAssets ?? []).filter((a) => a.parent_asset_id === asset.id).length : 0,
    [siteAssets, asset],
  );

  const parentOptions = useMemo(() => {
    if (!siteAssets) return [];
    return [
      { value: NO_PARENT, label: "— none (top-level asset) —" },
      ...siteAssets
        .filter((a) => !a.parent_asset_id && a.id !== asset?.id)
        .sort((a, b) => compareAlphanumericLabels(a.identifier, b.identifier))
        .map((a) => {
          const context = [a.building_area, a.substation, a.equipment_type]
            .filter(Boolean)
            .join(" · ");
          return {
            value: a.id,
            label: context ? `${a.identifier} — ${context}` : a.identifier,
          };
        }),
    ];
  }, [siteAssets, asset]);

  useEffect(() => {
    if (!open) return;
    if (asset) {
      setForm({
        parent_asset_id: asset.parent_asset_id ?? "",
        building_area: asset.building_area ?? "",
        substation: asset.substation ?? "",
        identifier: asset.identifier ?? "",
        equipment_location: asset.equipment_location ?? "",
        equipment_type: asset.equipment_type ?? "",
        manufacturer: asset.manufacturer ?? "",
        model: asset.model ?? "",
        serial_number: asset.serial_number ?? "",
        notes: asset.notes ?? "",
      });
      setShowNameplate(
        Boolean(asset.manufacturer || asset.model || asset.serial_number),
      );
    } else {
      setForm(emptyForm);
      setShowNameplate(false);
    }
  }, [open, asset]);

  const set = (key: keyof typeof emptyForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.identifier.trim()) {
      toast.error("Identifier is required");
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertEquipmentAsset(
        {
          ...form,
          parent_asset_id: form.parent_asset_id || null,
          site_id: siteId,
          id: asset?.id,
        },
        userId,
      );

      // Remember a new equipment type so the next person picks the same wording.
      const typed = form.equipment_type.trim();
      if (typed && !suggestions.equipmentTypes.includes(typed)) {
        void createEquipmentType(typed);
      }

      toast.success(asset ? "Asset updated" : `${saved.identifier} added`);
      onSaved(saved, !asset);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            Equipment at {siteName}. No report is created — this is the equipment record
            itself, and it stays available to every job at this site.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SuggestInput
              label="Building / Area"
              value={form.building_area}
              onChange={set("building_area")}
              suggestions={suggestions.buildingAreas}
              placeholder="e.g. DC7"
            />
            <SuggestInput
              label="Substation"
              value={form.substation}
              onChange={set("substation")}
              suggestions={suggestions.substations}
              placeholder="e.g. Substation 3"
            />
          </div>

          <SuggestInput
            label="Identifier"
            required
            autoFocus
            value={form.identifier}
            onChange={set("identifier")}
            placeholder="e.g. CB-101"
            hint="Must be unique within this building and substation."
          />

          {siteAssets && (
            <div>
              <Label htmlFor="ea-parent">Part of</Label>
              {ownSubAssetCount > 0 ? (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  This asset has {ownSubAssetCount} sub-asset
                  {ownSubAssetCount === 1 ? "" : "s"} of its own, so it stays top-level —
                  sub-assets are limited to one layer.
                </p>
              ) : (
                <>
                  <Select
                    id="ea-parent"
                    value={form.parent_asset_id}
                    onChange={(e) => set("parent_asset_id")(e.target.value)}
                    options={parentOptions}
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Nest this under the equipment it belongs to — a switch, CT or relay
                    inside a switchgear lineup. It keeps its own reports and stays grouped
                    with its parent in the list.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SuggestInput
              label="Equipment Location"
              value={form.equipment_location}
              onChange={set("equipment_location")}
              suggestions={suggestions.locations}
              placeholder="e.g. Electrical Room 2"
            />
            <SuggestInput
              label="Equipment Type"
              value={form.equipment_type}
              onChange={set("equipment_type")}
              suggestions={suggestions.equipmentTypes}
              placeholder="e.g. Low Voltage Circuit Breaker"
              hint="Type anything — it does not lock in a report form."
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowNameplate((s) => !s)}
              className="flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-brand dark:text-neutral-300"
            >
              {showNameplate ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Nameplate (optional)
            </button>
            {showNameplate && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="ea-manufacturer">Manufacturer</Label>
                  <Input
                    id="ea-manufacturer"
                    value={form.manufacturer}
                    onChange={(e) => set("manufacturer")(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ea-model">Model</Label>
                  <Input
                    id="ea-model"
                    value={form.model}
                    onChange={(e) => set("model")(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ea-serial">Serial number</Label>
                  <Input
                    id="ea-serial"
                    value={form.serial_number}
                    onChange={(e) => set("serial_number")(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="ea-notes">Notes</Label>
            <Textarea
              id="ea-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : asset ? "Save" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EquipmentAssetDialog;
