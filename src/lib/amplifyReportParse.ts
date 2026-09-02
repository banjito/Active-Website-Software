/**
 * Client side of the AMP-lify ingestion pipeline.
 *
 * The source document is converted to text in the browser: spreadsheets are
 * flattened by amplifyWorkbook.ts, while PDFs use their embedded text or OCR.
 * This module hands that text to the parse-amplify-report edge function, which
 * calls DeepSeek with the server-held API key and coerces the response into an
 * AmplifyReport.
 *
 * The model is prompted for this shape but is not trusted to produce it, so
 * every field is normalized defensively before it reaches the renderer.
 */

import { supabase } from "@/lib/supabase";
import type {
  AmplifyField,
  AmplifyReport,
  AmplifyRow,
  AmplifySection,
  AmplifyTable,
} from "@/lib/amplifyReport";
import { splitSourceIntoChunks } from "@/lib/amplifyReportChunk";

/** Coerce anything the model emits for a scalar field into a trimmed string. */
function s(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeFields(value: unknown): AmplifyField[] {
  return asArray(value)
    .map((raw) => {
      const f = (raw ?? {}) as Record<string, unknown>;
      return { label: s(f.label), value: s(f.value) };
    })
    // A pair with no label cannot be rendered against anything.
    .filter((f) => f.label !== "");
}

function normalizeRow(raw: unknown, columnCount: number): AmplifyRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cells = asArray(r.cells).map(s);
  // Short rows are padded rather than dropped: a technician leaving the last
  // two columns blank is normal, and the row still has to line up.
  while (cells.length < columnCount) cells.push("");

  const label = s(r.label);
  const result = s(r.result);
  return {
    ...(label ? { label } : {}),
    cells: cells.slice(0, columnCount),
    ...(result ? { result } : {}),
  };
}

function normalizeTable(raw: unknown): AmplifyTable | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const columns = asArray(t.columns).map(s);
  if (columns.length === 0) return null;

  const rows = asArray(t.rows).map((row) => normalizeRow(row, columns.length));
  if (rows.length === 0) return null;

  const units = asArray(t.units).map(s);
  return {
    columns,
    rows,
    ...(units.some(Boolean) ? { units } : {}),
  };
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function normalizeSection(raw: unknown, index: number): AmplifySection {
  const sec = (raw ?? {}) as Record<string, unknown>;
  const title = s(sec.title) || `Section ${index + 1}`;
  return {
    id: slugify(s(sec.id) || title, `section-${index + 1}`),
    title,
    fields: normalizeFields(sec.fields),
    table: normalizeTable(sec.table),
    notes: s(sec.notes),
  };
}

/** Whether a section carries anything worth rendering. */
function hasContent(section: AmplifySection): boolean {
  return (
    section.fields.length > 0 || section.table !== null || section.notes !== ""
  );
}

function normalizeReport(
  raw: Record<string, unknown>,
  index: number,
  sourceFile: string,
): AmplifyReport {
  const equipment = normalizeFields(raw.equipment);
  const label =
    s(raw.label) ||
    equipment.find((f) => /equipment|unit|device|asset/i.test(f.label))?.value ||
    s(raw.sourceSheet) ||
    `Report ${index + 1}`;

  const sections = asArray(raw.sections)
    .map((section, i) => normalizeSection(section, i))
    .filter(hasContent);

  return {
    id: slugify(s(raw.id) || label, `report-${index + 1}`),
    label,
    siteName: s(raw.siteName),
    siteAddress: s(raw.siteAddress),
    customer: s(raw.customer),
    jobNumber: s(raw.jobNumber),
    reportDate: s(raw.reportDate),
    technician: s(raw.technician),
    equipment,
    status: s(raw.status),
    sections,
    sourceFile,
    sourceSheet: s(raw.sourceSheet),
  };
}

/**
 * Recover the edge function's own error message from a failed invoke.
 *
 * supabase-js reports any non-2xx as the flat "Edge Function returned a
 * non-2xx status code" and hides the response behind `error.context`. The
 * parser answers with { error, detail }, which is the difference between a
 * rate limit and a malformed request.
 */
