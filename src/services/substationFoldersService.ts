import { supabase } from "@/lib/supabase";
import { groupKey, mergeFolderScopes, substationKey } from "@/utils/substationFolders";
import type {
  BuildingFolderAssignment,
  FolderItemAssignment,
  FolderScope,
  ResolvedFolders,
  SubstationFolder,
  SubstationFolderAssignment,
} from "@/lib/types/substationFolders";

// Folder levels above a report or a piece of equipment. See
// database/migrations/create_substation_folders.sql and add_building_area_folders.sql.

const FOLDER_COLUMNS =
  "id, site_id, job_id, name, sort_order, created_by, created_at, updated_at, deleted_at, substation_key, parent_folder_id, level, building_key";
const ASSIGNMENT_COLUMNS =
  "id, site_id, job_id, substation_key, substation_label, folder_id, sort_order, created_at, updated_at";
const BUILDING_ASSIGNMENT_COLUMNS =
  "id, site_id, job_id, building_key, building_label, folder_id, sort_order, created_at, updated_at";
const ITEM_COLUMNS = "id, folder_id, asset_id, equipment_asset_id, sort_order";

/**
 * Nesting arrived in a second migration (add_substation_folder_nesting.sql). An instance
 * with only the first one keeps the outer folder level and silently does without the inner
 * one, rather than 42703-ing the whole tab.
 */
let nestingAvailable = true;

export function substationFolderNestingAvailable(): boolean {
  return nestingAvailable;
}

/**
 * Whether this instance has run the folders migration.
 *
 * ampOS is white-labelled per buyer and instances are migrated independently, so a build
 * can talk to a database that has never seen these tables. The first 42P01 latches this
 * for the session and every surface falls back to its pre-folder list — no error toast, no
 * broken tab, just no folders.
 */
let foldersAvailable = true;

export function substationFoldersAvailable(): boolean {
  return foldersAvailable;
}

/**
 * The building level arrived in a third migration (add_building_area_folders.sql). Without
 * it the asset list still groups by Building / Area — that comes off the equipment row —
 * but offers no folders at that level, rather than 42703-ing the whole list.
 */
let buildingLevelAvailable = true;

export function buildingFoldersAvailable(): boolean {
  return buildingLevelAvailable;
}

/** 42P01 = table missing, i.e. create_substation_folders.sql hasn't been applied here. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

const UNAVAILABLE: ResolvedFolders = {
  folders: [],
  buildingFolders: [],
  innerFolders: [],
  itemFolderById: new Map(),
  assignmentByKey: new Map(),
  buildingAssignmentByKey: new Map(),
  available: false,
  buildingLevelAvailable: false,
};

/** 42703 = column missing, i.e. the nesting migration hasn't been applied here. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

function folderColumns(): string {
  let columns = FOLDER_COLUMNS;
  if (!buildingLevelAvailable) columns = columns.replace(", level, building_key", "");
  if (!nestingAvailable) columns = columns.replace(", substation_key, parent_folder_id", "");
  return columns;
}

function scopeColumn(scope: FolderScope): "site_id" | "job_id" {
  return scope.siteId ? "site_id" : "job_id";
}

function scopeValue(scope: FolderScope): string {
  return (scope.siteId ?? scope.jobId) as string;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

interface ScopeData {
  folders: SubstationFolder[];
  assignments: SubstationFolderAssignment[];
  buildingAssignments: BuildingFolderAssignment[];
}

async function fetchScope(scope: FolderScope): Promise<ScopeData | null> {
  const column = scopeColumn(scope);
  const value = scopeValue(scope);

  const readFolders = () =>
    supabase
      .schema("neta_ops")
      .from("substation_folders")
      .select(folderColumns())
      .eq(column, value)
      .is("deleted_at", null);

  const [initialFolderResult, assignmentResult, initialBuildingResult] = await Promise.all([
    readFolders(),
    supabase
      .schema("neta_ops")
      .from("substation_folder_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq(column, value),
    fetchBuildingAssignments(column, value),
  ]);
  let folderResult = initialFolderResult;
  let buildingResult = initialBuildingResult;

  // Retry once per migration this instance is missing, dropping that migration's columns:
  // building level first, then nesting, since folderColumns() layers them in that order.
  if (isMissingColumn(folderResult.error) && buildingLevelAvailable) {
    buildingLevelAvailable = false;
    buildingResult = { data: [], error: null };
    folderResult = await readFolders();
  }
  if (isMissingColumn(folderResult.error) && nestingAvailable) {
    nestingAvailable = false;
    folderResult = await readFolders();
  }

  const error = folderResult.error ?? assignmentResult.error;
  if (error) {
    if (isMissingTable(error)) {
      foldersAvailable = false;
      return null;
    }
    throw error;
  }

  return {
    folders: (folderResult.data ?? []) as unknown as SubstationFolder[],
    assignments: (assignmentResult.data ?? []) as unknown as SubstationFolderAssignment[],
    buildingAssignments: buildingResult.data,
  };
}

/**
 * Building memberships for one scope.
 *
 * Its own function so a missing table latches the level off and returns an empty list
 * instead of taking the folder read down with it — the building *level* still renders,
 * it just has no folders in it.
 */
