/**
 * What the details panel shows for an asset, worked out apart from the panel so the rules
 * can be checked without a browser.
 */

import { getNameplateFields } from "@/lib/assetNameplateSchema";
import { assetStatusLabel } from "@/lib/assetStatus";
import { assetFieldsOf, assetValueFor, getReportAssetProfile } from "@/lib/reportAssetProfiles";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

export interface DetailRow {
  label: string;
  value: string;
}

export const REPORT_STATUS_LABELS: Record<string, string> = {
  "not started": "Not Started",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  sent: "Sent",
  issue: "Issue",
  archived: "Archived",
};

const filled = (rows: Array<{ label: string; value: unknown }>): DetailRow[] =>
  rows
    .map(({ label, value }) => ({ label, value: value == null ? "" : String(value).trim() }))
    .filter((row) => row.value);

/** Only what's been filled in, so a sparse asset doesn't read as a wall of blanks. */
export function assetDetailRows(asset: EquipmentAsset): {
  details: DetailRow[];
  nameplate: DetailRow[];
} {
  const details = filled([
    { label: "Status", value: assetStatusLabel(asset.status) },
    { label: "Building / Area", value: asset.building_area },
    { label: "Substation", value: asset.substation },
    { label: "Location", value: asset.equipment_location },
    { label: "Manufacturer", value: asset.manufacturer },
    { label: "Model", value: asset.model },
    { label: "Serial number", value: asset.serial_number },
  ]);

  // A chosen report form decides which fields an asset carries, as it does in the asset
  // editor. Fields stored in their own column are already listed above.
  const profile = getReportAssetProfile(asset.report_template_slug);
  const nameplate = profile
    ? filled(
        assetFieldsOf(profile)
          .filter((field) => !field.column)
          .map((field) => ({ label: field.label, value: assetValueFor(asset, field) })),
      )
    : filled(
        getNameplateFields(asset.equipment_type).map((field) => ({
          label: field.label,
          value: asset.nameplate_data?.[field.key],
        })),
      );

  return { details, nameplate };
}

export type ReportLink = { kind: "app"; path: string } | { kind: "file"; url: string };

/** Where a report opens. Built-in and custom-form reports are pages; uploads are files. */
export function reportLink(fileUrl: string | null | undefined): ReportLink | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("report:")) return { kind: "app", path: fileUrl.slice("report:".length) };
  if (fileUrl.startsWith("custom-form:")) {
    return { kind: "app", path: fileUrl.slice("custom-form:".length) };
  }
  return { kind: "file", url: fileUrl };
}