async function invokeErrorMessage(error: {
  message: string;
  context?: Response;
}): Promise<string> {
  const context = error.context;
  if (!context || typeof context.json !== "function") return error.message;
  try {
    // Cloned so a caller inspecting the same Response is not left an empty
    // body: it can only be read once.
    const body = await context.clone().json();
    if (body?.error) {
      return body.detail ? `${body.error}: ${body.detail}` : body.error;
    }
  } catch {
    /* response had no JSON body */
  }
  return `${error.message} (HTTP ${context.status})`;
}

/** Ask the parser to structure one chunk of source text. */
async function requestReports(
  chunkText: string,
  fileName: string,
): Promise<AmplifyReport[]> {
  const { data, error } = await supabase.functions.invoke(
    "parse-amplify-report",
    // Keep the legacy field name for compatibility with already-deployed
    // versions of the edge function; it now carries spreadsheet or PDF text.
    { body: { workbookText: chunkText, fileName } },
  );

  if (error) {
    throw new Error(await invokeErrorMessage(error));
  }
  if (data?.error) {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }

  return asArray(data?.reports).map((raw, i) =>
    normalizeReport((raw ?? {}) as Record<string, unknown>, i, fileName),
  );
}

/**
 * Waits before each retry of a chunk.
 *
 * A long document is a burst of calls at one upstream model, so the common
 * failure is a rate limit or an overloaded provider rather than anything about
 * the chunk. Both clear on their own, but not within the milliseconds an
 * immediate retry allows.
 */
const RETRY_DELAYS_MS = [2_000, 6_000, 15_000];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One chunk, retried on failure, reporting which part gave up. */
async function requestReportsWithRetry(
  chunkText: string,
  fileName: string,
  part: number,
  parts: number,
): Promise<AmplifyReport[]> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await wait(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await requestReports(chunkText, fileName);
    } catch (err) {
      last = err;
    }
  }

  // Naming the part matters: the rest of the document converted fine, and the
  // failure is almost always about that stretch of pages.
  throw new Error(
    `Part ${part} of ${parts} could not be structured after ${
      RETRY_DELAYS_MS.length + 1
    } attempts: ${String((last as Error)?.message || last)}`,
  );
}

/** Identity of one row, for spotting the same row arriving twice. */
function rowKey(row: AmplifyRow): string {
  return JSON.stringify([row.label ?? "", row.cells, row.result ?? ""]);
}

function sameColumns(a: AmplifyTable, b: AmplifyTable): boolean {
  return (
    a.columns.length === b.columns.length &&
    a.columns.every((column, i) => column === b.columns[i])
  );
}

/**
 * Share of the narrower table's headings that both renderings agree on, below
 * which they are treated as genuinely different tables rather than two
 * descriptions of one.
 */
const MIN_COLUMN_OVERLAP = 0.5;

/**
 * The column set that covers both renderings of a table, or null if they are
 * too dissimilar to be the same table.
 *
 * Separate calls describe the same grid independently, and one may carry a
 * column the other left out entirely — a chunk that omits an all-blank NOTES
 * column is describing the same readings with a narrower header. Widening to
 * the union keeps both, where insisting on an exact match would strand one
 * chunk's rows in a section of their own.
 */
function unifyColumns(into: AmplifyTable, from: AmplifyTable): string[] | null {
  const narrower = Math.min(into.columns.length, from.columns.length);
  if (narrower === 0) return null;

  const shared = from.columns.filter((column) =>
    into.columns.includes(column),
  ).length;
  if (shared / narrower < MIN_COLUMN_OVERLAP) return null;

  const columns = [...into.columns];
  for (const column of from.columns) {
    if (!columns.includes(column)) columns.push(column);
  }
  return columns;
}

/** Restate a table's rows against a wider column set, by heading. */
function castRows(table: AmplifyTable, columns: string[]): AmplifyRow[] {
  return table.rows.map((row) => {
    const cells = columns.map(() => "");
    table.columns.forEach((column, i) => {
      const at = columns.indexOf(column);
      if (at !== -1) cells[at] = row.cells[i] ?? "";
    });
    return { ...row, cells };
  });
}

/**
 * Fold a continuation's copy of a section into the one already collected.
 *
 * Every chunk after a unit's first repeats its opening page, so the header
 * blocks come back once per chunk while the results table comes back with a
 * different stretch of rows each time. Fields and notes therefore keep the
 * first copy and the table grows, skipping rows already present.
 *
 * Returns null when the two tables cannot be reconciled at all. Readings are
 * the point of the report, so an un-mergeable continuation is kept as its own
 * section by the caller rather than quietly discarded.
 */
