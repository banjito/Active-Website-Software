import { supabase } from "@/lib/supabase";
import type {
  ScheduledTest,
  ScheduledTestInput,
  ScheduledTestRow,
} from "@/lib/types/testScheduling";
import type { EquipmentAsset } from "@/lib/types/assetTracking";

// The scheduling layer. A scheduled test is one asset + one scope of work + one date
// window + status — see src/lib/types/testScheduling.ts.
//
// Asset columns (Substation, Identifier, Part of, Equipment Type, Building/Area) are
// never copied onto a scheduled test. They're joined at render time by joinAssets()
// below, so re-identifying a breaker moves its whole schedule with it. The one exception
// is `result`, which is cached on the row because the tracker sorts and filters on it
// across hundreds of rows.

const SCHEDULED_TEST_COLUMNS =
  "id, site_id, equipment_asset_id, job_id, report_slug, custom_form_template_id, " +
  "work_scheduled_text, start_date, finish_date, equipment_status, testing_status, " +
  "report_asset_id, result, notes, source, external_activity_id, external_batch_id, " +
  "has_date_constraint, created_by, updated_by, created_at, updated_at, deleted_at";

/** Table-missing — this instance hasn't run create_scheduled_tests.sql yet. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

/**
 * Whether scheduling exists on this database.
 *
 * Assumed present until a read says otherwise, then remembered for the session, so an
 * instance without the migration shows a "run this migration" panel instead of a page of
 * errors. Same degradation the Phase 1 asset service uses for its optional columns.
 */
let schedulingSupported = true;
export function supportsScheduling(): boolean {
  return schedulingSupported;
}

/** Supabase `.in()` gets unwieldy well before this; chunk any id list past it. */
const IN_CHUNK_SIZE = 200;
const INSERT_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function table() {
  return supabase.schema("neta_ops").from("scheduled_tests");
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchScheduledTestsForSite(
  siteId: string,
): Promise<ScheduledTest[]> {
  const { data, error } = await table()
    .select(SCHEDULED_TEST_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("finish_date", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingTable(error)) {
      schedulingSupported = false;
      return [];
    }
    throw error;
  }
  return (data ?? []) as unknown as ScheduledTest[];
}

export async function fetchScheduledTestsForJob(jobId: string): Promise<ScheduledTest[]> {
  const { data, error } = await table()
    .select(SCHEDULED_TEST_COLUMNS)
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("finish_date", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingTable(error)) {
      schedulingSupported = false;
      return [];
    }
    throw error;
  }
  return (data ?? []) as unknown as ScheduledTest[];
}

export async function fetchScheduledTestsForAssets(
  assetIds: string[],
): Promise<ScheduledTest[]> {
  if (assetIds.length === 0) return [];

  const rows: ScheduledTest[] = [];
  for (const ids of chunk(assetIds, IN_CHUNK_SIZE)) {
    const { data, error } = await table()
      .select(SCHEDULED_TEST_COLUMNS)
      .in("equipment_asset_id", ids)
      .is("deleted_at", null);

    if (error) {
      if (isMissingTable(error)) {
        schedulingSupported = false;
        return [];
      }
      throw error;
    }
    rows.push(...((data ?? []) as unknown as ScheduledTest[]));
  }
  return rows;
}

/**
 * Attach each scheduled test to the asset it covers.
 *
 * Done client-side against an asset list the page already has, rather than as a PostgREST
 * embed: "Part of" needs a self-join through equipment_assets.parent_asset_id, and that
 * column is optional on instances that haven't run the sub-asset migration. A row whose
 * asset isn't in the list is dropped — it belongs to a different site.
 */
export function joinAssets(
  tests: ScheduledTest[],
  assets: EquipmentAsset[],
): ScheduledTestRow[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const rows: ScheduledTestRow[] = [];

  for (const test of tests) {
    const asset = byId.get(test.equipment_asset_id);
    if (!asset) continue;
    const parent = asset.parent_asset_id ? byId.get(asset.parent_asset_id) : undefined;
    rows.push({
      ...test,
      identifier: asset.identifier,
      substation: asset.substation ?? null,
      building_area: asset.building_area ?? null,
      equipment_location: asset.equipment_location ?? null,
      equipment_type: asset.equipment_type ?? null,
      part_of: parent?.identifier ?? null,
    });
  }
  return rows;
}

/** How many scheduled tests each asset has, for the count badge on the asset list. */
export function countByAsset(tests: ScheduledTest[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const test of tests) {
    counts.set(
      test.equipment_asset_id,
      (counts.get(test.equipment_asset_id) ?? 0) + 1,
    );
  }
  return counts;
}

// ── Writes ────────────────────────────────────────────────────────────────────

