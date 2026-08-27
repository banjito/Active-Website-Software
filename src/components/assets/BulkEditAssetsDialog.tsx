import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import Select from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
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
  NAMEPLATE_SCHEMAS,
  getNameplateSchema,
  reconcileNameplateData,
  type NameplateField,
} from "@/lib/assetNameplateSchema";
import {
  bulkUpdateEquipmentAssets,
  createEquipmentType,
  type BulkAssetUpdate,
} from "@/services/equipmentAssetsService";
import type {
  EquipmentAsset,
  EquipmentAssetWithCounts,
} from "@/lib/types/assetTracking";
import type { AssetFieldSuggestions } from "./EquipmentAssetDialog";
import { SuggestInput } from "./SuggestInput";

/** A plain column on the asset that can be set for the whole selection at once. */
type EditableColumn =
  | "building_area"
  | "substation"
  | "equipment_location"
  | "equipment_type"
  | "manufacturer"
  | "model"
  | "serial_number"
  | "notes";

const COLUMN_LABELS: Record<EditableColumn, string> = {
  building_area: "Building / Area",
  substation: "Substation",
  equipment_location: "Equipment Location",
  equipment_type: "Equipment Type",
  manufacturer: "Manufacturer",
  model: "Model / Catalog no.",
  serial_number: "Serial number",
  notes: "Notes",
};

/**
 * Serial numbers are the one thing that is genuinely per-device. Setting them in bulk is
 * allowed — sometimes a whole lot really does share one — but it says so out loud.
 */
const WARN_COLUMNS: Partial<Record<EditableColumn, string>> = {
  serial_number: "Every selected asset gets the same serial number.",
};

interface BulkEditAssetsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The ticked assets. The dialog is meaningless with none, and closes itself. */
  assets: EquipmentAssetWithCounts[];
  suggestions: AssetFieldSuggestions;
  userId?: string;
  /** Every asset that came back changed, so the list can patch itself in place. */
  onSaved: (updated: EquipmentAsset[]) => void;
}

/** One row of the form: is this field being changed, and to what. */
interface FieldState {
  enabled: boolean;
  value: string;
}

const blank = (): FieldState => ({ enabled: false, value: "" });

/**
 * Change the same fields on many assets at once.
 *
 * The case this exists for: you find out that all 40 MECH panel breakers are the same
 * make and catalog number, with only the serial numbers differing. Tick the fields you
 * know, type them once, and they land on every selected asset. Anything left unticked is
 * not touched — an empty box is only ever a deliberate "clear this".
 */
