/**
 * Types and helpers for AMP-lify reports.
 *
 * Source data can arrive as a spreadsheet or PDF. Spreadsheets are flattened,
 * while PDFs use their text layer or browser-side OCR; either way, layouts can
 * drift between revisions. The model below is deliberately shape-agnostic: a
 * header block plus an ordered list of sections, each of which is a key/value
 * block, a table, a note, or any combination. That way a newly added source
 * field shows up in the report instead of being silently dropped.
 *
 * See /amplify-reports for the branded renderer.
 */

import type { Severity } from "@/lib/reportSeverity";

export type { Severity } from "@/lib/reportSeverity";
export { severityLabel, severityClasses, severityDot } from "@/lib/reportSeverity";

/** One label/value pair, as printed. */
export interface AmplifyField {
  label: string;
  value: string;
}

/**
 * One row of a test table.
 *
 * `label` is the row's own heading when the table has a stub column (e.g. a
 * phase or a device name); `cells` line up with the table's columns.
 */
export interface AmplifyRow {
  label?: string;
  cells: string[];
  /** Pass/fail as printed for this row, when the source records one. */
  result?: string;
}

export interface AmplifyTable {
  /** Column headings, excluding the stub column that holds row labels. */
  columns: string[];
  rows: AmplifyRow[];
  /** Units line printed under the headings, when the workbook has one. */
  units?: string[];
}

/** One block of the report, rendered in source order. */
export interface AmplifySection {
  id: string;
  title: string;
  /** Key/value pairs for this block. Empty when the block is purely tabular. */
  fields: AmplifyField[];
  /** Tabular results for this block, if any. */
  table: AmplifyTable | null;
  /** Free prose: comments, remarks, recommendations. */
  notes: string;
}

export interface AmplifyReport {
  id: string;
  /** Customer-facing label for what this report covers. */
  label: string;
  siteName: string;
  siteAddress: string;
  customer: string;
  jobNumber: string;
  reportDate: string;
  technician: string;
  /** Nameplate-style identity block, shown beside the header. */
  equipment: AmplifyField[];
  /** Overall result as printed, e.g. "PASS", "Satisfactory". */
  status: string;
  sections: AmplifySection[];
  sourceFile: string;
  /** Worksheet this unit came from, when the workbook has several. */
  sourceSheet: string;
}

/* ------------------------------------------------------------------ */
/* Result severity                                                     */
/* ------------------------------------------------------------------ */

const GOOD = /\b(pass(ed)?|satisfactory|acceptable|good|normal|ok|within (limits|spec))\b/i;
const CAUTION = /\b(monitor|caution|marginal|conditional|borderline|watch|re-?test)\b/i;
const ALERT = /\b(fail(ed|ure)?|unsatisfactory|reject(ed)?|defective|out of (limits|spec|tolerance)|replace)\b/i;

/**
 * Map a printed result onto the shared severity scale.
 *
 * Checked worst-first: "Failed - retest required" has to read as an alert, not
 * a caution, and technicians write both words in one cell often enough that
 * order matters more than exactness here.
 */
export function resultSeverity(status?: string): Severity {
  if (!status) return "unknown";
  if (ALERT.test(status)) return "alert";
  if (CAUTION.test(status)) return "caution";
  if (GOOD.test(status)) return "good";
  return "unknown";
}