async function fetchBuildingAssignments(
  column: "site_id" | "job_id",
  value: string,
): Promise<{ data: BuildingFolderAssignment[]; error: null }> {
  if (!buildingLevelAvailable) return { data: [], error: null };

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("building_folder_assignments")
    .select(BUILDING_ASSIGNMENT_COLUMNS)
    .eq(column, value);

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) {
      buildingLevelAvailable = false;
      return { data: [], error: null };
    }
    throw error;
  }
  return { data: (data ?? []) as unknown as BuildingFolderAssignment[], error: null };
}

/**
 * The job's site, so a job page can pick up the folders its site defines.
 *
 * Its own query on purpose, exactly as JobAssetsTab.tsx:144-165 does it: folding site_id
 * into the shared job fetch would 42703 the whole job page on an instance that never ran
 * the asset-tracking migration. Here a missing column just means no inherited folders.
 */
export async function resolveJobSiteId(jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("site_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "42P01") return null;
    throw error;
  }
  return (data as { site_id?: string | null } | null)?.site_id ?? null;
}

/**
 * Everything a screen needs to draw the folder level.
 *
 * A job passes its own id and, when it has one, its site's — the site's folders are
 * inherited and the job's overlay them. The site page passes only the site.
 */
export async function fetchFolderData(input: {
  jobId?: string | null;
  siteId?: string | null;
}): Promise<ResolvedFolders> {
  if (!foldersAvailable) return UNAVAILABLE;
  if (!input.jobId && !input.siteId) return UNAVAILABLE;

  const [site, job] = await Promise.all([
    input.siteId ? fetchScope({ siteId: input.siteId }) : Promise.resolve(null),
    input.jobId ? fetchScope({ jobId: input.jobId }) : Promise.resolve(null),
  ]);

  if (!foldersAvailable) return UNAVAILABLE;

  const innerFolderIds = [...(site?.folders ?? []), ...(job?.folders ?? [])]
    .filter((f) => f.substation_key)
    .map((f) => f.id);

  return mergeFolderScopes({
    siteFolders: site?.folders,
    siteAssignments: site?.assignments,
    siteBuildingAssignments: site?.buildingAssignments,
    jobFolders: job?.folders,
    jobAssignments: job?.assignments,
    jobBuildingAssignments: job?.buildingAssignments,
    itemFolderById: await fetchItemAssignments(innerFolderIds),
    buildingLevelAvailable,
  });
}

/**
 * Which folder each report or asset sits in, keyed by item id.
 *
 * Fetched by folder rather than by item: the folder list is short and already known, while
 * the item list can be hundreds of reports, and a job with no inner folders skips the
 * query entirely.
 */