function mergeSection(
  into: AmplifySection,
  from: AmplifySection,
): AmplifySection | null {
  if (!from.table) return into;
  if (!into.table) return { ...into, table: from.table };

  const columns = unifyColumns(into.table, from.table);
  if (columns === null) return null;

  const collected = castRows(into.table, columns);
  const incoming = castRows(from.table, columns);

  // A continuation repeats the unit's opening page, so its first few readings
  // arrive again. Comparing whole rows does not catch them: the same reading
  // comes back rendered differently between calls ("3.800" against "3.8", an
  // em dash against a blank). Where the source gives a row a label — a jar
  // number, a phase, a device — that label identifies it within the unit, and
  // whole-row equality is only the fallback for tables without one.
  const seenLabels = new Set<string>();
  const seenRows = new Set<string>();
  for (const row of collected) {
    if (row.label) seenLabels.add(row.label);
    else seenRows.add(rowKey(row));
  }

  const added: AmplifyRow[] = [];
  for (const row of incoming) {
    if (row.label) {
      if (seenLabels.has(row.label)) continue;
      seenLabels.add(row.label);
    } else {
      const key = rowKey(row);
      if (seenRows.has(key)) continue;
      seenRows.add(key);
    }
    added.push(row);
  }

  const widened = !sameColumns(into.table, { ...into.table, columns });
  if (added.length === 0 && !widened) return into;

  return {
    ...into,
    table: {
      columns,
      rows: [...collected, ...added],
      // The units line is positional, so it survives only an unchanged header.
      ...(into.table.units && !widened ? { units: into.table.units } : {}),
    },
  };
}

/** Merge a continuation's sections into a unit's, in first-seen order. */
function mergeSections(
  into: AmplifySection[],
  from: AmplifySection[],
): AmplifySection[] {
  const merged = [...into];
  const positions = new Map(merged.map((section, i) => [section.id, i]));

  for (const section of from) {
    const at = positions.get(section.id);
    const absorbed = at === undefined ? null : mergeSection(merged[at], section);

    if (absorbed) {
      merged[at as number] = absorbed;
      continue;
    }

    // Either a section this unit has not seen, or one whose table would not
    // reconcile. Both are appended; a visible duplicate beats lost readings.
    const id = positions.has(section.id)
      ? `${section.id}-continued`
      : section.id;
    positions.set(id, merged.length);
    merged.push(id === section.id ? section : { ...section, id });
  }

  return merged;
}

/**
 * Rejoin reports that only look separate because their unit was split for
 * size: same chunk group, same label, so the second chunk continued the first.
 *
 * A unit split across chunks is the norm for a long string, not an edge case —
 * the continuation carries the unit's opening page precisely so its label
 * matches here.
 */
function stitchSplitUnits(
  parts: { report: AmplifyReport; group: number }[],
): AmplifyReport[] {
  const joined: { report: AmplifyReport; group: number }[] = [];

  for (const part of parts) {
    const prev = joined[joined.length - 1];
    if (
      prev &&
      prev.group === part.group &&
      prev.report.label === part.report.label
    ) {
      prev.report = {
        ...prev.report,
        sections: mergeSections(prev.report.sections, part.report.sections),
      };
      continue;
    }
    joined.push({ ...part });
  }

  return joined.map((p) => p.report);
}

/**
 * Nameplate fields that identify one unit, best first.
 *
 * A string name distinguishes the five strings inside a cabinet; an asset id
 * only names the cabinet they share, so it is a last resort.
 */
const UNIT_IDENTIFIERS = [
  /string name/i,
  /equipment (id|name|number)/i,
  /unit (id|name|number)/i,
  /serial/i,
  /asset id/i,
];

/**
 * Re-label reports whose label does not distinguish them from their siblings.
 *
 * The model sometimes answers with the form's printed title ("Battery Test")
 * instead of the unit's own name, which is invisible in a single conversion
 * but leaves an upload of fourteen battery strings with four chips reading
 * "Battery Test BUS-INV-XP". A label shared by two reports has demonstrably
 * failed to identify either, so those fall back to the nameplate; a label that
 * is already unique is left exactly as printed.
 */
