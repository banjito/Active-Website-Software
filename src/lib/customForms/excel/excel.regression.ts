/**
 * Excel import regression.
 *
 * Three things have to hold, and the third is the one that matters:
 *
 * 1. A real .xlsx round-trips through the reader with its formulas intact.
 * 2. The Excel formula subset translates to typed-1 or is refused outright.
 * 3. An import never produces a form that quietly disagrees with the workbook:
 *    a translation that cannot be reproduced is reported, not shipped.
 *
 * The layout model is stubbed here. It proposes a layout and cell mappings and
 * nothing else, so a fixed stub covers exactly what the application relies on.
 */

import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { analyzeExcelWorkbook } from "@/lib/customForms/excel/workbook";
import { translateExcelFormula } from "@/lib/customForms/excel/formulas";
import { buildExcelDraft, deriveMappings, summarizeExcelReview } from "@/lib/customForms/excel/import";
import type {
  ExcelGenerationResponse,
  ExcelImportIssue,
  ExcelWorkbookAnalysis,
} from "@/lib/customForms/excel/types";
import { ComponentType, FieldType } from "@/lib/types/customForms";
import { compileFormExpressions } from "@/lib/customForms/expressions/form-program";

let checks = 0;
let failures = 0;

function check(name: string, run: () => void) {
  checks += 1;
  try {
    run();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${(error as Error).message.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------------------
// A workbook shaped like the ones technicians actually send: readings in a
// column, a correction factor above them, a derived column and a verdict.
// ---------------------------------------------------------------------------

function buildWorkbook(): ExcelWorkbookAnalysis {
  const sheet: XLSX.WorkSheet = {};
  const put = (address: string, cell: XLSX.CellObject) => {
    sheet[address] = cell;
  };
  put("A1", { t: "s", v: "Reading" });
  put("B1", { t: "s", v: "Corrected" });
  put("C1", { t: "s", v: "Result" });
  put("E1", { t: "s", v: "TCF" });
  put("E2", { t: "n", v: 1.25 });
  put("A2", { t: "n", v: 100 });
  put("A3", { t: "n", v: 200 });
  put("B2", { t: "n", v: 125, f: "A2*$E$2" });
  put("B3", { t: "n", v: 250, f: "A3*$E$2" });
  put("C2", { t: "s", v: "PASS", f: 'IF(B2>=100,"PASS","FAIL")' });
  put("C3", { t: "s", v: "PASS", f: 'IF(B3>=100,"PASS","FAIL")' });
  // Deliberately unsupported: no VLOOKUP in the translated subset.
  put("D2", { t: "n", v: 7, f: "VLOOKUP(A2,A1:B3,2,FALSE)" });
  sheet["!ref"] = "A1:E3";

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Readings");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx", compression: true });
  return analyzeExcelWorkbook(bytes as ArrayBuffer, "readings.xlsx");
}

/**
 * Repackage a workbook with a real DEFLATE compressor.
 *
 * SheetJS's writer emits stored and fixed-Huffman blocks, so a workbook it
 * wrote exercises almost none of the ZIP checker. Excel writes dynamic Huffman
 * blocks, and a wrong code-length order table there rejected every real file
 * with "Invalid ZIP compression code" while every test passed. zlib writes the
 * same kind of stream Excel does.
 */
function recompress(stored: Uint8Array): Uint8Array {
  const archive = XLSX.CFB.read(stored, { type: "array" }) as {
    FullPaths: string[];
    FileIndex: { content?: Uint8Array | number[]; size?: number }[];
  };
  const entries: { name: string; data: Uint8Array }[] = [];
  archive.FullPaths.forEach((path, index) => {
    const name = path.replace(/^Root Entry\//, "");
    const content = archive.FileIndex[index]?.content;
    // SheetJS keeps a marker entry whose name holds a control character.
    if (!name || name.endsWith("/") || /[\x00-\x1f]/.test(name) || content === undefined) return;
    entries.push({
      name,
      data: content instanceof Uint8Array ? content : Uint8Array.from(content),
    });
  });

  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const deflated = new Uint8Array(deflateRawSync(entry.data, { level: 9 }));
    const sum = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 8, 8);
    u32(localView, 14, sum);
    u32(localView, 18, deflated.length);
    u32(localView, 22, entry.data.length);
    u16(localView, 26, name.length);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 10, 8);
    u32(centralView, 16, sum);
    u32(centralView, 20, deflated.length);
    u32(centralView, 24, entry.data.length);
    u16(centralView, 28, name.length);
    u32(centralView, 42, offset);
    central.set(name, 46);

    chunks.push(local, deflated);
    directory.push(central);
    offset += local.length + deflated.length;
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 8, entries.length);
  u16(endView, 10, entries.length);
  u32(endView, 12, directorySize);
  u32(endView, 16, offset);

  const parts = [...chunks, ...directory, end];
  const total = parts.reduce((sum2, part) => sum2 + part.length, 0);
  const result = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    result.set(part, at);
    at += part.length;
  }
  return result;
}

const workbook = buildWorkbook();

console.log("\nWorkbook reading");

