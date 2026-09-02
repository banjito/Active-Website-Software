/**
 * Persistence for converted AMP-lify reports.
 *
 * A conversion costs a DeepSeek call, so results are saved once and read back
 * by id afterwards. See database/migrations/create_amplify_reports.sql.
 */

import { supabase } from "@/lib/supabase";
import type { AmplifyReport } from "@/lib/amplifyReport";

const TABLE = "amplify_reports";

/** A saved row, as the list view needs it. */
export interface SavedAmplifyConversion {
  id: string;
  batchId: string;
  /** Position within the upload, in source order. Null on pre-column rows. */
  batchIndex: number | null;
  label: string;
  siteName: string | null;
  sourceFile: string | null;
  reportDate: string | null;
  status: string | null;
  createdAt: string;
}

/** A saved row with its full payload. */
export interface SavedAmplifyReport extends SavedAmplifyConversion {
  report: AmplifyReport;
}

interface Row {
  id: string;
  batch_id: string;
  batch_index: number | null;
  label: string;
  site_name: string | null;
  source_file: string | null;
  report_date: string | null;
  status: string | null;
  created_at: string;
  report?: AmplifyReport;
}

function toSaved(row: Row): SavedAmplifyReport {
  return {
    id: row.id,
    batchId: row.batch_id,
    batchIndex: row.batch_index ?? null,
    label: row.label,
    siteName: row.site_name,
    sourceFile: row.source_file,
    reportDate: row.report_date,
    status: row.status,
    createdAt: row.created_at,
    // The list query deliberately omits the payload; the cast keeps it from
    // having to widen this type.
    report: row.report as AmplifyReport,
  };
}

/**
 * Persist every report from one converted workbook.
 *
 * Returns the saved rows in workbook order, so the caller can jump straight to
 * the first one.
 */
export async function saveAmplifyConversion(
  reports: AmplifyReport[],
  sourceFile: string,
): Promise<SavedAmplifyReport[]> {
  const batchId = crypto.randomUUID();
  const { data: auth } = await supabase.auth.getUser();

  const rows = reports.map((report, index) => ({
    batch_id: batchId,
    // The whole batch is one INSERT, so every row shares a created_at and only
    // this keeps the upload's order recoverable.
    batch_index: index,
    label: report.label,
    site_name: report.siteName || null,
    source_file: sourceFile,
    report_date: report.reportDate || null,
    status: report.status || null,
    report,
    created_by: auth?.user?.id ?? null,
  }));

  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .insert(rows)
    .select();

  if (error) throw new Error(`Could not save the conversion: ${error.message}`);
  // INSERT ... RETURNING does not promise the input order, and the caller opens
  // the first row, which should be the first unit in the document.
  return (data as Row[])
    .map(toSaved)
    .sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
}

/** Most recent conversions for the index list. Payload omitted on purpose. */
export async function listAmplifyConversions(
  limit = 50,
): Promise<SavedAmplifyConversion[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select(
      "id, batch_id, batch_index, label, site_name, source_file, report_date, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load conversions: ${error.message}`);
  return (data as Row[]).map(toSaved);
}

/** One saved report, with its payload. */
export async function getAmplifyConversion(
  id: string,
): Promise<SavedAmplifyReport> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Could not load that report: ${error.message}`);
  return toSaved(data as Row);
}

/** Sibling reports that came from the same uploaded workbook. */
export async function getAmplifyBatch(
  batchId: string,
): Promise<SavedAmplifyReport[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .select("*")
    .eq("batch_id", batchId)
    // Source order. Rows saved before batch_index existed sort last, on the
    // created_at they were already ordered by.
    .order("batch_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load that batch: ${error.message}`);
  return (data as Row[]).map(toSaved);
}

/**
 * Replace a saved report's payload with a revised one.
 *
 * The denormalized list columns are rewritten alongside it, so a revision that
 * touches the label or the overall result does not leave the index showing the
 * pre-revision values.
 */
export async function updateAmplifyConversionReport(
  id: string,
  report: AmplifyReport,
): Promise<SavedAmplifyReport> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .update({
      label: report.label,
      site_name: report.siteName || null,
      report_date: report.reportDate || null,
      status: report.status || null,
      report,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Could not save the revision: ${error.message}`);
  return toSaved(data as Row);
}

/** Remove one saved report. */
export async function deleteAmplifyConversion(id: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Could not delete that report: ${error.message}`);
}
