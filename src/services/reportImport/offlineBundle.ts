import { supabase } from "@/lib/supabase";
import { ensureReportAssetLink } from "@/components/reports/linkReportAsset";

/**
 * Importer for files exported by the ampOS Offline desktop app (electron/).
 *
 * The offline app runs the same report components against a local copy of the
 * same tables, so each report in the file is just the rows that report saved,
 * already in this database's shape. One generic importer therefore covers
 * every report type: re-file the rows under the job being imported into, write
 * them, then create the asset + job link that makes the report show on the job.
 *
 * Offline reports are filed under a placeholder job ("offline") and a local
 * user id; both are swapped for the real job and the importing user here.
 */

/** Must match BUNDLE_FORMAT in electron/main/main.cts. */
export const OFFLINE_BUNDLE_FORMAT = "amp-report-bundle";
/** The offline app's built-in local user (electron/renderer/offlineSupabaseAdapter.ts). */
const OFFLINE_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface OfflineBundleRow {
  schema: string;
  table: string;
  row: Record<string, any>;
}

export interface OfflineBundleReport {
  reportId: string;
  slug: string;
  asset: {
    name?: string | null;
    status?: string | null;
    template_type?: string | null;
  };
  /** The report's own row first, then any child rows. */
  rows: OfflineBundleRow[];
}

export interface OfflineBundle {
  format: typeof OFFLINE_BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  source?: { app?: string; appVersion?: string; computer?: string };
  reports: OfflineBundleReport[];
}

export interface OfflineImportResult {
  name: string;
  outcome: "imported" | "skipped" | "failed";
  message?: string;
}

export function isOfflineBundle(data: unknown): data is OfflineBundle {
  return (
    !!data &&
    typeof data === "object" &&
    (data as any).format === OFFLINE_BUNDLE_FORMAT &&
    Array.isArray((data as any).reports)
  );
}

/** Swaps the offline placeholders for this job and user. */
function prepareRow(row: Record<string, any>, jobId: string, userId: string) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value === OFFLINE_USER_ID ? userId : value;
  }
  if ("job_id" in out) out.job_id = jobId;
  return out;
}

/**
 * Upserts one row by id. If this database lacks a column the offline app wrote
 * (PGRST204: an older or newer report version, or the offline store's own
 * created_at/updated_at), drop that column and try again rather than failing.
 */
async function writeRow(schema: string, table: string, row: Record<string, any>) {
  const payload = { ...row };
  for (let attempt = 0; attempt < 20; attempt++) {
    const { error } = await supabase
      .schema(schema)
      .from(table)
      .upsert(payload, { onConflict: "id" });
    if (!error) return;
    const missing = error.code === "PGRST204" ? /'([^']+)' column/.exec(error.message)?.[1] : null;
    if (!missing || !(missing in payload)) throw error;
    delete payload[missing];
  }
  throw new Error(`Could not save into ${schema}.${table}: too many unknown columns.`);
}

async function importOne(
  report: OfflineBundleReport,
  jobId: string,
  userId: string,
): Promise<OfflineImportResult> {
  const name = report.asset?.name || report.slug;
  const own = report.rows.find((r) => r.row?.id === report.reportId);
  if (!own) return { name, outcome: "failed", message: "No report data in the file." };

  const asset = {
    name,
    file_url: `report:/jobs/${jobId}/${report.slug}/${report.reportId}`,
    template_type: report.asset?.template_type ?? null,
    status: report.asset?.status ?? "in_progress",
  };

  // Imported before? Never overwrite: the online copy may have been edited since.
  const { data: existing, error: lookupError } = await supabase
    .schema(own.schema)
    .from(own.table)
    .select("id, job_id")
    .eq("id", report.reportId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if ((existing as any).job_id !== jobId) {
      return { name, outcome: "skipped", message: "Already imported to a different job." };
    }
    // Same job: make sure it is attached (repairs an earlier half-finished import).
    await ensureReportAssetLink(jobId, asset, userId);
    return { name, outcome: "skipped", message: "Already on this job." };
  }

  for (const r of report.rows) {
    await writeRow(r.schema, r.table, prepareRow(r.row, jobId, userId));
  }
  await ensureReportAssetLink(jobId, asset, userId);
  return { name, outcome: "imported" };
}

/** Imports every report in an offline export file into the given job. */
export async function importOfflineBundle(
  bundle: OfflineBundle,
  jobId: string,
  userId: string,
): Promise<OfflineImportResult[]> {
  const results: OfflineImportResult[] = [];
  for (const report of bundle.reports) {
    try {
      results.push(await importOne(report, jobId, userId));
    } catch (error: any) {
      console.error("Offline report import failed:", report.reportId, error);
      results.push({
        name: report.asset?.name || report.slug,
        outcome: "failed",
        message: error?.message || String(error),
      });
    }
  }
  return results;
}

/** One-line summary for a toast, e.g. "Imported 3. Skipped 1 (already on this job)." */
export function summarizeOfflineImport(results: OfflineImportResult[]): string {
  const imported = results.filter((r) => r.outcome === "imported").length;
  const skipped = results.filter((r) => r.outcome === "skipped");
  const failed = results.filter((r) => r.outcome === "failed");
  const parts = [`Imported ${imported} report${imported === 1 ? "" : "s"}.`];
  if (skipped.length) {
    const reasons = [...new Set(skipped.map((r) => r.message?.replace(/\.$/, "").toLowerCase()))];
    parts.push(`Skipped ${skipped.length} (${reasons.join("; ")}).`);
  }
  if (failed.length) {
    parts.push(
      `${failed.length} failed: ${failed.map((r) => `${r.name}: ${r.message}`).join("; ")}`,
    );
  }
  return parts.join(" ");
}