export function BulkEditAssetsDialog({
  open,
  onClose,
  assets,
  suggestions,
  userId,
  onSaved,
}: BulkEditAssetsDialogProps) {
  const [columns, setColumns] = useState<Record<EditableColumn, FieldState>>(
    () =>
      Object.fromEntries(
        (Object.keys(COLUMN_LABELS) as EditableColumn[]).map((k) => [k, blank()]),
      ) as Record<EditableColumn, FieldState>,
  );
  const [nameplate, setNameplate] = useState<Record<string, FieldState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setColumns(
      Object.fromEntries(
        (Object.keys(COLUMN_LABELS) as EditableColumn[]).map((k) => [k, blank()]),
      ) as Record<EditableColumn, FieldState>,
    );
    setNameplate({});
  }, [open]);

  /** The distinct equipment types in the selection, as typed on the assets. */
  const selectedTypes = useMemo(() => {
    const types = new Set<string>();
    for (const asset of assets) types.add(asset.equipment_type?.trim() || "");
    return [...types];
  }, [assets]);

  const typeChange = columns.equipment_type;
  /**
   * Which nameplate fields to offer.
   *
   * Nameplate keys belong to an equipment type, so they are only safe to edit in bulk when
   * the whole selection is one type — either because it already is, or because this edit
   * is about to make it one.
   */
  const targetSchema = useMemo(() => {
    if (typeChange.enabled) return getNameplateSchema(typeChange.value);
    return selectedTypes.length === 1 ? getNameplateSchema(selectedTypes[0]) : null;
  }, [typeChange, selectedTypes]);

  const typeSuggestions = useMemo(() => {
    const all = new Set([
      ...suggestions.equipmentTypes,
      ...NAMEPLATE_SCHEMAS.map((s) => s.type),
    ]);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [suggestions.equipmentTypes]);

  const setColumn = (key: EditableColumn, patch: Partial<FieldState>) =>
    setColumns((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const setNameplateField = (key: string, patch: Partial<FieldState>) =>
    setNameplate((prev) => ({ ...prev, [key]: { ...(prev[key] ?? blank()), ...patch } }));

  const enabledColumns = (Object.keys(COLUMN_LABELS) as EditableColumn[]).filter(
    (k) => columns[k].enabled,
  );
  const enabledNameplate = Object.keys(nameplate).filter((k) => nameplate[k]?.enabled);
  const changeCount = enabledColumns.length + enabledNameplate.length;

  /** What a blank-but-ticked field will wipe, so the confirm can name it. */
  const clearing = useMemo(() => {
    const out: string[] = [];
    for (const key of enabledColumns) {
      if (!columns[key].value.trim()) out.push(COLUMN_LABELS[key]);
    }
    if (targetSchema) {
      for (const key of enabledNameplate) {
        if (!nameplate[key].value.trim()) {
          out.push(targetSchema.fields.find((f) => f.key === key)?.label ?? key);
        }
      }
    }
    return out;
  }, [enabledColumns, enabledNameplate, columns, nameplate, targetSchema]);

  const save = async () => {
    if (changeCount === 0) return;

    // Changing the type changes which nameplate fields exist. Values the new type has no
    // home for would vanish silently, so count them first and say so.
    const nextType = typeChange.enabled ? typeChange.value.trim() : null;
    let droppedValues = 0;
    if (nextType !== null) {
      for (const asset of assets) {
        droppedValues += reconcileNameplateData(
          (asset.nameplate_data as Record<string, string>) ?? {},
          nextType,
        ).cleared.length;
      }
    }

    const warnings: string[] = [];
    if (clearing.length > 0) {
      warnings.push(
        `Clear ${clearing.join(", ")} on all ${assets.length} — those boxes are ticked but empty.`,
      );
    }
    if (droppedValues > 0) {
      warnings.push(
        `Drop ${droppedValues} nameplate value${droppedValues === 1 ? "" : "s"} that "${nextType || "(no type)"}" has no field for.`,
      );
    }
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `This will also:\n\n${warnings.map((w) => `  • ${w}`).join("\n")}\n\nContinue?`,
      );
      if (!proceed) return;
    }

    const updates: BulkAssetUpdate[] = assets.map((asset) => {
      const patch: BulkAssetUpdate["patch"] = {};
      for (const key of enabledColumns) {
        patch[key] = columns[key].value.trim() || null;
      }

      // Nameplate is merged, never replaced: a bulk change to the frame size must leave
      // the trip unit already recorded on each asset alone.
      const existing = (asset.nameplate_data as Record<string, string>) ?? {};
      const base =
        nextType !== null ? reconcileNameplateData(existing, nextType).kept : { ...existing };
      if (enabledNameplate.length > 0 || nextType !== null) {
        for (const key of enabledNameplate) {
          const value = nameplate[key].value.trim();
          if (value) base[key] = value;
          else delete base[key];
        }
        patch.nameplate_data = base;
      }

      return { id: asset.id, identifier: asset.identifier, patch };
    });

    setSaving(true);
    try {
      const result = await bulkUpdateEquipmentAssets(updates, userId);

      // Remember a type nobody has used before, the same as the single-asset dialog does.
      if (nextType && !suggestions.equipmentTypes.includes(nextType)) {
        void createEquipmentType(nextType);
      }

      if (result.updated.length > 0) {
        toast.success(
          `Updated ${result.updated.length} asset${result.updated.length === 1 ? "" : "s"}`,
        );
        onSaved(result.updated);
      }
      if (result.failed.length > 0) {
        const first = result.failed[0];
        toast.error(
          result.failed.length === 1
            ? `${first.identifier}: ${first.reason}`
            : `${result.failed.length} assets could not be updated — first was ${first.identifier}: ${first.reason}`,
        );
      }
      if (result.failed.length === 0) onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Bulk edit failed");
    } finally {
      setSaving(false);
    }
  };

  /** One ticked field: the checkbox owns whether it is written at all. */
  const fieldRow = (
    key: string,
    label: string,
    state: FieldState,
    onChange: (patch: Partial<FieldState>) => void,
    control: React.ReactNode,
    warning?: string,
  ) => (
    <div key={key} className={state.enabled ? "" : "opacity-60"}>
      <label className="mb-1 flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        {label}
      </label>
      {control}
      {state.enabled && warning && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{warning}</p>
      )}
    </div>
  );

  const textControl = (key: EditableColumn, hints?: string[], placeholder?: string) => (
    <Input
      value={columns[key].value}
      disabled={!columns[key].enabled}
      list={hints && hints.length > 0 ? `bulk-${key}-list` : undefined}
      placeholder={columns[key].enabled ? (placeholder ?? "Leave blank to clear") : ""}
      onChange={(e) => setColumn(key, { value: e.target.value })}
    />
  );

  const nameplateControl = (field: NameplateField) => {
    const state = nameplate[field.key] ?? blank();
    if (field.options) {
      return (
        <Select
          value={state.value}
          disabled={!state.enabled}
          onChange={(e) => setNameplateField(field.key, { value: e.target.value })}
          options={[
            { value: "", label: "—" },
            ...field.options.map((o) => ({ value: o, label: o })),
          ]}
        />
      );
    }
    return (
      <Input
        value={state.value}
        disabled={!state.enabled}
        placeholder={state.enabled ? (field.placeholder ?? "Leave blank to clear") : ""}
        onChange={(e) => setNameplateField(field.key, { value: e.target.value })}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>
            Edit {assets.length} asset{assets.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Tick a field to change it on every selected asset. Untick fields are left
            exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700">
            <span className="text-neutral-500 dark:text-neutral-400">Selected: </span>
            {assets
              .slice(0, 6)
              .map((a) => a.identifier)
              .join(", ")}
            {assets.length > 6 && ` and ${assets.length - 6} more`}
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {selectedTypes.length === 1
                ? `All ${selectedTypes[0] || "untyped"}`
                : `${selectedTypes.length} different equipment types`}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {fieldRow(
              "building_area",
              COLUMN_LABELS.building_area,
              columns.building_area,
              (p) => setColumn("building_area", p),
              <>
                {textControl("building_area", suggestions.buildingAreas)}
                <datalist id="bulk-building_area-list">
                  {suggestions.buildingAreas.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>,
            )}
            {fieldRow(
              "substation",
              COLUMN_LABELS.substation,
              columns.substation,
              (p) => setColumn("substation", p),
              <>
                {textControl("substation", suggestions.substations)}
                <datalist id="bulk-substation-list">
                  {suggestions.substations.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>,
              "Moving assets between buildings or substations can clash with an identifier already there.",
            )}
            {fieldRow(
              "equipment_location",
              COLUMN_LABELS.equipment_location,
              columns.equipment_location,
              (p) => setColumn("equipment_location", p),
              <>
                {textControl("equipment_location", suggestions.locations)}
                <datalist id="bulk-equipment_location-list">
                  {suggestions.locations.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>,
            )}
            <div className={columns.equipment_type.enabled ? "" : "opacity-60"}>
              <label className="mb-1 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={columns.equipment_type.enabled}
                  onChange={(e) =>
                    setColumn("equipment_type", { enabled: e.target.checked })
                  }
                />
                {COLUMN_LABELS.equipment_type}
              </label>
              <Input
                value={columns.equipment_type.value}
                disabled={!columns.equipment_type.enabled}
                list="bulk-equipment_type-list"
                placeholder={
                  columns.equipment_type.enabled ? "e.g. Medium Voltage Cable" : ""
                }
                onChange={(e) => setColumn("equipment_type", { value: e.target.value })}
              />
              <datalist id="bulk-equipment_type-list">
                {typeSuggestions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              {columns.equipment_type.enabled && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Setting one type for the whole selection unlocks its nameplate fields
                  below.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(["manufacturer", "model", "serial_number"] as EditableColumn[]).map((key) =>
              fieldRow(
                key,
                COLUMN_LABELS[key],
                columns[key],
                (p) => setColumn(key, p),
                textControl(key),
                WARN_COLUMNS[key],
              ),
            )}
          </div>

          {targetSchema ? (
            <div className="border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {targetSchema.type} data
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Entered once here, reused by every report
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {targetSchema.fields.map((field) =>
                  fieldRow(
                    field.key,
                    field.unit ? `${field.label} (${field.unit})` : field.label,
                    nameplate[field.key] ?? blank(),
                    (p) => setNameplateField(field.key, p),
                    nameplateControl(field),
                  ),
                )}
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Values not ticked here stay as they are on each asset — only the ticked
                ones are overwritten.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 border border-neutral-200 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {selectedTypes.length > 1
                  ? "The selection holds more than one equipment type, so type-specific nameplate fields aren't offered. Select one type at a time, or set a single Equipment Type above."
                  : "This equipment type has no nameplate field list, so only the fields above can be set in bulk."}
              </span>
            </div>
          )}

          <div className={columns.notes.enabled ? "" : "opacity-60"}>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={columns.notes.enabled}
                onChange={(e) => setColumn("notes", { enabled: e.target.checked })}
              />
              {COLUMN_LABELS.notes}
            </label>
            <Textarea
              rows={2}
              value={columns.notes.value}
              disabled={!columns.notes.enabled}
              placeholder={columns.notes.enabled ? "Replaces the note on every selected asset" : ""}
              onChange={(e) => setColumn("notes", { value: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || changeCount === 0}>
            {saving
              ? "Applying…"
              : `Apply ${changeCount} change${changeCount === 1 ? "" : "s"} to ${assets.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkEditAssetsDialog;
