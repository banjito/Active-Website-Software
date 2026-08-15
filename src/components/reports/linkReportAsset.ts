import { supabase } from "@/lib/supabase";

/**
 * A saved report is two halves: the data row (in the report's own table) and an
 * `assets` row + `job_assets` link that make it show up on the job. Reports used
 * to create the second half with the error thrown away, so a single failed
 * insert left the data stranded in the database and invisible in the app,
 * permanently — later saves only updated the data row.
 *
 * `ensureReportAssetLink` is the one way to create that second half. It is
 * idempotent, so calling it on every save both creates the link the first time
 * and repairs a report that lost it. It retries transient failures and throws a
 * plain-English error if it truly cannot finish, instead of failing silently.
 */

export interface ReportAssetInput {
  /** "<Report name> - <equipment identifier>", from getAssetName(). */
  name: string;
  /** `report:/jobs/<jobId>/<reportSlug>/<reportId>` — the report's identity. */
  file_url: string;
  user_id?: string | null;
  template_type?: string | null;
  /** Only applied when the asset is first created; never overwrites workflow state. */
  status?: string | null;
}

const RETRY_DELAYS_MS = [400, 1200, 3000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates (or repairs) the asset row and job link for a saved report.
 * Returns the asset id. Throws if it cannot be completed after retries.
 */
export async function ensureReportAssetLink(
  jobId: string,
  asset: ReportAssetInput,
  userId?: string | null,
): Promise<string> {
  if (!jobId) throw new Error("Cannot link a report to the job: missing job id.");
  if (!asset?.file_url) throw new Error("Cannot link a report to the job: missing report reference.");

  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await linkOnce(jobId, asset, userId);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Your test data was saved, but the report could not be attached to the job (${detail}). ` +
      `It will be attached automatically the next time this report is saved.`,
  );
}

async function linkOnce(
  jobId: string,
  asset: ReportAssetInput,
  userId?: string | null,
): Promise<string> {
  // An asset is identified by its file_url, which contains the report id.
  const { data: existing, error: lookupError } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("id, name")
    .eq("file_url", asset.file_url)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  let assetId = existing?.id as string | undefined;

  if (!assetId) {
    const { data: created, error: insertError } = await supabase
      .schema("neta_ops")
      .from("assets")
      .insert({
        name: asset.name,
        file_url: asset.file_url,
        user_id: asset.user_id ?? userId ?? null,
        template_type: asset.template_type ?? null,
        status: asset.status ?? "in_progress",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    assetId = created.id;
  } else if (asset.name && existing?.name !== asset.name) {
    // Keep the asset name in step with the equipment identifier on the report,
    // so a report renamed after its first save is still findable by name.
    const { error: renameError } = await supabase
      .schema("neta_ops")
      .from("assets")
      .update({ name: asset.name })
      .eq("id", assetId);

    if (renameError) throw renameError;
  }

  const { data: link, error: linkLookupError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id")
    .eq("job_id", jobId)
    .eq("asset_id", assetId)
    .maybeSingle();

  if (linkLookupError) throw linkLookupError;

  if (!link) {
    const { error: linkError } = await supabase
      .schema("neta_ops")
      .from("job_assets")
      .insert({ job_id: jobId, asset_id: assetId, user_id: userId ?? null });

    if (linkError) throw linkError;
  }

  return assetId;
}

export default ensureReportAssetLink;