function disambiguateLabels(reports: AmplifyReport[]): AmplifyReport[] {
  const seen = new Map<string, number>();
  for (const report of reports) {
    seen.set(report.label, (seen.get(report.label) ?? 0) + 1);
  }

  return reports.map((report) => {
    if ((seen.get(report.label) ?? 0) < 2) return report;

    for (const pattern of UNIT_IDENTIFIERS) {
      const field = report.equipment.find((f) => pattern.test(f.label));
      if (field?.value) return { ...report, label: field.value };
    }
    return report;
  });
}

/**
 * How many chunks are in flight at once.
 *
 * Held low deliberately: the upstream model rate-limits per key, and a
 * fourteen-part document that trips that limit costs far more in retries than
 * the parallelism saves.
 */
const PARSE_CONCURRENCY = 2;

export interface ParseProgress {
  /** Chunks finished so far. */
  done: number;
  total: number;
}

/**
 * Send extracted source text for structuring and return renderable reports.
 *
 * A document holding many units is split first: the parser's response is
 * capped, so one call over fifty pages truncates its JSON and yields nothing.
 * Chunks run a few at a time and their reports are concatenated in document
 * order, which is why `onProgress` counts chunks rather than reports.
 *
 * A chunk is retried with backoff, since one transient failure would otherwise
 * waste every other call in the batch. Reports with no sections are dropped:
 * they are almost always a cover page or an instructions tab the model tried
 * to be helpful about.
 */
export async function parseAmplifyReport(
  sourceText: string,
  fileName: string,
  onProgress?: (progress: ParseProgress) => void,
): Promise<AmplifyReport[]> {
  const chunks = splitSourceIntoChunks(sourceText);
  const results: AmplifyReport[][] = new Array(chunks.length);
  let done = 0;

  onProgress?.({ done: 0, total: chunks.length });

  // Fixed pool of workers pulling from a shared cursor, so a slow chunk does
  // not hold up the ones behind it the way fixed batches would.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= chunks.length) return;
      results[index] = await requestReportsWithRetry(
        chunks[index].text,
        fileName,
        index + 1,
        chunks.length,
      );
      onProgress?.({ done: ++done, total: chunks.length });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PARSE_CONCURRENCY, chunks.length) }, worker),
  );

  const parts = results.flatMap((reports, index) =>
    reports.map((report) => ({ report, group: chunks[index].group })),
  );
  const reports = disambiguateLabels(
    stitchSplitUnits(parts).filter((report) => report.sections.length > 0),
  );

  if (reports.length === 0) {
    throw new Error(
      "No readable report was found in that file. Check that it contains test data as spreadsheet cells, selectable PDF text, or a clear scan.",
    );
  }

  // Ids feed React keys and the report switcher, so they must be unique even
  // if two source sections share a label.
  const seen = new Set<string>();
  return reports.map((report) => {
    let id = report.id;
    let n = 2;
    while (seen.has(id)) id = `${report.id}-${n++}`;
    seen.add(id);
    return { ...report, id };
  });
}

/**
 * Re-run a saved report through the model with one plain-language instruction
 * ("On Rated Voltage, change the value to 15kV") and return the revision.
 *
 * The uploaded source file is not kept after a conversion, so this revises the
 * stored JSON rather than parsing the source again. The response is normalized
 * through the same path as a fresh parse, since a revision is no more trusted
 * to hold the shape than the original was.
 *
 * `note` is the model's explanation when it declined to change anything; it is
 * "" on a normal revision.
 */
export async function reviseAmplifyReport(
  report: AmplifyReport,
  instruction: string,
): Promise<{ report: AmplifyReport; note: string }> {
  const { data, error } = await supabase.functions.invoke(
    "revise-amplify-report",
    { body: { report, instruction } },
  );

  if (error) {
    throw new Error(`Could not reach the reviser: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }

  const raw = (data?.report ?? {}) as Record<string, unknown>;
  const revised = normalizeReport(raw, 0, report.sourceFile);

  if (revised.sections.length === 0) {
    throw new Error(
      "The revision came back empty. The report was left as it was — try a more specific instruction.",
    );
  }

  return {
    // Identity stays with the saved row, not with whatever the model echoed:
    // report.id keys the renderer and the source file never changes here.
    report: { ...revised, id: report.id, sourceFile: report.sourceFile },
    note: typeof data?.note === "string" ? data.note : "",
  };
}
