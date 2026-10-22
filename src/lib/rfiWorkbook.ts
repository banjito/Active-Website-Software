import * as XLSX from "xlsx";

// RFI Excel sheet: the file estimators send to the customer and read back when the
// customer returns it. Layout copies the estimating team's RFI template (one "RFI"
// sheet, Arial, grey header row on row 8, frozen header).
//
// SheetJS Community can't write cell styles, so the sheet XML is written here by
// hand and zipped with the zip writer SheetJS ships (XLSX.CFB). Reading uses
// plain XLSX.read.
//
// Column G is hidden and holds each RFI's id, so a returned file matches rows by
// id even if the customer sorts or renumbers them. G1 holds the opportunity id, so
// a file uploaded on the wrong opportunity is refused.

export interface RfiSheetHeader {
  companyName: string;
  opportunityId: string;
  project: string;
  customer: string;
  /** yyyy-mm-dd */
  proposalDueDate: string | null;
  dateIssued: string;
  responseRequestedBy: string | null;
}

export interface RfiSheetRow {
  id: string;
  number: number;
  /** yyyy-mm-dd */
  dateAdded: string;
  question: string;
  specRef: string | null;
  response: string | null;
  dateAnswered: string | null;
}

/** Empty numbered rows under the RFIs, for the customer's own questions */
const BLANK_ROWS = 10;
const HEADER_ROW = 8;
const ID_HEADER = "RFI ID";
const OPP_MARKER = "opportunity:";

// Same widths as the template; G is the hidden id column
const COLUMN_WIDTHS = [8, 13, 55, 20, 55, 14, 40];
// Roughly how many Arial 10 characters fit on one line of C and E
const CHARS_PER_LINE = 58;

// Style indexes into STYLES_XML cellXfs
const S = {
  title: 1,
  company: 2,
  label: 3,
  value: 4,
  labelRight: 6,
  dateValue: 7,
  head: 8,
  bodyCenter: 9,
  bodyDate: 10,
  bodyWrap: 11,
} as const;

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts>' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Arial"/></font>' +
  '<font><i/><sz val="10"/><name val="Arial"/></font>' +
  '<font><b/><sz val="10"/><name val="Arial"/></font>' +
  '<font><sz val="10"/><name val="Arial"/></font>' +
  "</fonts>" +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="3">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right>' +
  '<top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="12">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
  '<xf numFmtId="164" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// Prints landscape, one page wide, with the header row repeated on every page
