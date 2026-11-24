/**
 * Hazard lists: the starter hazards for each kind of work (JSA/JHA scope, item 2).
 * neta_ops.safety_work_types (database/migrations/safety_02_job_jha.sql).
 *
 * Editors change draft_hazards. The safety lead approves it, which moves it to hazards.
 * Job JHAs copy hazards out, so later edits never touch an old JHA.
 */
import { supabase } from "@/lib/supabase";
import { describeSupabaseError } from "@/lib/supabaseRetry";

export interface ListHazard {
  key: string;
  hazard: string;
  controls: string;
}

export interface SafetyWorkType {
  key: string;
  name: string;
  /** Approved copy. Null until the first approval. */
  hazards: ListHazard[] | null;
  /** Edits waiting for approval. Null when there are none. */
  draft_hazards: ListHazard[] | null;
  sort_order: number;
  approved_by_name: string | null;
  approved_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

export interface HazardSuggestion {
  id: string;
  hazard: string;
  controls: string;
  job_id: string;
  work_types: { key: string; name: string }[];
  suggested_by_name: string | null;
  created_at: string;
}

const COLUMNS =
  "key, name, hazards, draft_hazards, sort_order, approved_by_name, approved_at, archived_at, updated_at";

const db = () => supabase.schema("neta_ops");
const table = () => db().from("safety_work_types");

function fail(error: Parameters<typeof describeSupabaseError>[0], status?: number): never {
  throw new Error(describeSupabaseError(error, status));
}

/** Changed by someone else since it was loaded. */
export class ChangedElsewhereError extends Error {}

/** What a JHA copies in: the approved list, or the unapproved one when nothing is approved yet. */
export const currentHazards = (w: SafetyWorkType): ListHazard[] => w.hazards ?? w.draft_hazards ?? [];

export const newHazardKey = () => `h_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export async function listWorkTypes(includeArchived = false): Promise<SafetyWorkType[]> {
  let query = table().select(COLUMNS).order("sort_order").order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error, status } = await query;
  if (error) fail(error, status);
  return (data ?? []) as SafetyWorkType[];
}

/** Saves over the version that was loaded, or throws ChangedElsewhereError. */
export async function saveWorkType(
  loaded: SafetyWorkType,
  changes: Partial<Pick<SafetyWorkType, "name" | "draft_hazards" | "archived_at">>,
): Promise<void> {
  const { data, error, status } = await table()
    .update(changes)
    .eq("key", loaded.key)
    .eq("updated_at", loaded.updated_at)
    .select("key");
  if (error) fail(error, status);
  if (!data || data.length === 0) {
    throw new ChangedElsewhereError("Someone else changed this list. Reload to see their version.");
  }
}

export async function addWorkType(name: string, sortOrder: number): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "list";
  // The random tail keeps a reused name from landing on an archived list
  const key = `${slug}_${crypto.randomUUID().slice(0, 6)}`;
  const { error, status } = await table().insert({ key, name: name.trim(), sort_order: sortOrder, draft_hazards: [] });
  if (error) fail(error, status);
  return key;
}

/** Safety lead only. Refuses if the list changed since it was loaded. */
export async function approveWorkType(loaded: SafetyWorkType): Promise<void> {
  const { error, status } = await db().rpc("approve_safety_work_type", {
    p_key: loaded.key,
    p_updated_at: loaded.updated_at,
  });
  if (error) fail(error, status);
}

export async function listOpenSuggestions(): Promise<HazardSuggestion[]> {
  const { data, error, status } = await db()
    .from("safety_hazard_suggestions")
    .select("id, hazard, controls, job_id, work_types, suggested_by_name, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) fail(error, status);
  return (data ?? []) as HazardSuggestion[];
}

/** Adds it to a list's waiting edits, or dismisses it when workTypeKey is null. */
export async function resolveSuggestion(id: string, workTypeKey: string | null): Promise<void> {
  const { error, status } = await db().rpc("resolve_hazard_suggestion", { p_id: id, p_work_type: workTypeKey });
  if (error) fail(error, status);
}
