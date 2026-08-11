/**
 * Persistence for converted oil analysis reports.
 *
 * A conversion costs an OCR pass plus a DeepSeek call, so results are saved
 * once and read back by id afterwards. See
 * database/migrations/create_oil_analysis_reports.sql.
 */

import { supabase } from "@/lib/supabase";
import type { OilReport } from "@/lib/oilReport";

const TABLE = "oil_analysis_reports";

/** A saved row, as the list view needs it. */
export interface SavedConversion {
  id: string;
  batchId: string;
  label: string;
  siteName: string | null;
  sourceFile: string | null;
  latestSampleDate: string | null;
  latestCondition: string | null;
  createdAt: string;
}

/** A saved row with its full payload. */
export interface SavedReport extends SavedConversion {
  report: OilReport;
}

interface Row {
  id: string;
  batch_id: string;
  label: string;
  site_name: string | null;
  source_file: string | null;
  latest_sample_date: string | null;
  latest_condition: string | null;
  created_at: string;
  report?: OilReport;
}

function toSaved(row: Row): SavedReport {
  return {
    id: row.id,
    batchId: row.batch_id,
    label: row.label,
    siteName: row.site_name,
    sourceFile: row.source_file,
    latestSampleDate: row.latest_sample_date,
    latestCondition: row.latest_condition,
    createdAt: row.created_at,
    // Older rows always have a payload; the cast keeps the list query, which
    // deliberately omits it, from having to widen this type.
    report: row.report as OilReport,
  };
}

/**
 * Persist every unit from one converted PDF.
 *
 * Returns the saved rows in the order they were parsed, so the caller can jump
 * straight to the first one.
 */
export async function saveConversion(
  reports: OilReport[],
  sourceFile: string,
): Promise<SavedReport[]> {
  const batchId = crypto.randomUUID();
  const { data: auth } = await supabase.auth.getUser();

  const rows = reports.map((report) => ({
    batch_id: batchId,
    label: report.label,
    site_name: report.siteName || null,
    source_file: sourceFile,
    latest_sample_date: report.samples[0]?.sampleDate ?? null,
    latest_condition: report.samples[0]?.dgaCondition ?? null,
    report,
    created_by: auth?.user?.id ?? null,
  }));

  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .insert(rows)
    .select();

  if (error) throw new Error(`Could not save the conversion: ${error.message}`);
  return (data as Row[]).map(toSaved);
}

/** Most recent conversions for the index list. Payload omitted on purpose. */
export async function listConversions(limit = 50): Promise<SavedConversion[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select(
      "id, batch_id, label, site_name, source_file, latest_sample_date, latest_condition, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load conversions: ${error.message}`);
  return (data as Row[]).map(toSaved);
}

/** One saved report, with its payload. */
export async function getConversion(id: string): Promise<SavedReport> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Could not load that report: ${error.message}`);
  return toSaved(data as Row);
}

/** Sibling units that came from the same uploaded PDF. */
export async function getBatch(batchId: string): Promise<SavedReport[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load that batch: ${error.message}`);
  return (data as Row[]).map(toSaved);
}

/** Remove one saved report. */
export async function deleteConversion(id: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Could not delete that report: ${error.message}`);
}