const WORKBOOK_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<bookViews><workbookView/></bookViews>' +
  '<sheets><sheet name="RFI" sheetId="1" r:id="rId1"/></sheets>' +
  `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">RFI!$${HEADER_ROW}:$${HEADER_ROW}</definedName></definedNames>` +
  "</workbook>";

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function xmlEscape(text: string): string {
  return (
    text
      // Characters XML can't hold at all
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function textCell(ref: string, style: number, text: string | null | undefined): string {
  if (!text) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function numberCell(ref: string, style: number, value: number | null): string {
  if (value === null) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
}

/** yyyy-mm-dd to an Excel date number (days since 1899-12-30) */
export function isoToExcelDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** Excel date number to yyyy-mm-dd */
export function excelDateToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function lineCount(text: string | null | undefined): number {
  if (!text) return 1;
  return text
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
}

function rowXml(r: number, cells: string[], height?: number): string {
  const ht = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${r}"${ht}>${cells.join("")}</row>`;
}

function sheetXml(header: RfiSheetHeader, rows: RfiSheetRow[]): string {
  const out: string[] = [];
  out.push(
    rowXml(1, [
      textCell("A1", S.title, "REQUEST FOR INFORMATION"),
      textCell("G1", S.bodyWrap, `${OPP_MARKER}${header.opportunityId}`),
    ]),
  );
  out.push(rowXml(2, [textCell("A2", S.company, header.companyName)]));
  out.push(
    rowXml(4, [
      textCell("A4", S.label, "Project:"),
      textCell("B4", S.value, header.project),
      textCell("C4", S.value, null),
      textCell("D4", S.value, null),
      textCell("E4", S.labelRight, "Proposal Due Date:"),
      numberCell("F4", S.dateValue, isoToExcelDate(header.proposalDueDate)),
    ]),
  );
  out.push(
    rowXml(5, [
      textCell("A5", S.label, "Customer:"),
      textCell("B5", S.value, header.customer),
      textCell("C5", S.value, null),
      textCell("D5", S.value, null),
      textCell("E5", S.labelRight, "Date Issued:"),
      numberCell("F5", S.dateValue, isoToExcelDate(header.dateIssued)),
    ]),
  );
  out.push(
    rowXml(6, [
      textCell("E6", S.labelRight, "Response Requested By:"),
      numberCell("F6", S.dateValue, isoToExcelDate(header.responseRequestedBy)),
    ]),
  );
  const heads = ["#", "Date Added", "Question", "Drawing / Spec Ref", "Customer Response", "Date Answered", ID_HEADER];
  out.push(rowXml(HEADER_ROW, heads.map((h, i) => textCell(`${colLetter(i)}${HEADER_ROW}`, S.head, h)), 20));

  let r = HEADER_ROW + 1;
  for (const row of rows) {
    const lines = Math.max(lineCount(row.question), lineCount(row.response), 2);
    out.push(
      rowXml(
        r,
        [
          numberCell(`A${r}`, S.bodyCenter, row.number),
          numberCell(`B${r}`, S.bodyDate, isoToExcelDate(row.dateAdded)),
          textCell(`C${r}`, S.bodyWrap, row.question),
          textCell(`D${r}`, S.bodyWrap, row.specRef),
          textCell(`E${r}`, S.bodyWrap, row.response),
          numberCell(`F${r}`, S.bodyDate, isoToExcelDate(row.dateAnswered)),
          textCell(`G${r}`, S.bodyWrap, row.id),
        ],
        Math.min(409, lines * 13 + 4),
      ),
    );
    r += 1;
  }
  const lastNumber = rows.reduce((max, row) => Math.max(max, row.number), 0);
  for (let i = 1; i <= BLANK_ROWS; i += 1) {
    out.push(
      rowXml(
        r,
        [
          numberCell(`A${r}`, S.bodyCenter, lastNumber + i),
          numberCell(`B${r}`, S.bodyDate, null),
          textCell(`C${r}`, S.bodyWrap, null),
          textCell(`D${r}`, S.bodyWrap, null),
          textCell(`E${r}`, S.bodyWrap, null),
          numberCell(`F${r}`, S.bodyDate, null),
          textCell(`G${r}`, S.bodyWrap, null),
        ],
        30,
      ),
    );
    r += 1;
  }

  const cols = COLUMN_WIDTHS.map(
    (w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${i === 6 ? ' hidden="1"' : ""}/>`,
  ).join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:G${r - 1}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${out.join("")}</sheetData>` +
    '<mergeCells count="2"><mergeCell ref="B4:D4"/><mergeCell ref="B5:D5"/></mergeCells>' +
    '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    "</worksheet>"
  );
}

/** Builds the .xlsx file the customer fills in */
export function buildRfiWorkbook(header: RfiSheetHeader, rows: RfiSheetRow[]): Uint8Array {
  const encoder = new TextEncoder();
  const zip = XLSX.CFB.utils.cfb_new();
  const parts: [string, string][] = [
    ["[Content_Types].xml", CONTENT_TYPES_XML],
    ["_rels/.rels", ROOT_RELS_XML],
    ["xl/workbook.xml", WORKBOOK_XML],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML],
    ["xl/styles.xml", STYLES_XML],
    ["xl/worksheets/sheet1.xml", sheetXml(header, rows)],
  ];
  for (const [path, xml] of parts) XLSX.CFB.utils.cfb_add(zip, path, encoder.encode(xml));
  const out = XLSX.CFB.write(zip, { fileType: "zip", type: "array", compression: true });
  return out instanceof Uint8Array ? out : Uint8Array.from(out as ArrayLike<number>);
}

/** "RFI - Q-2026-118 - Northside Data Center.xlsx", safe on every OS */
export function rfiFileName(quoteNumber: string | null | undefined, title: string | null | undefined): string {
  const parts = ["RFI", quoteNumber, title]
    .map((p) => (p ?? "").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return `${parts.join(" - ").slice(0, 120)}.xlsx`;
}

// ---------------------------------------------------------------------------
// Reading a returned file
// ---------------------------------------------------------------------------

export interface ParsedRfiRow {
  /** Excel row number, for messages */
  sheetRow: number;
  id: string | null;
  number: number | null;
  question: string;
  specRef: string;
  response: string;
  dateAnswered: string | null;
}

export interface ParsedRfiSheet {
  /** The opportunity the file was made for, when the marker survived */
  opportunityId: string | null;
  /** False when the customer removed the hidden id column; rows then match by # */
  hasIdColumn: boolean;
  rows: ParsedRfiRow[];
}

export const RFI_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

function cellText(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n" && typeof cell.w === "string") return cell.w.trim();
  return String(cell.v).replace(/\r\n/g, "\n").trim();
}

function cellDate(sheet: XLSX.WorkSheet, r: number, c: number): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return null;
  if (typeof cell.v === "number") return excelDateToIso(cell.v);
  const text = String(cell.v).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a returned RFI sheet. Throws a message fit to show the user. */
export function parseRfiWorkbook(data: ArrayBuffer): ParsedRfiSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    throw new Error("That file couldn't be opened as an Excel workbook.");
  }
  const sheetName =
    workbook.SheetNames.find((n) => n.trim().toUpperCase() === "RFI") ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet || !sheet["!ref"]) throw new Error("That workbook has no RFI sheet.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const lastCol = Math.min(range.e.c, 30);

  // Find the header row by its labels, so an added or moved column still reads
  let headerRow = -1;
  const col: Record<string, number> = {};
  for (let r = range.s.r; r <= Math.min(range.e.r, 40) && headerRow < 0; r += 1) {
    const found: Record<string, number> = {};
    for (let c = 0; c <= lastCol; c += 1) {
      const label = cellText(sheet, r, c).toLowerCase();
      if (!label) continue;
      if (label === "#" || label === "no." || label === "rfi #") found.number ??= c;
      else if (label.includes("date added")) found.dateAdded ??= c;
      else if (label.includes("question")) found.question ??= c;
      else if (label.includes("spec") || label.includes("drawing")) found.specRef ??= c;
      else if (label.includes("response") || (label.includes("answer") && !label.includes("date"))) found.response ??= c;
      else if (label.includes("date answered")) found.dateAnswered ??= c;
      else if (label === ID_HEADER.toLowerCase()) found.id ??= c;
    }
    if (found.question !== undefined && found.response !== undefined) {
      headerRow = r;
      Object.assign(col, found);
    }
  }
  if (headerRow < 0) {
    throw new Error('Couldn\'t find the RFI table. The file needs "Question" and "Customer Response" column headers.');
  }

  // The marker lives in the hidden id column's first row
  let opportunityId: string | null = null;
  for (let r = range.s.r; r < headerRow; r += 1) {
    for (let c = 0; c <= lastCol; c += 1) {
      const text = cellText(sheet, r, c);
      if (text.startsWith(OPP_MARKER)) opportunityId = text.slice(OPP_MARKER.length).trim() || null;
    }
  }

  const rows: ParsedRfiRow[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r += 1) {
    const question = cellText(sheet, r, col.question);
    const response = cellText(sheet, r, col.response);
    if (!question && !response) continue;
    const rawId = col.id !== undefined ? cellText(sheet, r, col.id) : "";
    const rawNumber = col.number !== undefined ? Number(cellText(sheet, r, col.number)) : NaN;
    rows.push({
      sheetRow: r + 1,
      id: UUID_RE.test(rawId) ? rawId.toLowerCase() : null,
      number: Number.isInteger(rawNumber) && rawNumber > 0 ? rawNumber : null,
      question,
      specRef: col.specRef !== undefined ? cellText(sheet, r, col.specRef) : "",
      response,
      dateAnswered: col.dateAnswered !== undefined ? cellDate(sheet, r, col.dateAnswered) : null,
    });
  }

  return { opportunityId, hasIdColumn: col.id !== undefined, rows };
}

// ---------------------------------------------------------------------------
// Working out what a returned file changes
// ---------------------------------------------------------------------------

export type RfiImportKind = "answer" | "replace" | "new" | "blank" | "skip";

export interface RfiImportChange {
  kind: RfiImportKind;
  /** The RFI being changed; null for a new question from the customer */
  rfiId: string | null;
  number: number | null;
  question: string;
  specRef: string;
  previousResponse: string | null;
  response: string;
  dateAnswered: string | null;
  /** Why a row is skipped, shown to the user */
  reason?: string;
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/**
 * Compares a returned sheet with the RFIs on file. Only the response and date
 * answered are read for existing RFIs; customer edits to our question text are
 * ignored. Rows that change nothing are left out.
 */
export function planRfiImport(existing: RfiSheetRow[], parsed: ParsedRfiSheet): RfiImportChange[] {
  const byId = new Map(existing.map((r) => [r.id.toLowerCase(), r]));
  const byNumber = new Map(existing.map((r) => [r.number, r]));
  const seen = new Set<string>();
  const changes: RfiImportChange[] = [];

  for (const row of parsed.rows) {
    let match: RfiSheetRow | undefined;
    if (row.id) {
      match = byId.get(row.id);
      if (!match) {
        changes.push({
          kind: "skip",
          rfiId: null,
          number: row.number,
          question: row.question,
          specRef: row.specRef,
          previousResponse: null,
          response: row.response,
          dateAnswered: row.dateAnswered,
          reason: "This RFI was deleted in ampOS after the file was sent.",
        });
        continue;
      }
    } else if (!parsed.hasIdColumn && row.number !== null) {
      match = byNumber.get(row.number);
    }

    if (match) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      const base = {
        rfiId: match.id,
        number: match.number,
        question: match.question,
        specRef: match.specRef ?? "",
        previousResponse: match.response,
        response: row.response,
      };
      if (!row.response) {
        if (!match.response) changes.push({ ...base, kind: "blank", dateAnswered: null });
        // A blank cell never wipes an answer already on file
        continue;
      }
      if (sameText(match.response, row.response)) continue;
      // A changed answer under the old date gets the upload date instead
      const dateAnswered =
        match.response && row.dateAnswered === match.dateAnswered ? null : row.dateAnswered;
      changes.push({ ...base, kind: match.response ? "replace" : "answer", dateAnswered });
      continue;
    }

    if (!row.question) {
      changes.push({
        kind: "skip",
        rfiId: null,
        number: row.number,
        question: "",
        specRef: row.specRef,
        previousResponse: null,
        response: row.response,
        dateAnswered: row.dateAnswered,
        reason: `Row ${row.sheetRow} has an answer but no question, so it can't be matched.`,
      });
      continue;
    }
    changes.push({
      kind: "new",
      rfiId: null,
      number: null,
      question: row.question,
      specRef: row.specRef,
      previousResponse: null,
      response: row.response,
      dateAnswered: row.response ? row.dateAnswered : null,
    });
  }

  const order: Record<RfiImportKind, number> = { answer: 0, replace: 1, new: 2, blank: 3, skip: 4 };
  return changes.sort((a, b) => order[a.kind] - order[b.kind] || (a.number ?? 1e9) - (b.number ?? 1e9));
}