function migrationError(): Error {
  return new Error(
    "Test scheduling isn't set up on this database yet. Run " +
      "database/migrations/create_scheduled_tests.sql in the Supabase SQL editor, then reload.",
  );
}

/**
 * Normalize a form's output into a row.
 *
 * Work Scheduled is three mutually exclusive columns and the database enforces that at
 * least one is set, so the two that don't apply are explicitly nulled — otherwise editing
 * a scheduled test from "Insulation Resistance" to free text would leave both populated
 * and the tracker wouldn't know which to show.
 */
function normalizeInput(input: ScheduledTestInput) {
  const text = (v: string | null | undefined) => v?.trim() || null;
  const slug = text(input.report_slug);
  const customFormId = input.custom_form_template_id || null;
  const freeText = text(input.work_scheduled_text);

  return {
    site_id: input.site_id,
    equipment_asset_id: input.equipment_asset_id,
    job_id: input.job_id || null,
    report_slug: slug,
    custom_form_template_id: slug ? null : customFormId,
    work_scheduled_text: slug || customFormId ? null : freeText,
    start_date: input.start_date || null,
    finish_date: input.finish_date || null,
    equipment_status: input.equipment_status || null,
    testing_status: input.testing_status || "not_started",
    notes: text(input.notes),
  };
}

function assertWorkScheduled(input: ScheduledTestInput) {
  if (
    !input.report_slug?.trim() &&
    !input.custom_form_template_id &&
    !input.work_scheduled_text?.trim()
  ) {
    throw new Error("Choose what work is being scheduled, or describe it.");
  }
}

export async function createScheduledTest(
  input: ScheduledTestInput,
  userId?: string,
): Promise<ScheduledTest> {
  assertWorkScheduled(input);

  const { data, error } = await table()
    .insert({ ...normalizeInput(input), created_by: userId ?? null })
    .select(SCHEDULED_TEST_COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) {
      schedulingSupported = false;
      throw migrationError();
    }
    throw error;
  }
  return data as unknown as ScheduledTest;
}

/**
 * Schedule many assets in one action — the batch modal and the "also schedule the items
 * inside this asset" checkbox both land here.
 *
 * Recorded as a batch so the whole thing can be undone: scheduling 29 activities across
 * a data hall and then finding the wrong template was picked is otherwise 29 deletes.
 */
export async function createScheduledTests(
  inputs: ScheduledTestInput[],
  userId?: string,
  description?: string,
): Promise<{ created: ScheduledTest[]; batchId: string | null }> {
  if (inputs.length === 0) return { created: [], batchId: null };
  inputs.forEach(assertWorkScheduled);

  const created: ScheduledTest[] = [];
  for (const batch of chunk(inputs, INSERT_CHUNK_SIZE)) {
    const { data, error } = await table()
      .insert(
        batch.map((input) => ({ ...normalizeInput(input), created_by: userId ?? null })),
      )
      .select(SCHEDULED_TEST_COLUMNS);

    if (error) {
      if (isMissingTable(error)) {
        schedulingSupported = false;
        throw migrationError();
      }
      throw error;
    }
    created.push(...((data ?? []) as unknown as ScheduledTest[]));
  }

  const batchId = await recordBatch({
    siteId: inputs[0].site_id,
    action: "create",
    description:
      description ??
      `Scheduled ${created.length} item${created.length === 1 ? "" : "s"}`,
    // No before_data: undoing a create deletes the row rather than restoring anything.
    items: created.map((test) => ({ scheduledTestId: test.id, before: null, after: test })),
    userId,
  });

  return { created, batchId };
}

export async function updateScheduledTest(
  id: string,
  patch: Partial<ScheduledTestInput>,
  userId?: string,
): Promise<ScheduledTest> {
  const payload: Record<string, unknown> = { updated_by: userId ?? null };

  // Only the keys the caller actually passed are written, so a drawer that edits one
  // date doesn't blank out the notes.
  if ("start_date" in patch) payload.start_date = patch.start_date || null;
  if ("finish_date" in patch) payload.finish_date = patch.finish_date || null;
  if ("equipment_status" in patch)
    payload.equipment_status = patch.equipment_status || null;
  if ("testing_status" in patch)
    payload.testing_status = patch.testing_status || "not_started";
  if ("notes" in patch) payload.notes = patch.notes?.trim() || null;
  if ("job_id" in patch) payload.job_id = patch.job_id || null;

  // Work Scheduled moves as a unit: setting any one of the three clears the other two.
  if (
    "report_slug" in patch ||
    "custom_form_template_id" in patch ||
    "work_scheduled_text" in patch
  ) {
    const slug = patch.report_slug?.trim() || null;
    const customFormId = patch.custom_form_template_id || null;
    payload.report_slug = slug;
    payload.custom_form_template_id = slug ? null : customFormId;
    payload.work_scheduled_text =
      slug || customFormId ? null : patch.work_scheduled_text?.trim() || null;
  }

  const { data, error } = await table()
    .update(payload)
    .eq("id", id)
    .select(SCHEDULED_TEST_COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) {
      schedulingSupported = false;
      throw migrationError();
    }
    // 23514 = a CHECK failed. The only one a user can trigger from the UI is the date
    // order, so name it rather than showing a constraint name.
    if (error.code === "23514") {
      throw new Error("Finish date can't be before start date.");
    }
    throw error;
  }
  return data as unknown as ScheduledTest;
}