check("the sheet and its formulas are read", () => {
  assert.equal(workbook.sheets.length, 1);
  assert.equal(workbook.sheets[0].name, "Readings");
  const cell = workbook.sheets[0].cells.find((entry) => entry.address === "B2");
  assert.equal(cell?.formula, "A2*$E$2");
  assert.equal(cell?.value, 125, "Excel's cached result is kept, not recalculated");
});

check("every formula in the sheet is counted", () => {
  assert.equal(workbook.formulaCount, 5);
});

check("the import is declared unverified", () => {
  assert.ok(workbook.issues.some((issue) => issue.code === "UNVERIFIED_WORKBOOK"));
});

check("a workbook compressed the way Excel compresses is read", () => {
  const book = XLSX.utils.book_new();
  // Varied text so the compressor chooses dynamic Huffman coding, as Excel does.
  const rows = Array.from({ length: 200 }, (_, index) => ({
    Item: `Breaker ${index} phase ${"ABC"[index % 3]}`,
    Reading: index * 1.37,
    Note: `Checked at ${index}:${(index * 7) % 60} by technician ${index % 11}`,
  }));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Log");
  const stored = XLSX.write(book, { type: "array", bookType: "xlsx", compression: false });
  const analysed = analyzeExcelWorkbook(recompress(new Uint8Array(stored)), "log.xlsx");
  assert.equal(analysed.sheets[0].name, "Log");
  // Three columns plus a header row, all of it read back out of the archive.
  assert.equal(analysed.sheets[0].cells.length, 3 * (rows.length + 1));
  assert.equal(
    analysed.sheets[0].cells.find((cell) => cell.address === "A2")?.value,
    "Breaker 0 phase A",
  );
});

check("a file that is not .xlsx is refused", () => {
  assert.throws(() => analyzeExcelWorkbook(new Uint8Array(64), "book.xlsm"), /Only \.xlsx/);
});

check("a file that is not a ZIP is refused", () => {
  assert.throws(() => analyzeExcelWorkbook(new Uint8Array(64), "book.xlsx"), /Excel import:/);
});

console.log("\nFormula translation");

const ids: Record<string, string> = {
  A2: "cell/a2", A3: "cell/a3", B2: "cell/b2", B3: "cell/b3", E2: "cell/tcf",
};
const resolve = (_sheet: string, address: string) => ids[address];

const translated = (formula: string) => translateExcelFormula(formula, "Readings", resolve);

check("multiplication carries the reference through", () => {
  const result = translated("A2*$E$2");
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(result.source, "(coalesce({cell/a2}, 0) * coalesce({cell/tcf}, 0))");
});

check("IF becomes a typed conditional", () => {
  const result = translated('IF(B2>=100,"PASS","FAIL")');
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(result.source, 'if((coalesce({cell/b2}, 0) >= 100), "PASS", "FAIL")');
});

check("a range sums its mapped cells", () => {
  const result = translated("SUM(A2:A3)");
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(result.source, "sum([coalesce({cell/a2}, 0), coalesce({cell/a3}, 0)])");
});

check("an unmapped reference is refused, never guessed", () => {
  const result = translated("A2*Z9");
  assert.ok(!result.ok);
  assert.match(result.message, /Missing mapped reference/);
});

check("an unsupported function is refused, never approximated", () => {
  const result = translated("VLOOKUP(A2,A1:B3,2,FALSE)");
  assert.ok(!result.ok);
  assert.match(result.message, /Unsupported Excel function VLOOKUP/);
});

check("external workbook references are refused", () => {
  assert.ok(!translated("[Book2.xlsx]Sheet1!A1").ok);
});

console.log("\nDraft assembly");

/** The layout a model is allowed to propose: sections, columns and mappings. */
function stubResponse(): ExcelGenerationResponse {
  return {
    template: {
      name: "Readings",
      structure: {
        settings: {
          includePassFail: false,
          includeJobInfo: false,
          includePrintHeader: false,
          pageBreakAfterSection: false,
        },
        sections: [
          {
            id: "settings",
            componentType: ComponentType.NAMEPLATE_DATA,
            title: "Settings",
            order: 0,
            showInPrint: true,
            layout: "single-column",
            fields: [{ id: "tcf", label: "TCF", type: FieldType.NUMBER }],
          },
          {
            id: "readings",
            componentType: ComponentType.CUSTOM_TABLE,
            title: "Readings",
            order: 1,
            showInPrint: true,
            rows: 2,
            allowAddRows: false,
            allowRemoveRows: false,
            columns: [
              { id: "c-reading", label: "Reading", field: { id: "reading", label: "Reading", type: FieldType.NUMBER } },
              { id: "c-corrected", label: "Corrected", field: { id: "corrected", label: "Corrected", type: FieldType.CALCULATED, readOnly: true } },
              { id: "c-result", label: "Result", field: { id: "result", label: "Result", type: FieldType.CALCULATED, readOnly: true } },
              { id: "c-lookup", label: "Lookup", field: { id: "lookup", label: "Lookup", type: FieldType.CALCULATED, readOnly: true } },
            ],
          },
        ],
      },
    } as ExcelGenerationResponse["template"],
    sources: [
      { sectionId: "settings", kind: "fields", sheet: "Readings", cells: [{ fieldId: "tcf", cell: "E2" }] },
      // Data cells only: the header row is not part of the range.
      { sectionId: "readings", kind: "table", sheet: "Readings", range: "A2:D3" },
    ],
    warnings: ["REVIEW_REQUIRED: layout is not verified."],
  };
}

