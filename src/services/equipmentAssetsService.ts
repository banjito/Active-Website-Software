import { supabase } from "@/lib/supabase";
import type {
  EquipmentAsset,
  EquipmentAssetInput,
  EquipmentAssetWithCounts,
} from "@/lib/types/assetTracking";

// The equipment registry. Assets belong to a site, never to a customer — see
// src/lib/types/assetTracking.ts.

const BASE_ASSET_COLUMNS =
  "id, site_id, building_area, substation, identifier, equipment_location, equipment_type, manufacturer, model, serial_number, notes, status, created_by, updated_by, created_at, updated_at, deleted_at";

/**
 * Columns added by later migrations, newest first.
 *
 * Each is assumed present until a query says otherwise, then remembered for the rest of
 * the session. An instance that has only run some of the migrations degrades feature by
 * feature (a flat asset list, no nameplate fields) instead of breaking the page. Newest
 * first so the most likely missing column is dropped on the first retry.
 */
const OPTIONAL_ASSET_COLUMNS = [
  { name: "nameplate_data", migration: "add_equipment_asset_nameplate_data.sql" },
  { name: "parent_asset_id", migration: "add_equipment_asset_parent.sql" },
];

const columnSupported: Record<string, boolean> = {
  nameplate_data: true,
  parent_asset_id: true,
};

export function supportsSubAssets(): boolean {
  return columnSupported.parent_asset_id;
}

export function supportsNameplateData(): boolean {
  return columnSupported.nameplate_data;
}

function assetColumns(): string {
  const optional = OPTIONAL_ASSET_COLUMNS.filter((c) => columnSupported[c.name]).map(
    (c) => c.name,
  );
  return [BASE_ASSET_COLUMNS, ...optional].join(", ");
}

/** 42703 = column missing, i.e. a migration hasn't been applied on this instance. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

/**
 * Run a query built around the asset column list, dropping one optional column per retry
 * until it succeeds. Postgres names only the first missing column, so this walks the list
 * newest-first rather than trying to parse the message.
 */
// `run` is loosely typed because the column list is built at runtime: Supabase can only
// infer a row shape from a literal select string, so the caller asserts T instead.
async function withParentFallback<T>(
  run: (columns: string) => PromiseLike<{ data: any; error: any }>,
): Promise<{ data: T | null; error: any }> {
  let result = await run(assetColumns());
  while (isMissingColumn(result.error)) {
    const next = OPTIONAL_ASSET_COLUMNS.find((c) => columnSupported[c.name]);
    if (!next) break;
    columnSupported[next.name] = false;
    result = await run(assetColumns());
  }
  return result;
}

/** Strip columns this instance doesn't have from an insert/update payload. */
function dropUnsupportedColumns<T extends Record<string, unknown>>(payload: T): T {
  const cleaned = { ...payload };
  for (const column of OPTIONAL_ASSET_COLUMNS) {
    if (!columnSupported[column.name]) delete cleaned[column.name];
  }
  return cleaned;
}

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
  const { data, error } = await withParentFallback<EquipmentAsset[]>((columns) =>
    supabase
      .schema("neta_ops")
      .from("equipment_assets")
      .select(columns)
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  );

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
    const { data, error } = await withParentFallback<EquipmentAsset[]>((columns) =>
      supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .select(columns)
        .in("id", ids)
        .is("deleted_at", null),
    );
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

/** Blank values are dropped so nameplate_data never fills up with empty strings. */
function cleanNameplate(
  data: Record<string, string> | null | undefined,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) cleaned[key] = trimmed;
  }
  return cleaned;
}

