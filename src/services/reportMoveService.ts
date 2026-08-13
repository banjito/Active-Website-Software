import { supabase } from "@/lib/supabase";

/**
 * Moving reports between jobs.
 *
 * When a site runs two projects at once (two jobs at the same substation), a report gets
 * filed under the wrong one often enough that retyping it is a real cost. A report is
 * attached to its job in three places at once — the job_assets link, the /jobs/{id}/ segment
 * of assets.file_url, and the job_id column in the report's own table — so the move happens
 * server-side in one transaction. See database/migrations/move_reports_between_jobs.sql.
 */

/** A job offered as a move destination. */
export interface MoveTargetJob {
  id: string;
  title: string | null;
  jobNumber: string | null;
  status: string | null;
  customerName: string | null;
  /** True when this job is at the same site as the one being moved from. */
  sameSite: boolean;
}

export interface MovedReport {
  assetId: string;
  assetName: string | null;
  newFileUrl: string | null;
  /**
   * False when only the link and the route moved. True for a normal report; false for an
   * uploaded PDF/document, which has no report row of its own to update.
   */
  reportRowUpdated: boolean;
}

/** Raised when the database migration for this feature has not been applied yet. */
export class MoveNotAvailableError extends Error {
  constructor() {
    super(
      "Moving reports between jobs is not enabled on this instance yet. " +
        "Apply database/migrations/move_reports_between_jobs.sql, then try again.",
    );
    this.name = "MoveNotAvailableError";
  }
}

/** PostgREST codes meaning "that function isn't there", i.e. migration not applied. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

export function describeJob(job: MoveTargetJob): string {
  return [job.jobNumber, job.title].filter(Boolean).join(" — ") || job.id;
}

/**
 * Jobs the given job's reports can be moved to.
 *
 * Jobs at the same site come first and are marked, because that is the case this exists
 * for: two concurrent projects at one facility, whose reports are the ones that get mixed
 * up. Everything else is still reachable by typing.
 */
export async function fetchMoveTargetJobs(
  sourceJobId: string,
  query: string,
  limit = 25,
): Promise<MoveTargetJob[]> {
  const term = query.trim();

  // The source job's site, so same-site jobs can be surfaced. Missing column/table means
  // the asset-tracking migration hasn't run here; the picker just loses the grouping.
  let siteId: string | null = null;
  const { data: sourceJob, error: sourceError } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("site_id")
    .eq("id", sourceJobId)
    .maybeSingle();

  if (sourceError && sourceError.code !== "42703" && sourceError.code !== "42P01") {
    throw new Error(`Could not read the current job: ${sourceError.message}`);
  }
  if (!sourceError) {
    siteId = (sourceJob as { site_id?: string | null } | null)?.site_id ?? null;
  }

  // Customers live in another schema, so they are resolved in a second query rather than
  // embedded — a cross-schema embed is not something PostgREST can be relied on for here.
  const runQuery = async (siteOnly: boolean) => {
    let request = supabase
      .schema("neta_ops")
      .from("jobs")
      .select("id, title, job_number, status, customer_id")
      .neq("id", sourceJobId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (siteOnly && siteId) request = request.eq("site_id", siteId);
    if (term) {
      request = request.or(`title.ilike.%${term}%,job_number.ilike.%${term}%`);
    }

    const { data, error } = await request;
    if (error) throw new Error(`Could not load jobs: ${error.message}`);
    return (data ?? []) as Array<Record<string, any>>;
  };

  const sameSiteRows = siteId ? await runQuery(true) : [];
  const otherRows = await runQuery(false);

  const sameSiteIds = new Set(sameSiteRows.map((row) => String(row.id)));
  const seen = new Set<string>();
  const rows: Array<Record<string, any>> = [];
  for (const row of [...sameSiteRows, ...otherRows]) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
  }
  const limited = rows.slice(0, limit);

  const customerNames = await fetchCustomerNames(
    limited.map((row) => row.customer_id).filter(Boolean).map(String),
  );

  return limited.map((row) => ({
    id: String(row.id),
    title: (row.title as string) ?? null,
    jobNumber: (row.job_number as string) ?? null,
    status: (row.status as string) ?? null,
    customerName: customerNames[String(row.customer_id)] ?? null,
    sameSite: sameSiteIds.has(String(row.id)),
  }));
}

/** Customer display names by id. Best-effort: the picker still works without them. */
async function fetchCustomerNames(
  customerIds: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(customerIds));
  if (unique.length === 0) return {};

  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("id, name, company_name")
    .in("id", unique);

  if (error) {
    console.warn("Could not load customer names for the move picker:", error.message);
    return {};
  }

  const names: Record<string, string> = {};
  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const label = (row.company_name as string) || (row.name as string);
    if (label) names[String(row.id)] = label;
  }
  return names;
}

/**
 * Moves reports from one job to another.
 *
 * All-or-nothing: the RPC runs in a single transaction, so a failure leaves every report
 * exactly where it was rather than half-moved. Assets that turn out not to be on the
 * source job are skipped silently and are simply absent from the result.
 */
export async function moveReportsToJob(params: {
  assetIds: string[];
  sourceJobId: string;
  targetJobId: string;
  reason?: string;
}): Promise<MovedReport[]> {
  const { assetIds, sourceJobId, targetJobId, reason } = params;
  if (assetIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("neta_ops")
    .rpc("move_report_assets_to_job", {
      p_asset_ids: assetIds,
      p_source_job_id: sourceJobId,
      p_target_job_id: targetJobId,
      p_reason: reason?.trim() || null,
    });

  if (error) {
    if (MISSING_FUNCTION_CODES.has(error.code ?? "")) throw new MoveNotAvailableError();
    throw new Error(error.message || "The move could not be completed.");
  }

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    assetId: String(row.asset_id),
    assetName: (row.asset_name as string) ?? null,
    newFileUrl: (row.new_file_url as string) ?? null,
    reportRowUpdated: Boolean(row.report_row_updated),
  }));
}
