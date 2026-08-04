import { supabase } from "@/lib/supabase";
import { getAssetName } from "@/components/reports/reportMappings";
import { linkReportDocumentToAsset } from "@/services/equipmentAssetsService";

/**
 * Create the report-document row (neta_ops.assets) and attach it to a job.
 *
 * Every report component currently hand-rolls these two inserts. This centralises them so
 * the equipment link (equipment_asset_id) is written consistently, and so a report opened
 * from an asset row stays attached to that piece of equipment.
 */
export interface CreateReportAssetArgs {
  jobId: string;
  /** Route slug, e.g. "switchgear-report". */
  reportSlug: string;
  /** Primary key of the row just written to the report's own table. */
  reportId: string;
  /** Equipment identifier typed into the report — becomes part of the asset name. */
  identifier?: string;
  templateType?: "ATS" | "MTS" | null;
  /** The registry asset this report describes, when it was opened from one. */
  equipmentAssetId?: string | null;
  userId?: string;
  /** Extra path segment used by the grounding reports. */
  pathSuffix?: string;
}

export async function createReportAsset({
  jobId,
  reportSlug,
  reportId,
  identifier,
  templateType,
  equipmentAssetId,
  userId,
  pathSuffix,
}: CreateReportAssetArgs): Promise<string> {
  const fileUrl = pathSuffix
    ? `report:/jobs/${jobId}/${reportSlug}/${pathSuffix}/${reportId}`
    : `report:/jobs/${jobId}/${reportSlug}/${reportId}`;

  const payload: Record<string, unknown> = {
    name: getAssetName(reportSlug, identifier),
    file_url: fileUrl,
    template_type: templateType ?? null,
    status: "in_progress",
    user_id: userId ?? null,
  };
  if (equipmentAssetId) payload.equipment_asset_id = equipmentAssetId;

  let { data, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .insert(payload)
    .select("id")
    .single();

  // 42703 = equipment_asset_id doesn't exist yet (migration not applied). Save the report
  // anyway — an unlinked report is far better than a lost one.
  if (error?.code === "42703" && payload.equipment_asset_id) {
    delete payload.equipment_asset_id;
    ({ data, error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .insert(payload)
      .select("id")
      .single());
  }
  if (error) throw error;

  const assetId = (data as { id: string }).id;

  const { error: linkError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .insert({ job_id: jobId, asset_id: assetId, user_id: userId ?? null });
  if (linkError) throw linkError;

  return assetId;
}

/**
 * Point an existing report document at a piece of equipment, for reports that build their
 * own asset row rather than going through `createReportAsset`.
 *
 * Failures are swallowed deliberately: the report itself is already saved by this point,
 * and losing the equipment link is far less bad than failing the save over it.
 */
export async function setReportAssetEquipmentLink(
  reportAssetId: string,
  equipmentAssetId: string | null,
): Promise<void> {
  try {
    await linkReportDocumentToAsset(reportAssetId, equipmentAssetId);
  } catch (error) {
    console.error("Could not link report to equipment asset:", error);
  }
}