/** Soft delete, so it can be undone and stays in the audit trail. */
export async function deleteScheduledTest(id: string): Promise<void> {
  const { error } = await table()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (isMissingTable(error)) throw migrationError();
    throw error;
  }
}

/**
 * Point a scheduled test at the report that completed it, and advance its status.
 *
 * `not_started` becomes `in_progress` on link, because a report existing means somebody
 * started. Any status a human has already set is left alone — the tracker must never
 * quietly overwrite a call a PM made.
 */
export async function linkReportToScheduledTest(
  scheduledTestId: string,
  reportAssetId: string | null,
  currentStatus?: string,
): Promise<void> {
  const payload: Record<string, unknown> = { report_asset_id: reportAssetId };
  if (reportAssetId && currentStatus === "not_started") {
    payload.testing_status = "in_progress";
  }

  const { error } = await table().update(payload).eq("id", scheduledTestId);
  if (error && !isMissingTable(error)) throw error;
}

// ── Batches ───────────────────────────────────────────────────────────────────

interface BatchItem {
  scheduledTestId: string;
  /** Null when the batch created the row — undoing it deletes rather than restores. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Record a bulk write so it can be reversed as one action.
 *
 * Best-effort: a failed batch log must never roll back a write that already landed, so
 * this logs and returns null rather than throwing. Losing the undo is bad; losing the
 * user's 47 edits because the audit insert failed is worse.
 */
async function recordBatch(args: {
  siteId: string;
  action: string;
  description: string;
  items: BatchItem[];
  userId?: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("scheduled_test_batches")
      .insert({
        site_id: args.siteId,
        action: args.action,
        description: args.description,
        item_count: args.items.length,
        created_by: args.userId ?? null,
      })
      .select("id")
      .single();

    if (error || !data) return null;
    const batchId = (data as { id: string }).id;

    for (const items of chunk(args.items, INSERT_CHUNK_SIZE)) {
      await supabase
        .schema("neta_ops")
        .from("scheduled_test_batch_items")
        .insert(
          items.map((item) => ({
            batch_id: batchId,
            scheduled_test_id: item.scheduledTestId,
            before_data: item.before,
            after_data: item.after,
          })),
        );
    }
    return batchId;
  } catch (e) {
    console.error("Failed to record scheduled-test batch", e);
    return null;
  }
}

/**
 * Reverse a whole batch: restore every row's before-state, and delete the rows the batch
 * created. Idempotent — an already-undone batch is a no-op.
 */
export async function undoBatch(batchId: string, userId?: string): Promise<number> {
  const { data: batch, error: batchError } = await supabase
    .schema("neta_ops")
    .from("scheduled_test_batches")
    .select("id, undone_at")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) {
    if (isMissingTable(batchError)) throw migrationError();
    throw batchError;
  }
  if (!batch || (batch as { undone_at?: string }).undone_at) return 0;

  const { data: items, error: itemsError } = await supabase
    .schema("neta_ops")
    .from("scheduled_test_batch_items")
    .select("scheduled_test_id, before_data")
    .eq("batch_id", batchId);
  if (itemsError) throw itemsError;

  const rows = (items ?? []) as {
    scheduled_test_id: string;
    before_data: Record<string, unknown> | null;
  }[];

  const createdIds = rows.filter((r) => !r.before_data).map((r) => r.scheduled_test_id);
  for (const ids of chunk(createdIds, IN_CHUNK_SIZE)) {
    const { error } = await table()
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
  }

  for (const row of rows) {
    if (!row.before_data) continue;
    const { error } = await table()
      .update({ ...row.before_data, updated_by: userId ?? null })
      .eq("id", row.scheduled_test_id);
    if (error) throw error;
  }

  await supabase
    .schema("neta_ops")
    .from("scheduled_test_batches")
    .update({ undone_at: new Date().toISOString(), undone_by: userId ?? null })
    .eq("id", batchId);

  return rows.length;
}
