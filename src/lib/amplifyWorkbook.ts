/**
 * Client-side reading of an AMP-lify workbook.
 *
 * The analog of oilReportOcr.ts for the Excel path: it turns the uploaded file
 * into plain text for the structuring call. Unlike OCR this is instant and
 * lossless, so the only real work is flattening the grid in a way that keeps
 * the layout legible to the model — a technician's workbook carries meaning in
 * where a value sits, not just in what it says.
 *
 * The file never leaves the browser; only the flattened text is sent on.
 */

import * as XLSX from "xlsx";

/** How many sheets and rows to flatten before giving up on a huge workbook. */
const MAX_ROWS_PER_SHEET = 400;
const MAX_CHARS = 110_000;

export interface WorkbookText {
  /** Flattened text for the structuring call. */
  text: string;
  sheetNames: string[];
}

/** Column letter for a zero-based index, so cells can be cited as "C7". */
function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Trim trailing empty cells so a sparse sheet does not emit 200 pipes a row. */
function trimTrailing(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === "") end -= 1;
  return cells.slice(0, end);
}

/**
 * Flatten one sheet into `row | A: value | B: value` lines.
 *
 * Cells are addressed rather than positionally aligned: a merged title cell or
 * a blank spacer column would otherwise slide every value one place left and
 * the model would pair the wrong label with the wrong reading.
 */
function flattenSheet(sheet: XLSX.WorkSheet, name: string): string {
  // raw:false renders dates and percentages the way the workbook displays
  // them, which is what belongs on the report.
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  const lines: string[] = [`### SHEET: ${name}`];
  let truncated = false;

  grid.forEach((row, i) => {
    if (i >= MAX_ROWS_PER_SHEET) {
      truncated = true;
      return;
    }
    const cells = trimTrailing(
      (row ?? []).map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()),
    );
    if (cells.length === 0) return;

    const rendered = cells
      .map((value, col) => (value ? `${columnLetter(col)}: ${value}` : null))
      .filter(Boolean)
      .join(" | ");
    if (rendered) lines.push(`${i + 1} | ${rendered}`);
  });

  if (truncated) {
    lines.push(`… sheet truncated at ${MAX_ROWS_PER_SHEET} rows`);
  }
  return lines.join("\n");
}

/** Read the workbook and flatten every sheet that has content. */
export async function readWorkbook(file: File): Promise<WorkbookText> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetNames = workbook.SheetNames.filter(
    (name) => workbook.Sheets[name],
  );
  if (sheetNames.length === 0) {
    throw new Error("That workbook has no sheets in it.");
  }

  const flattened = sheetNames
    .map((name) => flattenSheet(workbook.Sheets[name], name))
    // A sheet with only its header line has no rows worth sending.
    .filter((block) => block.includes("\n"));

  if (flattened.length === 0) {
    throw new Error("Every sheet in that workbook is empty.");
  }

  const text = flattened.join("\n\n");
  return {
    text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
    sheetNames,
  };
}
