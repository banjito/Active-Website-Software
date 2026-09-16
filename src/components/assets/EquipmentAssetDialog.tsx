import React, { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import Select from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  getNameplateSchema,
  reconcileNameplateData,
  type NameplateData,
} from "@/lib/assetNameplateSchema";
import {
  ASSET_TEMPLATE_SLUGS,
  assetFieldsOf,
  convertLegacyNameplate,
  getReportAssetProfile,
  setPath,
  type AssetColumn,
} from "@/lib/reportAssetProfiles";
import { REPORT_NAMES } from "@/components/reports/reportMappings";
import {
  ReportJobInfoFields,
  ReportNameplateFields,
  ReportSectionHeading,
} from "@/components/reports/common/ReportAssetSections";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import SearchableSelect from "./SearchableSelect";
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
  supportsReportTemplates,
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
 *
 * Once the report form the asset is meant for is chosen, its Job Information and Nameplate
 * Data sections are rendered here from the same components the report uses, so setting up
 * an asset is the same as filling in the top of its report.
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
  const [nameplate, setNameplate] = useState<NameplateData>({});
  const [templateSlug, setTemplateSlug] = useState("");
  /** Report field values not held in an asset column, keyed by form path. */
  const [reportData, setReportData] = useState<Record<string, string>>({});
  /** What happened to old nameplate values when a report form was first chosen. */
  const [conversion, setConversion] = useState<{ moved: number; toNotes: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const profile = useMemo(() => getReportAssetProfile(templateSlug), [templateSlug]);
  const templatesAvailable = supportsReportTemplates();

  /** The asset in the report's own form shape, for the shared section components. */
  const reportValues = useMemo(() => {
    if (!profile) return {};
    let values: Record<string, unknown> = {};
    for (const field of assetFieldsOf(profile)) {
      const value = field.column
        ? form[field.column as AssetColumn]
        : (reportData[field.path] ?? "");
      values = setPath(values, field.path, value);
    }
    return values;
  }, [profile, form, reportData]);

  const setReportValue = (path: string, value: unknown) => {
    const field = profile && assetFieldsOf(profile).find((f) => f.path === path);
    if (!field) return;
    const text = value == null ? "" : String(value);
    if (field.column) setForm((f) => ({ ...f, [field.column as AssetColumn]: text }));
    else setReportData((prev) => ({ ...prev, [path]: text }));
  };

  /**
   * Choosing a report form retires the old per-type nameplate fields. Anything that clearly
   * means one of the report's fields moves into it; the rest is written into Notes, so
   * nothing typed before disappears.
   */
  const changeTemplate = (nextSlug: string) => {
    setTemplateSlug(nextSlug);
    const next = getReportAssetProfile(nextSlug);
    if (!next) return;

    const { values, leftovers } = convertLegacyNameplate(next, nameplate);
    const moved = Object.keys(values).filter((path) => !reportData[path]?.trim());
    if (moved.length === 0 && leftovers.length === 0) return;

    setReportData((prev) => {
      const merged = { ...prev };
      for (const path of moved) merged[path] = values[path];
      return merged;
    });
    if (leftovers.length > 0) {
      const lines = leftovers.map((l) => `${l.label}: ${l.value}`).join("\n");
      setForm((f) => ({
        ...f,
        notes: [f.notes.trim(), `Nameplate (before report form was set):\n${lines}`]
          .filter(Boolean)
          .join("\n\n"),
      }));
    }
    setNameplate({});
    setConversion({ moved: moved.length, toNotes: leftovers.length });
  };

  /** Which type-specific fields to show. Null for a type we have no field list for. */
  const nameplateSchema = useMemo(
    () => getNameplateSchema(form.equipment_type),
    [form.equipment_type],
  );

  const setNameplateValue = (key: string, value: string) =>
    setNameplate((prev) => ({ ...prev, [key]: value }));

  /**
   * Changing the equipment type changes which nameplate fields exist. Values shared by
   * both types carry over (a rated voltage is a rated voltage); anything the new type
   * has no home for would be silently dropped, so confirm it first and name exactly what
   * is going to be lost.
   */
  const changeEquipmentType = (nextType: string) => {
    const { kept, cleared } = reconcileNameplateData(nameplate, nextType);
    if (cleared.length > 0) {
      const lost = cleared.map((c) => `  • ${c.label}: ${c.value}`).join("\n");
      const confirmed = window.confirm(
        `Changing the equipment type to "${nextType || "(none)"}" will clear ${cleared.length} value${cleared.length === 1 ? "" : "s"} that the new type has no field for:\n\n${lost}\n\nContinue?`,
      );
      if (!confirmed) return;
    }
    setNameplate(kept);
    setForm((f) => ({ ...f, equipment_type: nextType }));
  };

  // One layer only: this asset can be nested under another unless it is already a parent
  // itself, and only top-level assets are offered as the parent.
  const ownSubAssetCount = useMemo(
    () =>
      asset ? (siteAssets ?? []).filter((a) => a.parent_asset_id === asset.id).length : 0,
    [siteAssets, asset],
  );

  const parentOptions = useMemo(() => {
    if (!siteAssets) return [];
    return siteAssets
      .filter((a) => !a.parent_asset_id && a.id !== asset?.id)
      .sort((a, b) => compareAlphanumericLabels(a.identifier, b.identifier))
      .map((a) => ({
        value: a.id,
        label: a.identifier,
        hint:
          [a.building_area, a.substation, a.equipment_type]
            .filter(Boolean)
            .join(" · ") || undefined,
      }));
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
      setNameplate((asset.nameplate_data as NameplateData) ?? {});
      setTemplateSlug(asset.report_template_slug ?? "");
      setReportData((asset.report_data as Record<string, string>) ?? {});
    } else {
      setForm(emptyForm);
      setNameplate({});
      setTemplateSlug("");
      setReportData({});
    }
    setConversion(null);
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
          // The report form decides the equipment type, so lists and filters keep reading.
          equipment_type: profile ? profile.equipmentType : form.equipment_type,
          parent_asset_id: form.parent_asset_id || null,
          // Only keys the current type actually has a field for, so a value left over
          // from an earlier type can't linger invisibly on the record. With a report form
          // chosen the old fields were already converted, so this is empty.
          nameplate_data: profile
            ? nameplate
            : reconcileNameplateData(nameplate, form.equipment_type).kept,
          ...(templatesAvailable
            ? { report_template_slug: templateSlug || null, report_data: reportData }
            : {}),
          site_id: siteId,
          id: asset?.id,
        },
        userId,
      );

      // Remember a new equipment type so the next person picks the same wording.
      const typed = profile ? "" : form.equipment_type.trim();
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
      <DialogContent
        className={`max-h-[90vh] overflow-y-auto ${profile ? "sm:max-w-[1180px]" : "sm:max-w-[560px]"}`}
      >
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            Equipment at {siteName}. No report is created. This is the equipment record
            itself, and it stays available to every job at this site.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {templatesAvailable && (
            <div>
              <Label htmlFor="ea-template">Report form</Label>
              <Select
                id="ea-template"
                value={templateSlug}
                onChange={(e) => changeTemplate(e.target.value)}
                options={[
                  { value: "", label: "Not chosen" },
                  ...ASSET_TEMPLATE_SLUGS.map((slug) => ({
                    value: slug,
                    label: REPORT_NAMES[slug] ?? slug,
                  })),
                ]}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                The report this equipment is tested with. Its job information and nameplate
                fields are what you fill in below, and every report opened from this asset
                starts with them. ATS and MTS versions of the same equipment share fields.
              </p>
              {conversion && (
                <p className="mt-2 border border-neutral-200 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
                  {conversion.moved > 0 &&
                    `${conversion.moved} existing nameplate value${conversion.moved === 1 ? "" : "s"} moved into the report fields. `}
                  {conversion.toNotes > 0 &&
                    `${conversion.toNotes} had no matching field and ${conversion.toNotes === 1 ? "was" : "were"} added to Notes.`}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SuggestInput
              label="Building / Area"
              value={form.building_area}
              onChange={set("building_area")}
              suggestions={suggestions.buildingAreas}
              placeholder="e.g. DC7"
            />
            {!profile && (
              <SuggestInput
                label="Substation"
                value={form.substation}
                onChange={set("substation")}
                suggestions={suggestions.substations}
                placeholder="e.g. Substation 3"
              />
            )}
          </div>

          {!profile && (
            <SuggestInput
              label="Identifier"
              required
              autoFocus
              value={form.identifier}
              onChange={set("identifier")}
              placeholder="e.g. CB-101"
              hint="Must be unique within this building and substation."
            />
          )}

          {siteAssets && (
            <div>
              <Label htmlFor="ea-parent">Part of</Label>
              {ownSubAssetCount > 0 ? (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  This asset has {ownSubAssetCount} sub-asset
                  {ownSubAssetCount === 1 ? "" : "s"} of its own, so it stays top-level, since
                  sub-assets are limited to one layer.
                </p>
              ) : (
                <>
                  <SearchableSelect
                    id="ea-parent"
                    value={form.parent_asset_id}
                    onChange={set("parent_asset_id")}
                    options={parentOptions}
                    emptyLabel="None (top-level asset)"
                    placeholder="Type an identifier, e.g. MVG-C1"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Nest this under the equipment it belongs to, such as a switch, CT or relay
                    inside a switchgear lineup. It keeps its own reports and stays grouped
                    with its parent in the list.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {!profile?.jobInfo.some((f) => f.column === "equipment_location") && (
              <SuggestInput
                label="Equipment Location"
                value={form.equipment_location}
                onChange={set("equipment_location")}
                suggestions={suggestions.locations}
                placeholder="e.g. Electrical Room 2"
              />
            )}
            {!profile && (
              <SuggestInput
                label="Equipment Type"
                value={form.equipment_type}
                onChange={changeEquipmentType}
                suggestions={suggestions.equipmentTypes}
                placeholder="e.g. Low Voltage Circuit Breaker"
                hint={
                  templatesAvailable
                    ? "Or choose a report form above to use that report's fields."
                    : "Type anything. It does not lock in a report form."
                }
              />
            )}
          </div>

          {profile && (
            <>
              <div>
                <ReportSectionHeading>Job Information</ReportSectionHeading>
                <ReportJobInfoFields
                  profile={profile}
                  mode="asset"
                  values={reportValues}
                  onChange={setReportValue}
                  isEditing
                  fieldProps={{
                    substation: { list: "ea-substation-options" },
                    eqptLocation: { list: "ea-location-options" },
                  }}
                />
                <datalist id="ea-substation-options">
                  {suggestions.substations.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <datalist id="ea-location-options">
                  {suggestions.locations.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                  The identifier must be unique within this building and substation. Greyed
                  fields change every visit, so they are filled on each report.
                </p>
              </div>
              <div>
                <ReportSectionHeading>Nameplate Data</ReportSectionHeading>
                <ReportNameplateFields
                  profile={profile}
                  mode="asset"
                  values={reportValues}
                  onChange={setReportValue}
                  isEditing
                />
              </div>
            </>
          )}

          {!profile && nameplateSchema && (
            <div className="border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {nameplateSchema.type} data
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Entered once here, reused by every report
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {nameplateSchema.fields.map((field) => (
                  <div key={field.key}>
                    <Label htmlFor={`np-${field.key}`}>
                      {field.label}
                      {field.unit && (
                        <span className="ml-1 font-normal text-neutral-400">
                          ({field.unit})
                        </span>
                      )}
                    </Label>
                    {field.options ? (
                      <Select
                        id={`np-${field.key}`}
                        value={nameplate[field.key] ?? ""}
                        onChange={(e) => setNameplateValue(field.key, e.target.value)}
                        options={[
                          { value: "", label: "Select..." },
                          ...field.options.map((o) => ({ value: o, label: o })),
                        ]}
                      />
                    ) : (
                      <Input
                        id={`np-${field.key}`}
                        value={nameplate[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(e) => setNameplateValue(field.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Fields taken from {nameplateSchema.source}.
              </p>
            </div>
          )}

          {/*
            Manufacturer / model / serial are no longer typed here.
            Nobody knows a serial number until they're standing in front of the device, so
            asking for it at registration time invited either blank fields or the same
            value being keyed twice — once in the report, once here. They come off the
            report now, via "Save to asset". The columns still exist and are still written;
            this dialog just doesn't pretend the office knows them in advance.
          */}
          {!profile && (form.manufacturer || form.model || form.serial_number) && (
            <div className="border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <FileText className="h-3.5 w-3.5" />
                From the field
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {form.manufacturer && (
                  <span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Manufacturer:{" "}
                    </span>
                    {form.manufacturer}
                  </span>
                )}
                {form.model && (
                  <span>
                    <span className="text-neutral-500 dark:text-neutral-400">Model: </span>
                    {form.model}
                  </span>
                )}
                {form.serial_number && (
                  <span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Serial:{" "}
                    </span>
                    {form.serial_number}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Captured from a report. Correct it in the report and save to the asset
                again.
              </p>
            </div>
          )}

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