const draft = buildExcelDraft(workbook, stubResponse());
const review = draft.review;
const finding = (cell: string) => review.formulas.find((entry) => entry.cell === cell)!;

check("translated calculations are kept as typed formulas", () => {
  const formulas = draft.template.structure.expressions?.formulas ?? {};
  assert.equal(Object.keys(formulas).length, 4, "two corrected cells and two verdicts");
  assert.ok(Object.values(formulas).some((source) => source.includes('"PASS"')));
});

check("each translation is checked against the workbook's saved result", () => {
  assert.equal(finding("B2").status, "matched");
  assert.equal(finding("C2").status, "matched");
  assert.match(finding("B2").message, /Other inputs are untested/);
});

check("an untranslatable formula is reported, not silently dropped", () => {
  assert.equal(finding("D2").status, "unsupported");
  assert.match(finding("D2").message, /VLOOKUP/);
});

check("a field whose calculation was dropped can still be filled in", () => {
  const table = draft.template.structure.sections.find((section) => section.id === "readings")!;
  const column = table.columns!.find((entry) => entry.id === "c-lookup")!;
  assert.notEqual(column.field.type, "calculated");
  assert.notEqual(column.field.readOnly, true);
});

check("the finished draft compiles", () => {
  const compiled = compileFormExpressions(draft.template.structure);
  assert.ok(compiled.ok, compiled.ok ? "" : compiled.issues[0]?.message);
});

check("the findings travel with the draft, not just the dialog", () => {
  const section = draft.template.structure.sections.find((entry) => entry.id === "excel-import-review")!;
  assert.equal(section.showInPrint, false);
  assert.match(String(section.field?.defaultValue), /not an engineering certification/);
  assert.match(String(section.field?.defaultValue), /VLOOKUP/);
});

check("nothing is claimed to be verified", () => {
  const text = JSON.stringify(draft);
  assert.ok(!/\bcertified\b/i.test(text.replace(/not an engineering certification/gi, "")));
  assert.equal(review.reviewed, false);
});

check("a disagreement with the workbook is reported as such", () => {
  // The workbook's saved result is wrong for its own formula: B3 = 200 * 1.25.
  const tampered = structuredClone(workbook);
  const cell = tampered.sheets[0].cells.find((entry) => entry.address === "B3")!;
  cell.value = 999;
  const suspect = buildExcelDraft(tampered, stubResponse());
  const row = suspect.review.formulas.find((entry) => entry.cell === "B3")!;
  assert.equal(row.status, "different");
  assert.match(row.message, /999/);
  assert.equal(summarizeExcelReview(suspect.review).different, 1);
});

check("a formula nobody mapped is reported instead of being lost", () => {
  const response = stubResponse();
  // A range one row short leaves the second circuit's verdict unmapped.
  response.sources = response.sources.map((source) =>
    source.kind === "table" ? { ...source, range: "A2:D2" } : source,
  );
  const partial = buildExcelDraft(workbook, response);
  const row = partial.review.formulas.find((entry) => entry.cell === "C3")!;
  assert.equal(row.status, "unsupported");
  assert.match(row.message, /no field in the generated layout/);
});

check("a source pointing at nothing does not break the import", () => {
  const response = stubResponse();
  response.sources = [
    ...response.sources,
    { sectionId: "ghost", kind: "table", sheet: "Readings", range: "A2:D3" },
  ];
  const built = buildExcelDraft(workbook, response);
  assert.ok(built.review.issues.some((issue) => issue.code === "UNMAPPED_TARGET"));
});

check("a range that does not fit its table is reported", () => {
  const response = stubResponse();
  response.sources = response.sources.map((source) =>
    source.kind === "table" ? { ...source, range: "A2:C3" } : source,
  );
  const built = buildExcelDraft(workbook, response);
  const issue = built.review.issues.find((entry) => entry.code === "RANGE_MISMATCH");
  assert.ok(issue, "a mismatched range should be reported");
  assert.match(issue!.message, /4 columns by 2 rows/);
});

check("inputs and calculations are read from the workbook, not declared", () => {
  const issues: ExcelImportIssue[] = [];
  const response = stubResponse();
  const structure = structuredClone(response.template.structure);
  const mappings = deriveMappings(structure, workbook, response.sources, issues);
  const role = (cell: string) => mappings.find((mapping) => mapping.cell === cell)?.role;
  assert.equal(role("A2"), "input", "a plain reading");
  assert.equal(role("B2"), "calculated", "a cell carrying a formula");
  assert.equal(role("E2"), "input", "a single field");
  assert.equal(issues.length, 0);
});

console.log(
  `\n${checks - failures}/${checks} Excel import checks passed${failures ? `, ${failures} FAILED` : ""}`,
);

export const excelCheckCount = checks;
export const excelFailureCount = failures;
