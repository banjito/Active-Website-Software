/**
 * Attach a generated file to a job as a report asset.
 *
 * Mirrors the "Upload File" path in JobDetail so anything sent from elsewhere
 * in the app lands in the same place and shows up in the job's Reports tab for
 * review.
 */

import { supabase } from "@/lib/supabase";

/** Jobs offered in a "send to job" picker. */
export interface JobOption {
  id: string;
  title: string | null;
  jobNumber: string | null;
}

/** Search jobs by number or title for the picker. */
export async function searchJobs(query: string, limit = 20): Promise<JobOption[]> {
  let request = supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id, title, job_number")
    .order("created_at", { ascending: false })
    .limit(limit);

  const term = query.trim();
  if (term) {
    request = request.or(`title.ilike.%${term}%,job_number.ilike.%${term}%`);
  }

  const { data, error } = await request;
  if (error) throw new Error(`Could not load jobs: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: (row.title as string) ?? null,
    jobNumber: (row.job_number as string) ?? null,
  }));
}

/**
 * Substation folder segment out of a report asset's URL.
 *
 * Grounding reports use /jobs/:jobId/:slug/:substation/:reportId. Decoding
 * matches JobDetail: legacy links were lowercased and underscore-separated,
 * newer ones are properly encoded.
 */
function substationFromUrl(fileUrl: string | null): string | null {
  if (!fileUrl) return null;
  const parts = fileUrl.split("?")[0].split("/").filter(Boolean);
  const jobsAt = parts.indexOf("jobs");
  // Need jobs/:jobId/:slug/:substation/:reportId to be sure of the segment.
  if (jobsAt === -1 || parts.length < jobsAt + 5) return null;

  const segment = parts[jobsAt + 3];
  if (!segment || segment === "general") return null;

  // Only grounding reports carry a substation folder; every other report puts
  // its id in this position. Anything id-shaped is therefore not a substation.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment,
    );
  if (isUuid || /^\d+$/.test(segment)) return null;

  if (/^[a-z0-9_-]+$/.test(segment)) return segment.replace(/_/g, " ");
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Substations already in use on a job.
 *
 * Substation is free text, so existing values are the only real vocabulary —
 * offering them keeps spellings consistent instead of accumulating
 * "Main Sub" / "Main Substation" variants.
 *
 * Covers the two sources readable without a per-asset lookup: the assets
 * column (written by file uploads, including this one) and the URL folder
 * segment. Reports that keep their substation inside the report row are not
 * included; resolving those needs the slug-to-table map that JobDetail
 * defines inline, so it is deliberately out of scope here.
 */
export async function fetchJobSubstations(jobId: string): Promise<string[]> {
  const { data: links, error: linkError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id")
    .eq("job_id", jobId);

  if (linkError) {
    throw new Error(`Could not load the job's assets: ${linkError.message}`);
  }

  const assetIds = (links ?? []).map((l: { asset_id: string }) => l.asset_id);
  if (assetIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("substation, file_url")
    .in("id", assetIds);

  if (error) {
    throw new Error(`Could not load substations: ${error.message}`);
  }

  const unique = new Set<string>();
  for (const row of (data ?? []) as {
    substation: string | null;
    file_url: string | null;
  }[]) {
    const stored = row.substation?.trim();
    if (stored) {
      unique.add(stored);
      continue;
    }
    const fromUrl = substationFromUrl(row.file_url)?.trim();
    if (fromUrl) unique.add(fromUrl);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export interface UploadJobAssetInput {
  jobId: string;
  file: File;
  /** Asset name shown in the Reports tab. */
  name: string;
  substation?: string;
}

/**
 * Upload the file and register it as a job asset.
 *
 * Storage falls back from job-documents to documents, matching JobDetail:
 * instances differ on which bucket exists.
 */
export async function uploadJobAsset({
  jobId,
  file,
  name,
  substation,
}: UploadJobAssetInput): Promise<{ assetId: string; publicUrl: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  const fileExt = file.name.split(".").pop() || "pdf";
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
  const filePath = `job-pdf-reports/${jobId}/${fileName}`;

  let bucket = "job-documents";
  const { error: primaryError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { cacheControl: "3600", upsert: false });

  if (primaryError) {
    bucket = "documents";
    const { error: fallbackError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (fallbackError) {
      throw new Error(
        `Could not upload the file: ${fallbackError.message}. Check that the 'job-documents' or 'documents' storage bucket exists.`,
      );
    }
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);
  const publicUrl = publicUrlData.publicUrl;
  const now = new Date().toISOString();

  // ready_for_review is what surfaces the asset in the job's Reports tab.
  const { data: assetData, error: assetError } = await supabase
    .schema("neta_ops")
    .from("assets")
    .insert({
      name: name.trim(),
      file_url: publicUrl,
      substation: substation?.trim() || null,
      created_at: now,
      status: "ready_for_review",
      submitted_at: now,
      submitted_by: userId,
    })
    .select("id")
    .single();

  if (assetError) {
    throw new Error(`Could not create the asset: ${assetError.message}`);
  }

  const { error: linkError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .insert({ job_id: jobId, asset_id: assetData.id, user_id: userId });

  if (linkError) {
    throw new Error(`Could not link the asset to the job: ${linkError.message}`);
  }

  return { assetId: String(assetData.id), publicUrl };
}
