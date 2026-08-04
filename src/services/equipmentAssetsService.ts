import { supabase } from "@/lib/supabase";
import type {
  EquipmentAsset,
  EquipmentAssetInput,
  EquipmentAssetWithCounts,
} from "@/lib/types/assetTracking";

// The equipment registry. Assets belong to a site, never to a customer — see
// src/lib/types/assetTracking.ts.

const ASSET_COLUMNS =
  "id, site_id, building_area, substation, identifier, equipment_location, equipment_type, manufacturer, model, serial_number, notes, status, created_by, updated_by, created_at, updated_at, deleted_at";

/** Supabase `.in()` gets unwieldy well before this; chunk any id list past it. */
const IN_CHUNK_SIZE = 200;
/** Rows per insert batch during a spreadsheet import. */
const INSERT_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Table-missing (migration not applied yet) — degrade to empty instead of crashing. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchAssetsForSite(
  siteId: string,
): Promise<EquipmentAssetWithCounts[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .select(ASSET_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return withReportCounts((data ?? []) as EquipmentAsset[]);
}

export async function fetchAssetsForJob(
  jobId: string,
): Promise<EquipmentAssetWithCounts[]> {
  const { data: links, error: linkError } = await supabase
    .schema("neta_ops")
    .from("job_equipment_assets")
    .select("equipment_asset_id")
    .eq("job_id", jobId);

  if (linkError) {
    if (isMissingTable(linkError)) return [];
    throw linkError;
  }

  const assetIds = (links ?? []).map(
    (l: { equipment_asset_id: string }) => l.equipment_asset_id,
  );
  if (assetIds.length === 0) return [];

  const assets: EquipmentAsset[] = [];
  for (const ids of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("equipment_assets")
      .select(ASSET_COLUMNS)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw error;
    assets.push(...((data ?? []) as EquipmentAsset[]));
  }

  return withReportCounts(assets);
}

/**
 * How many report documents point at each asset. One grouped query for the whole page —
 * this is the number the delete guard reads, so it must not be an N+1 per row.
 */
export async function fetchLinkedReportCounts(
  assetIds: string[],
): Promise<Record<string, number>> {
  if (assetIds.length === 0) return {};

  const counts: Record<string, number> = {};
  for (const ids of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select("equipment_asset_id")
      .in("equipment_asset_id", ids);

    if (error) {
      // 42703 = column missing, i.e. the migration has not been applied yet.
      if (isMissingTable(error) || error.code === "42703") return {};
      throw error;
    }
    for (const row of (data ?? []) as { equipment_asset_id: string | null }[]) {
      if (!row.equipment_asset_id) continue;
      counts[row.equipment_asset_id] = (counts[row.equipment_asset_id] ?? 0) + 1;
    }
  }
  return counts;
}

async function withReportCounts(
  assets: EquipmentAsset[],
): Promise<EquipmentAssetWithCounts[]> {
  if (assets.length === 0) return [];
  const counts = await fetchLinkedReportCounts(assets.map((a) => a.id));
  return assets.map((a) => ({ ...a, report_count: counts[a.id] ?? 0 }));
}

/**
 * Distinct values already used at a site, to drive the free-text-with-suggestions inputs
 * for Building/Area, Substation and Equipment Location. Keeping these consistent is half
 * the point of the registry.
 */
export async function fetchSiteFieldSuggestions(siteId: string): Promise<{
  buildingAreas: string[];
  substations: string[];
  locations: string[];
}> {
  const empty = { buildingAreas: [], substations: [], locations: [] };
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .select("building_area, substation, equipment_location")
    .eq("site_id", siteId)
    .is("deleted_at", null);

  if (error) {
    if (isMissingTable(error)) return empty;
    throw error;
  }

  const buildingAreas = new Set<string>();
  const substations = new Set<string>();
  const locations = new Set<string>();
  for (const row of (data ?? []) as Record<string, string | null>[]) {
    if (row.building_area?.trim()) buildingAreas.add(row.building_area.trim());
    if (row.substation?.trim()) substations.add(row.substation.trim());
    if (row.equipment_location?.trim()) locations.add(row.equipment_location.trim());
  }
  const sorted = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
  return {
    buildingAreas: sorted(buildingAreas),
    substations: sorted(substations),
    locations: sorted(locations),
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

function normalizeInput(input: EquipmentAssetInput) {
  const text = (v: string | null | undefined) => v?.trim() || null;
  return {
    site_id: input.site_id,
    identifier: input.identifier.trim(),
    building_area: text(input.building_area),
    substation: text(input.substation),
    equipment_location: text(input.equipment_location),
    equipment_type: text(input.equipment_type),
    manufacturer: text(input.manufacturer),
    model: text(input.model),
    serial_number: text(input.serial_number),
    notes: text(input.notes),
  };
}

function duplicateError(identifier: string): Error {
  return new Error(
    `"${identifier}" already exists at this site in the same building and substation. Identifiers must be unique so reports attach to the right piece of equipment.`,
  );
}

export async function upsertEquipmentAsset(
  input: EquipmentAssetInput & { id?: string },
  userId?: string,
): Promise<EquipmentAsset> {
  if (!input.identifier?.trim()) throw new Error("Identifier is required");

  const payload = normalizeInput(input);

  const query = input.id
    ? supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .update({ ...payload, updated_by: userId ?? null })
        .eq("id", input.id)
        .select(ASSET_COLUMNS)
        .single()
    : supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .insert({ ...payload, created_by: userId ?? null })
        .select(ASSET_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error) {
    if (error.code === "23505") throw duplicateError(payload.identifier);
    throw error;
  }
  return data as EquipmentAsset;
}

export interface BulkInsertResult {
  inserted: EquipmentAsset[];
  /** Rows the database rejected as duplicates, with the reason. */
  skipped: { identifier: string; reason: string }[];
}

/**
 * Insert many assets at once (spreadsheet import, duplicate x N).
 *
 * Chunked, and each chunk is retried row-by-row if it fails, so one bad row in a 500-row
 * import doesn't discard the other 499.
 */
export async function bulkInsertEquipmentAssets(
  inputs: EquipmentAssetInput[],
  userId?: string,
): Promise<BulkInsertResult> {
  const result: BulkInsertResult = { inserted: [], skipped: [] };
  if (inputs.length === 0) return result;

  const rows = inputs.map((i) => ({ ...normalizeInput(i), created_by: userId ?? null }));

  for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("equipment_assets")
      .insert(batch)
      .select(ASSET_COLUMNS);

    if (!error) {
      result.inserted.push(...((data ?? []) as EquipmentAsset[]));
      continue;
    }
    if (!isMissingTable(error) && error.code !== "23505") throw error;
    if (isMissingTable(error)) throw error;

    // A duplicate somewhere in the batch aborted all of it. Re-run one at a time so the
    // good rows still land and we can report exactly which ones didn't.
    for (const row of batch) {
      const { data: one, error: rowError } = await supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .insert(row)
        .select(ASSET_COLUMNS)
        .single();
      if (rowError) {
        if (rowError.code === "23505") {
          result.skipped.push({
            identifier: row.identifier,
            reason: "already exists at this site",
          });
          continue;
        }
        throw rowError;
      }
      result.inserted.push(one as EquipmentAsset);
    }
  }

  return result;
}

/**
 * Soft-delete an asset. Blocked while report documents point at it — that is the
 * "cannot delete an asset with a linked report" rule. The ON DELETE RESTRICT foreign key
 * on neta_ops.assets.equipment_asset_id backstops this if the check races.
 */
export async function deleteEquipmentAsset(assetId: string): Promise<void> {
  const counts = await fetchLinkedReportCounts([assetId]);
  const linked = counts[assetId] ?? 0;
  if (linked > 0) {
    throw new Error(
      `This asset has ${linked} linked report${linked === 1 ? "" : "s"} and cannot be deleted. Delete the reports first if it was created by mistake.`,
    );
  }

  const { error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw error;
}

// ── Job linkage ───────────────────────────────────────────────────────────────

/** Add site assets to a job's scope. Ignores ones already on the job. */
export async function linkAssetsToJob(
  jobId: string,
  assetIds: string[],
  userId?: string,
): Promise<number> {
  if (assetIds.length === 0) return 0;

  const rows = assetIds.map((equipment_asset_id) => ({
    job_id: jobId,
    equipment_asset_id,
    created_by: userId ?? null,
  }));

  let linked = 0;
  for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("job_equipment_assets")
      .upsert(batch, { onConflict: "job_id,equipment_asset_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    linked += (data ?? []).length;
  }
  return linked;
}

/** Remove an asset from a job's scope. The asset itself stays at the site. */
export async function unlinkAssetFromJob(
  jobId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("job_equipment_assets")
    .delete()
    .eq("job_id", jobId)
    .eq("equipment_asset_id", assetId);
  if (error) throw error;
}

/**
 * Point a report document (neta_ops.assets) at the equipment it describes.
 *
 * Used when adopting pre-registry reports and when a report is saved from an asset row.
 * Once set, the asset can no longer be deleted while that report exists.
 */
export async function linkReportDocumentToAsset(
  reportAssetId: string,
  equipmentAssetId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .update({ equipment_asset_id: equipmentAssetId })
    .eq("id", reportAssetId);
  if (error) throw error;
}

// ── Equipment types (free text with saved suggestions) ────────────────────────
// Same pattern as neta_ops.neta_sections in the custom form builder: the user can type
// anything, and new values get saved so the next person picks the same wording.

export async function fetchEquipmentTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_types")
    .select("name")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((r: { name: string }) => r.name);
}

export async function createEquipmentType(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { error } = await supabase
    .schema("neta_ops")
    .from("equipment_types")
    .insert({ name: trimmed });

  // 23505 just means someone else saved the same wording first — that's the desired end
  // state, so it isn't an error worth surfacing.
  if (error && error.code !== "23505" && !isMissingTable(error)) throw error;
}
