import { supabase } from "@/lib/supabase";
import { mergeFolderScopes, substationKey } from "@/utils/substationFolders";
import type {
  FolderItemAssignment,
  FolderScope,
  ResolvedFolders,
  SubstationFolder,
  SubstationFolderAssignment,
} from "@/lib/types/substationFolders";

// Folder level above substation. See database/migrations/create_substation_folders.sql.

const FOLDER_COLUMNS =
  "id, site_id, job_id, name, sort_order, created_by, created_at, updated_at, deleted_at, substation_key, parent_folder_id";
const ASSIGNMENT_COLUMNS =
  "id, site_id, job_id, substation_key, substation_label, folder_id, sort_order, created_at, updated_at";
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

/** 42P01 = table missing, i.e. create_substation_folders.sql hasn't been applied here. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

const UNAVAILABLE: ResolvedFolders = {
  folders: [],
  innerFolders: [],
  itemFolderById: new Map(),
  assignmentByKey: new Map(),
  available: false,
};

/** 42703 = column missing, i.e. the nesting migration hasn't been applied here. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

function folderColumns(): string {
  return nestingAvailable
    ? FOLDER_COLUMNS
    : FOLDER_COLUMNS.replace(", substation_key, parent_folder_id", "");
}

function scopeColumn(scope: FolderScope): "site_id" | "job_id" {
  return scope.siteId ? "site_id" : "job_id";
}

function scopeValue(scope: FolderScope): string {
  return (scope.siteId ?? scope.jobId) as string;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

async function fetchScope(
  scope: FolderScope,
): Promise<{ folders: SubstationFolder[]; assignments: SubstationFolderAssignment[] } | null> {
  const column = scopeColumn(scope);
  const value = scopeValue(scope);

  const readFolders = () =>
    supabase
      .schema("neta_ops")
      .from("substation_folders")
      .select(folderColumns())
      .eq(column, value)
      .is("deleted_at", null);

  const [initialFolderResult, assignmentResult] = await Promise.all([
    readFolders(),
    supabase
      .schema("neta_ops")
      .from("substation_folder_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq(column, value),
  ]);
  let folderResult = initialFolderResult;

  // Drop the nesting columns and retry once if this instance predates that migration.
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
  };
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
    jobFolders: job?.folders,
    jobAssignments: job?.assignments,
    itemFolderById: await fetchItemAssignments(innerFolderIds),
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

export async function createFolder(
  scope: FolderScope,
  name: string,
  sortOrder: number,
  userId?: string | null,
  /** Omitted for an outer folder holding substations; set for one living inside a substation. */
  placement?: { substationLabel: string; parentFolderId?: string | null },
): Promise<SubstationFolder> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("substation_folders")
    .insert({
      [scopeColumn(scope)]: scopeValue(scope),
      name: name.trim(),
      sort_order: sortOrder,
      created_by: userId ?? null,
      ...(placement
        ? {
            substation_key: substationKey(placement.substationLabel),
            parent_folder_id: placement.parentFolderId ?? null,
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