function normalizeInput(input: EquipmentAssetInput) {
  const text = (v: string | null | undefined) => v?.trim() || null;
  // Columns from migrations this instance hasn't run are dropped, so the write still lands.
  return dropUnsupportedColumns({
    site_id: input.site_id,
    parent_asset_id: input.parent_asset_id || null,
    nameplate_data: cleanNameplate(input.nameplate_data),
    identifier: input.identifier.trim(),
    building_area: text(input.building_area),
    substation: text(input.substation),
    equipment_location: text(input.equipment_location),
    equipment_type: text(input.equipment_type),
    manufacturer: text(input.manufacturer),
    model: text(input.model),
    serial_number: text(input.serial_number),
    notes: text(input.notes),
  });
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

  // Rebuilt per attempt: normalizeInput drops parent_asset_id once a retry establishes
  // that this instance doesn't have the column.
  const { data, error } = await withParentFallback<EquipmentAsset>((columns) => {
    const payload = normalizeInput(input);
    return input.id
      ? supabase
          .schema("neta_ops")
          .from("equipment_assets")
          .update({ ...payload, updated_by: userId ?? null })
          .eq("id", input.id)
          .select(columns)
          .single()
      : supabase
          .schema("neta_ops")
          .from("equipment_assets")
          .insert({ ...payload, created_by: userId ?? null })
          .select(columns)
          .single();
  });

  if (error) {
    if (error.code === "23505") throw duplicateError(input.identifier.trim());
    throw error;
  }
  return data as EquipmentAsset;
}

/**
 * Attach an asset to a parent, or detach it with a null parent.
 *
 * Kept separate from the edit dialog so the list can re-parent a row directly. The
 * one-layer rule is checked here for a readable message; the database trigger is the
 * actual guarantee.
 */
export async function setAssetParent(
  assetId: string,
  parentAssetId: string | null,
  userId?: string,
): Promise<EquipmentAsset> {
  if (!columnSupported.parent_asset_id) {
    throw new Error(
      "Sub-assets aren't set up on this database yet. Run database/migrations/add_equipment_asset_parent.sql, then reload.",
    );
  }
  if (parentAssetId && parentAssetId === assetId) {
    throw new Error("An asset cannot be its own parent");
  }

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .update({ parent_asset_id: parentAssetId, updated_by: userId ?? null })
    .eq("id", assetId)
    .select(assetColumns())
    .single();

  if (error) throw error;
  return data as unknown as EquipmentAsset;
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

  // Built per attempt rather than up front, so a retry that drops parent_asset_id sends a
  // payload matching the columns it just learned about.
  const buildRow = (input: EquipmentAssetInput) => ({
    ...normalizeInput(input),
    created_by: userId ?? null,
  });

  for (const batch of chunk(inputs, INSERT_CHUNK_SIZE)) {
    const { data, error } = await withParentFallback<EquipmentAsset[]>((columns) =>
      supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .insert(batch.map(buildRow))
        .select(columns),
    );

    if (!error) {
      result.inserted.push(...((data ?? []) as EquipmentAsset[]));
      continue;
    }
    if (!isMissingTable(error) && error.code !== "23505") throw error;
    if (isMissingTable(error)) throw error;

    // A duplicate somewhere in the batch aborted all of it. Re-run one at a time so the
    // good rows still land and we can report exactly which ones didn't.
    for (const input of batch) {
      const { data: one, error: rowError } = await withParentFallback<EquipmentAsset>(
        (columns) =>
          supabase
            .schema("neta_ops")
            .from("equipment_assets")
            .insert(buildRow(input))
            .select(columns)
            .single(),
      );
      if (rowError) {
        if (rowError.code === "23505") {
          result.skipped.push({
            identifier: input.identifier.trim(),
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

  // The FK's ON DELETE SET NULL never fires for a soft delete, so detach any sub-assets
  // by hand — otherwise they'd point at a parent that no longer appears in any list.
  if (columnSupported.parent_asset_id) {
    const { error: detachError } = await supabase
      .schema("neta_ops")
      .from("equipment_assets")
      .update({ parent_asset_id: null })
      .eq("parent_asset_id", assetId);
    if (detachError && !isMissingColumn(detachError)) throw detachError;
  }
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