async function fetchItemAssignments(folderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (folderIds.length === 0 || !nestingAvailable) return out;

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("folder_item_assignments")
    .select(ITEM_COLUMNS)
    .in("folder_id", folderIds);

  if (error) {
    if (isMissingTable(error)) {
      nestingAvailable = false;
      return out;
    }
    throw error;
  }

  for (const row of (data ?? []) as unknown as FolderItemAssignment[]) {
    const itemId = row.asset_id ?? row.equipment_asset_id;
    if (itemId) out.set(itemId, row.folder_id);
  }
  return out;
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Where a new folder goes.
 *
 *  - omitted / `{}`      a folder of substations floating above every building, which is
 *                        what every folder created before the building level existed is
 *  - `{ buildingLabel }` a folder of substations pinned inside that Building / Area
 *  - `{ level: "building" }` a folder of buildings, at the top of the asset list
 *  - `{ substationLabel }`   a folder of items living inside that substation
 */
export type FolderPlacement =
  | { level?: "substation"; buildingLabel?: string | null }
  | { level: "building" }
  | { substationLabel: string; parentFolderId?: string | null };

export async function createFolder(
  scope: FolderScope,
  name: string,
  sortOrder: number,
  userId?: string | null,
  placement?: FolderPlacement,
): Promise<SubstationFolder> {
  const inSubstation =
    placement && "substationLabel" in placement ? placement : null;
  const level = inSubstation
    ? "item"
    : placement && "level" in placement && placement.level
      ? placement.level
      : "substation";
  const buildingLabel =
    placement && "buildingLabel" in placement ? placement.buildingLabel : null;

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("substation_folders")
    .insert({
      [scopeColumn(scope)]: scopeValue(scope),
      name: name.trim(),
      sort_order: sortOrder,
      created_by: userId ?? null,
      ...(inSubstation
        ? {
            substation_key: substationKey(inSubstation.substationLabel),
            parent_folder_id: inSubstation.parentFolderId ?? null,
          }
        : {}),
      // Only sent where the columns exist, so an instance that hasn't run
      // add_building_area_folders.sql keeps working — it can only ever create the two
      // levels it already had.
      ...(buildingLevelAvailable
        ? {
            level,
            building_key: buildingLabel ? groupKey(buildingLabel) : null,
          }
        : {}),
    })
    .select(folderColumns())
    .single();

  if (error) throw error;
  return data as unknown as SubstationFolder;
}

/** Re-parent a folder. The database refuses a cycle; the UI shouldn't offer one either. */
export async function moveFolder(
  folderId: string,
  parentFolderId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("substation_folders")
    .update({ parent_folder_id: parentFolderId })
    .eq("id", folderId);
  if (error) throw error;
}

/**
 * File reports or equipment into a folder, or out of every folder with `folderId: null`.
 *
 * Takes a list because the common case is a bulk selection, and one round trip for fifty
 * ticked reports beats fifty. Delete-then-insert for the same reason as the substation
 * level: the uniqueness indexes are partial, so upsert can't infer them.
 */
export async function assignItemsToFolder(
  itemIds: string[],
  folderId: string | null,
  kind: "report" | "equipment",
  userId?: string | null,
): Promise<void> {
  if (itemIds.length === 0) return;
  const column = kind === "report" ? "asset_id" : "equipment_asset_id";

  const { error: clearError } = await supabase
    .schema("neta_ops")
    .from("folder_item_assignments")
    .delete()
    .in(column, itemIds);
  if (clearError) throw clearError;

  if (!folderId) return;

  const { error } = await supabase
    .schema("neta_ops")
    .from("folder_item_assignments")
    .insert(
      itemIds.map((id) => ({
        folder_id: folderId,
        [column]: id,
        created_by: userId ?? null,
      })),
    );
  if (error) throw error;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("substation_folders")
    .update({ name: name.trim() })
    .eq("id", folderId);
  if (error) throw error;
}

/**
 * Soft delete. The assignments cascade away with it, so the folder's substations fall back
 * to ungrouped — no report, asset or substation name is touched.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("substation_folders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", folderId);
  if (error) throw error;

  const { error: assignmentError } = await supabase
    .schema("neta_ops")
    .from("substation_folder_assignments")
    .delete()
    .eq("folder_id", folderId);
  if (assignmentError) throw assignmentError;

  if (!buildingLevelAvailable) return;
  const { error: buildingError } = await supabase
    .schema("neta_ops")
    .from("building_folder_assignments")
    .delete()
    .eq("folder_id", folderId);
  // A soft-deleted folder whose building rows survive would keep those buildings hidden
  // from the ungrouped list, so this is a real failure — except on an instance without the
  // table, where there is nothing to clean up.
  if (buildingError && !isMissingTable(buildingError)) throw buildingError;
}

export async function reorderFolders(folderIds: string[]): Promise<void> {
  // Small lists (a job has a handful of folders), so one update each is fine and keeps the
  // write honest — a bulk upsert here would need every column and could clobber a rename.
  await Promise.all(
    folderIds.map((id, index) =>
      supabase
        .schema("neta_ops")
        .from("substation_folders")
        .update({ sort_order: index })
        .eq("id", id)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );
}

/**
 * File a substation into a folder, or out of one.
 *
 * `folderId: null` writes a row rather than deleting one: on a job that inherited a folder
 * from its site, an absent row means "inherit" and a null row means "deliberately loose".
 *
 * Delete-then-insert rather than upsert. The uniqueness indexes are *partial* (one per
 * scope, each with a WHERE clause), and PostgREST emits `ON CONFLICT (cols)` with no
 * matching WHERE — Postgres then refuses to infer the index and the write fails. Two
 * statements are unambiguous and cost nothing at this size.
 */
export async function assignSubstation(
  scope: FolderScope,
  label: string,
  folderId: string | null,
  userId?: string | null,
): Promise<void> {
  const column = scopeColumn(scope);
  const value = scopeValue(scope);
  const key = substationKey(label);

  const { error: clearError } = await supabase
    .schema("neta_ops")
    .from("substation_folder_assignments")
    .delete()
    .eq(column, value)
    .eq("substation_key", key);
  if (clearError) throw clearError;

  const { error } = await supabase
    .schema("neta_ops")
    .from("substation_folder_assignments")
    .insert({
      [column]: value,
      substation_key: key,
      substation_label: label.trim(),
      folder_id: folderId,
      created_by: userId ?? null,
    });
  if (error) throw error;
}

/**
 * File a Building / Area into a folder, or out of one.
 *
 * The substation level's twin, for the same reasons: `folderId: null` writes a row rather
 * than deleting one, so a job can pull a building out of a folder it inherited from its
 * site without changing the site for everybody; and it is delete-then-insert rather than
 * upsert because the uniqueness indexes are partial and PostgREST cannot infer them.
 */
export async function assignBuilding(
  scope: FolderScope,
  label: string,
  folderId: string | null,
  userId?: string | null,
): Promise<void> {
  if (!buildingLevelAvailable) return;
  const column = scopeColumn(scope);
  const value = scopeValue(scope);
  const key = groupKey(label);

  const { error: clearError } = await supabase
    .schema("neta_ops")
    .from("building_folder_assignments")
    .delete()
    .eq(column, value)
    .eq("building_key", key);
  if (clearError) {
    if (isMissingTable(clearError)) {
      buildingLevelAvailable = false;
      return;
    }
    throw clearError;
  }

  const { error } = await supabase
    .schema("neta_ops")
    .from("building_folder_assignments")
    .insert({
      [column]: value,
      building_key: key,
      building_label: label.trim(),
      folder_id: folderId,
      created_by: userId ?? null,
    });
  if (error) throw error;
}
