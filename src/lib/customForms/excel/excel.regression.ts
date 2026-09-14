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
import { compileExpressionProgram } from "@/lib/customForms/expressions/program";
import type { ExpressionValue, ValueType } from "@/lib/customForms/expressions/types";
import { applyToolCall, newBuildState, type BuildState } from "@/lib/customForms/excel/tools";
import {
  describeWorkbook,
  draftFromBuild,
  describeSection,
  rebuildSection,
  regenerateSection,
  runBuild,
  uncoveredFormulaCells,
  type BuildEvent,
  type ModelTurn,
} from "@/lib/customForms/excel/build";

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
  let hasDynamicWorksheetBlock = false;
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const deflated = new Uint8Array(deflateRawSync(entry.data, { level: 9 }));
    // Bit 0 is BFINAL; bits 1–2 are BTYPE (2 means dynamic Huffman).
    if (entry.name === "xl/worksheets/sheet1.xml" && ((deflated[0] >>> 1) & 3) === 2) {
      hasDynamicWorksheetBlock = true;
    }
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

  assert.ok(
    hasDynamicWorksheetBlock,
    "Fixture worksheet sheet1.xml must start with a dynamic-Huffman DEFLATE block",
  );

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
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["B4"].f = "B3*2";
  XLSX.utils.book_append_sheet(book, sheet, "Log");
  const stored = XLSX.write(book, { type: "array", bookType: "xlsx", compression: false });
  const analysed = analyzeExcelWorkbook(recompress(new Uint8Array(stored)), "log.xlsx");
  assert.equal(analysed.sheets[0].name, "Log");
  // Three columns plus a header row, all of it read back out of the archive.
  assert.equal(analysed.sheets[0].cells.length, 3 * (rows.length + 1));
  assert.equal(
    analysed.sheets[0].cells.find((cell) => cell.address === "A2")?.value,
    "Breaker 0 phase A",
  );
  const formulaCell = analysed.sheets[0].cells.find((cell) => cell.address === "B4");
  assert.equal(formulaCell?.formula, "B3*2");
  assert.equal(formulaCell?.value, 2.74, "Excel's cached result is kept, not recalculated");
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

console.log("\nMCCB formula patterns");

function evaluateTranslated(formula: string, values: Record<string, unknown> = {}, types: Record<string, ValueType> = {}) {
  const result = translated(formula);
  assert.ok(result.ok, result.ok ? "" : result.message);
  const program = compileExpressionProgram({
    engineVersion: "typed-1",
    inputs: Object.entries(ids).map(([address, id]) => ({ id, type: types[address] ?? "number" })),
    calculations: [{ id: "answer", source: result.source }],
  });
  assert.ok(program.ok, program.ok ? "" : JSON.stringify(program.issues));
  return program.value.evaluate(new Map(Object.entries(values).map(([address, value]) => [ids[address], value]))).results.get("answer")!;
}

const patternCases: Array<[string, Record<string, unknown>, ExpressionValue, Record<string, ValueType>?]> = [
  ['A2=""', {}, true], ['A2=""', { A2: 0 }, false], ['""=A2', {}, true],
  ['A2<>""', {}, false], ['""<>A2', { A2: 2 }, true],
  ['B2=""', { B2: "" }, true, { B2: "string" }],
  ['B2=""', { B2: "0" }, false, { B2: "string" }],
  ['IF(A2="","",A2*2)', {}, null], ['IF(A2="","",A2*2)', { A2: 0 }, 0],
  ['IF(A2="","",A2*2)', { A2: 12 }, 24],
  ['IF(A2="","",A2)', { A2: 12 }, 12],
  ['IF(B2="","",B2)', { B2: "MΩ" }, "MΩ", { B2: "string" }],
  ['IF(TRUE(),A2,1)', {}, 0], ['ISNUMBER(IF(TRUE(),A2,1))', {}, true],
  ['ISNUMBER(A2)=FALSE()', {}, true], ['ISNUMBER(A2)=FALSE', { A2: 0 }, false],
  ['ISNUMBER(B2)=FALSE()', { B2: "123" }, true, { B2: "string" }],
  ['ISNUMBER(TRUE())', {}, false], ['ISNUMBER("12")', {}, false],
  ['IF(A2="","",IF(ISNUMBER(A2)=FALSE(),A2,ROUND(A2*$E$2,0)))', { A2: 10, E2: 1.25 }, 13],
  ['IF(A2="","",IF(ISNUMBER(A2)=FALSE(),A2,ROUND(A2*$E$2,0)))', {}, null],
  ['COUNTIF(B2,"*<*")', { B2: "<2200" }, 1, { B2: "string" }],
  ['COUNTIF(B2,"*>*")', { B2: ">2200" }, 1, { B2: "string" }],
  ['COUNTIF(B2,"*<*")', { B2: "2200" }, 0, { B2: "string" }],
  ['COUNTIF(A2,"*<*")', { A2: 2200 }, 0], ['COUNTIF(B2,"*<*")', {}, 0, { B2: "string" }],
  ['COUNTIF(B2,"N/A")', { B2: "n/a" }, 1, { B2: "string" }],
  ['COUNTIF(B2,"~*")', { B2: "*" }, 1, { B2: "string" }],
  ['COUNTIF(B2,"A?")', { B2: "AB" }, 1, { B2: "string" }],
  ['IF(OR(COUNTIF(B2,"*>*"),COUNTIF(B2,"*<*"),COUNTIF(B2,"N/A")),"PREFIX","PLAIN")', { B2: "<200" }, "PREFIX", { B2: "string" }],
  ['IF(OR(ISNUMBER(FIND("T",B2)),ISNUMBER(FIND("M",B2))),"Thermal","Long Time")', { B2: "TM" }, "Thermal", { B2: "string" }],
  ['IF(OR(ISNUMBER(FIND("T",B2)),ISNUMBER(FIND("M",B2))),"Thermal","Long Time")', { B2: "LSIG" }, "Long Time", { B2: "string" }],
  ['ISNUMBER(FIND("T",B2))', { B2: "thermal" }, false, { B2: "string" }],
  ['ISNUMBER(FIND("T",B2))', {}, false, { B2: "string" }],
  ['ISNUMBER(FIND("*?~",B2,1))', { B2: "A*?~B" }, true, { B2: "string" }],
  ['ISNUMBER(FIND("*",B2))', { B2: "abc" }, false, { B2: "string" }],
  ['NOT(ISNUMBER(FIND("T",B2)))', { B2: "LSIG" }, true, { B2: "string" }],
  ['B2="N/A"', { B2: "n/a" }, true, { B2: "string" }],
  ['B2="*"', { B2: "anything" }, false, { B2: "string" }],
  ['B2<>"*"', { B2: "*" }, false, { B2: "string" }],
  ['ISNUMBER(IF(TRUE(),"",A2))', { A2: 2 }, false],
];
for (const [formula, values, expected, types] of patternCases) {
  check(`${formula} with ${JSON.stringify(values)}`, () => {
    const result = evaluateTranslated(formula, values, types);
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.issues));
    assert.equal(result.value, expected);
  });
}

for (const formula of [
  'TRUE(1)', 'FALSE(1)', 'ISNUMBER()', 'COUNTIF(A2:A3,"*<*")', 'COUNTIF(A2,"<10")',
  'COUNTIF(A2,"10")', 'COUNTIF(A2,"10%")', 'COUNTIF(A2,"TRUE")', 'COUNTIF(A2,"FALSE")',
  'COUNTIF(A2,"")', 'COUNTIF(A2,"*")', 'COUNTIF(A2,B2)', 'COUNTIF(A2+1,"N/A")',
  'FIND("T",B2)', 'ISNUMBER(FIND("",B2))', 'ISNUMBER(FIND("T",B2,2))', 'ISNUMBER(FIND(A2,B2))',
  'IF(TRUE(),"SEE NOTE",2)', 'IF(TRUE(),"",A2)=0', 'IF(TRUE(),"",1)+1',
  'IF(IF(FALSE,TRUE(),""),1,2)', 'IF(FALSE,TRUE(),"")=FALSE()',
  'IF(IF(FALSE,TRUE(),"")=FALSE(),1,2)', 'NOT(IF(FALSE,TRUE(),""))',
  'IF(A2="","",A2*#REF!)', 'ISNUMBER(FIND("T",Z9))',
]) {
  check(`unsafe/unsupported pattern stays refused: ${formula}`, () => assert.equal(translated(formula).ok, false));
}
check("a number test does not hide invalid inputs or arithmetic errors", () => {
  assert.equal(evaluateTranslated('ISNUMBER(A2)', { A2: "<2200" }).ok, false);
  assert.equal(evaluateTranslated('ISNUMBER(1/0)').ok, false);
});
check("type tests never turn a declared text field into a numeric field", () => {
  const result = translated('IF(ISNUMBER(B2),B2*2,0)');
  assert.ok(result.ok);
  const program = compileExpressionProgram({
    engineVersion: "typed-1", inputs: [{ id: ids.B2, type: "string" }],
    calculations: [{ id: "answer", source: result.source }],
  });
  assert.equal(program.ok, false);
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

function buildPatternDraft(wrongCache = false) {
  const sheet: XLSX.WorkSheet = {
    A1: { t: "n", v: 12 }, A2: { t: "s", v: "TM" }, A3: { t: "s", v: "<2200" }, A4: { t: "s", v: "" },
    D1: { t: "n", v: wrongCache ? 999 : 24, f: 'IF(A1="","",A1*2)' },
    D2: { t: "s", v: "Thermal", f: 'IF(OR(ISNUMBER(FIND("T",A2)),ISNUMBER(FIND("M",A2))),"Thermal","Long Time")' },
    D3: { t: "n", v: 1, f: 'COUNTIF(A3,"*<*")' },
    D4: { t: "s", v: "", f: 'IF(A4="","",A4*2)' },
    D5: { t: "n", v: 1, f: 'IF(ISNUMBER(A3)=FALSE(),1,0)' },
    D6: { t: "s", v: "", f: 'IF(A4="","",A4*#REF!)' },
    D7: { t: "n", v: 0, f: 'SUM(D4:D4)' },
    D8: { t: "s", v: "N/A", f: 'IF(A1=12,"N/A",A1*2)' },
    D9: { t: "n", v: 0, f: 'COUNTIF(A3,"*>*")' },
    E4: { t: "s", v: "", f: 'D4' },
    F4: { t: "e", v: 15, f: 'E4+1' },
    "!ref": "A1:F9",
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Patterns");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx", compression: false });
  const analysis = analyzeExcelWorkbook(recompress(new Uint8Array(bytes)), "mccb-patterns.xlsx");
  // SheetJS manufactures a cache if none is supplied. Exercise the no-cache review
  // separately on the analyzed cell instead of relying on that writer behavior.
  delete analysis.sheets[0].cells.find((cell) => cell.address === "D9")!.value;
  // Reverse mappings deliberately: downstream cells must be checked before and after
  // the importer discovers that their dependencies can return Excel empty text.
  const addresses = Object.keys(sheet).filter((address) => !address.startsWith("!")).reverse();
  const response = stubResponse();
  response.template.structure.sections = [{
    id: "patterns", componentType: ComponentType.NAMEPLATE_DATA, title: "Patterns", order: 0, showInPrint: true,
    fields: addresses.map((address) => ({
      id: address, label: address,
      type: sheet[address].f ? FieldType.CALCULATED : ["A1", "A4"].includes(address) ? FieldType.NUMBER : FieldType.TEXT,
    })),
  }];
  response.sources = [{ sectionId: "patterns", kind: "fields", sheet: "Patterns", cells: addresses.map((cell) => ({ fieldId: cell, cell })) }];
  return buildExcelDraft(analysis, response);
}

const patternDraft = buildPatternDraft();
const patternFinding = (cell: string) => patternDraft.review.formulas.find((entry) => entry.cell === cell)!;
check("real XLSX pattern formulas survive reading, translation, compilation and saved-result checks", () => {
  for (const cell of ["D1", "D2", "D3", "D5"]) assert.equal(patternFinding(cell).status, "matched", `${cell}: ${patternFinding(cell).message}`);
  const compiled = compileFormExpressions(patternDraft.template.structure);
  assert.ok(compiled.ok);
});
check("blank outputs and absent caches stay explicitly unverified", () => {
  for (const cell of ["D4", "D9", "E4"]) {
    assert.ok(patternFinding(cell).translated, `${cell}: ${patternFinding(cell).message}`);
    assert.equal(patternFinding(cell).status, "unverified", `${cell}: ${patternFinding(cell).status}: ${patternFinding(cell).message}`);
  }
});
check("blank-result dependencies cannot become zero in arithmetic or aggregates", () => {
  for (const cell of ["D7", "F4"]) {
    assert.equal(patternFinding(cell).status, "unsupported");
    assert.match(patternFinding(cell).message, /empty text/);
  }
});
check("a broken reference remains a review item", () => {
  assert.equal(patternFinding("D6").status, "unsupported");
});
check('a "N/A" result becomes a blank number, and the draft says so', () => {
  // The workbook saved the text "N/A"; a number field cannot hold it, so the
  // cell comes out empty and the loss is reported rather than hidden.
  const finding = patternFinding("D8");
  assert.ok(finding.translated, finding.message);
  assert.match(finding.translated!, /null/);
  assert.ok(
    finding.caveats?.some((text) => /shows as an empty cell/.test(text)),
    JSON.stringify(finding),
  );
});
check("a new pattern with a wrong saved result is reported on the non-printing review section", () => {
  const suspect = buildPatternDraft(true);
  assert.equal(suspect.review.formulas.find((entry) => entry.cell === "D1")?.status, "different");
  assert.equal(summarizeExcelReview(suspect.review).different, 1, JSON.stringify(suspect.review.formulas.filter((entry) => entry.status === "different")));
  const notes = suspect.template.structure.sections.find((section) => section.id === "excel-import-review")!;
  assert.equal(notes.showInPrint, false);
  assert.match(String(notes.field?.defaultValue), /Patterns!D1/);
  assert.match(String(notes.field?.defaultValue), /999/);
});

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

check("cells the form does not cover are counted, not ignored", () => {
  // The stub covers A2:D3 and E2; the headings in row 1 and the TCF label are
  // left out, which is exactly what a half-imported workbook looks like.
  const issue = review.issues.find((entry) => entry.code === "UNCOVERED_CELLS")!;
  assert.ok(issue, "coverage should be reported");
  assert.equal(issue.sheet, "Readings");
  assert.match(issue.message, /filled cells on this sheet are not in the form/);
  assert.match(issue.message, /A1/);
  assert.match(String(
    draft.template.structure.sections.find((section) => section.id === "excel-import-review")!.field?.defaultValue,
  ), /UNCOVERED_CELLS/);
});

check("a layout that covers everything reports no gap", () => {
  const response = stubResponse();
  // Widen the table to the headings so every filled cell belongs somewhere.
  const complete = structuredClone(workbook);
  complete.sheets[0].cells = complete.sheets[0].cells.filter((cell) =>
    ["A2", "A3", "B2", "B3", "C2", "C3", "D2", "E2"].includes(cell.address),
  );
  const built = buildExcelDraft(complete, response);
  assert.ok(!built.review.issues.some((entry) => entry.code === "UNCOVERED_CELLS"));
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


// ---------------------------------------------------------------------------
// Building a form one tool call at a time
// ---------------------------------------------------------------------------

console.log("\nBuild tools");

function build(): BuildState {
  return newBuildState("Readings");
}
const apply = (state: BuildState, name: string, args: Record<string, unknown>) =>
  applyToolCall(state, { name, args }, "Readings");

check("a table names each column by its first data cell", () => {
  const state = build();
  const result = apply(state, "add_table", {
    title: "Readings",
    rows: 3,
    columns: [
      { label: "Reading", cell: "A2", type: "number" },
      { label: "Corrected", cell: "B2", type: "number" },
    ],
  });
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(state.sections.length, 1);
  assert.equal(state.sections[0].rows, 3);
  assert.equal(state.sections[0].columns!.length, 2);
  assert.deepEqual(state.sources[0], {
    sectionId: "s1", kind: "columns", sheet: "Readings", anchors: ["A2", "B2"], rows: 3,
  });
});

check("columns must start in the same row, so a stray cell is caught", () => {
  const state = build();
  const result = apply(state, "add_table", {
    title: "Readings",
    rows: 3,
    columns: [{ label: "Reading", cell: "A2" }, { label: "Corrected", cell: "B7" }],
  });
  assert.ok(!result.ok);
  assert.match(result.message, /same first data row/);
  assert.equal(state.sections.length, 0, "a refused call changes nothing");
});

check("two columns cannot claim the same cell", () => {
  const state = build();
  const result = apply(state, "add_table", {
    title: "Readings",
    rows: 2,
    columns: [{ label: "A", cell: "A2" }, { label: "B", cell: "A2" }],
  });
  assert.ok(!result.ok);
  assert.match(result.message, /given for two columns/);
});

check("ids are generated here, never taken from the model", () => {
  const state = build();
  apply(state, "add_table", { title: "T", rows: 2, columns: [{ label: "A", cell: "A2" }], id: "evil" });
  assert.equal(state.sections[0].id, "s1");
  assert.match(state.sections[0].columns![0].id, /^c\d+$/);
  assert.notEqual(state.sections[0].columns![0].id, state.sections[0].columns![0].field.id);
});

check("fields name the cell their value comes from", () => {
  const state = build();
  const result = apply(state, "add_section", {
    title: "Job",
    fields: [{ label: "Customer", cell: "f3" }, { label: "Date", cell: "F4", type: "date" }],
  });
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(state.sections[0].fields!.length, 2);
  assert.equal(state.sections[0].fields![1].type, "date");
  const source = state.sources[0] as { cells: { cell: string }[] };
  assert.deepEqual(source.cells.map((entry) => entry.cell), ["F3", "F4"], "addresses are normalised");
});

check("the same cell cannot be mapped twice in one section", () => {
  const state = build();
  const result = apply(state, "add_section", {
    title: "Job",
    fields: [{ label: "A", cell: "B2" }, { label: "B", cell: "B2" }],
  });
  assert.ok(!result.ok);
  assert.match(result.message, /used twice/);
});

check("an unknown field type is refused with the list of types", () => {
  const state = build();
  const result = apply(state, "add_section", { title: "Job", fields: [{ label: "A", cell: "B2", type: "currency" }] });
  assert.ok(!result.ok);
  assert.match(result.message, /text, number, date, select, radio, textarea, checkbox/);
});

check("merged headings sit above the column headings", () => {
  const state = build();
  apply(state, "add_table", {
    title: "Settings",
    rows: 4,
    columns: [
      { label: "Function", cell: "L33" },
      { label: "Setting", cell: "Q33" },
      { label: "Delay", cell: "T33" },
      { label: "I2t", cell: "W33" },
    ],
  });
  const good = apply(state, "add_header_row", { section: "s1", cells: [{ label: "As Found", span: 4 }] });
  assert.ok(good.ok, good.ok ? "" : good.message);
  const header = state.sections[0].v2!.header!;
  assert.equal(header.length, 2, "the grouping row sits above the column headings");
  assert.equal(header[0].cells[0].colSpan, 4);
  assert.equal(header[1].cells.length, 4);
});

check("a column of fixed text needs one value per row", () => {
  const state = build();
  apply(state, "add_table", { title: "Inspection", rows: 3, columns: [{ label: "NETA", cell: "B20" }, { label: "Result", cell: "AH20" }] });
  const wrong = apply(state, "set_column_text", { section: "s1", column: 1, values: ["a", "b"] });
  assert.ok(!wrong.ok);
  assert.match(wrong.message, /3 rows but 2 values/);

  const right = apply(state, "set_column_text", { section: "s1", column: 1, values: ["7.1.A.1", "7.1.A.2", "7.1.A.3"] });
  assert.ok(right.ok, right.ok ? "" : right.message);
  assert.equal(state.sections[0].columns![0].field.cellBehavior, "static");
  const firstColumn = state.sections[0].columns![0].id;
  assert.equal(state.sections[0].staticCells![`row0_${firstColumn}`], "7.1.A.1");
});

check("a call against a section that does not exist lists the ones that do", () => {
  const state = build();
  apply(state, "add_table", { title: "T", rows: 2, columns: [{ label: "A", cell: "A2" }] });
  const result = apply(state, "add_note", { section: "s99", text: "x" });
  assert.ok(!result.ok);
  assert.match(result.message, /no section "s99".*s1/s);
});

check("an unknown tool is named back with the ones that exist", () => {
  const result = apply(build(), "delete_everything", {});
  assert.ok(!result.ok);
  assert.match(result.message, /add_table/);
});

check("notes too long are trimmed, not treated as a failed finish", () => {
  const state = build();
  apply(state, "add_table", { title: "T", rows: 1, columns: [{ label: "A", cell: "A2" }] });
  const result = apply(state, "finish", { notes: "x".repeat(5_000) });
  assert.ok(result.ok, result.ok ? "" : result.message);
  assert.equal(state.finished, true);
});

check("a heading row that stops short is padded, not refused", () => {
  const state = build();
  apply(state, "add_table", {
    title: "T",
    rows: 1,
    columns: [{ label: "A", cell: "A2" }, { label: "B", cell: "B2" }, { label: "C", cell: "C2" }],
  });
  const result = apply(state, "add_header_row", { section: "s1", cells: [{ label: "Group", span: 2 }] });
  assert.ok(result.ok, result.ok ? "" : result.message);
  const row = state.sections[0].v2!.header![0];
  assert.equal(row.cells.length, 2);
  assert.equal(row.cells[1].label, "", "the remaining column gets a blank heading");
});

check("spans wider than the table say so with numbers", () => {
  const state = build();
  apply(state, "add_table", { title: "T", rows: 1, columns: [{ label: "A", cell: "A2" }] });
  const result = apply(state, "add_header_row", { section: "s1", cells: [{ label: "Too wide", span: 4 }] });
  assert.ok(!result.ok);
  assert.match(result.message, /add up to 4, but "T" has 1 columns/);
});

check("finish refuses to end an empty form", () => {
  const state = build();
  const result = apply(state, "finish", {});
  assert.ok(!result.ok);
  assert.equal(state.finished, false);
});

console.log("\nThe build loop");

/** A scripted model: one turn per entry, tool calls as the provider sends them. */
function scripted(turns: ModelTurn[]): { call: () => Promise<ModelTurn>; calls: () => number } {
  let index = 0;
  return {
    call: async () => turns[Math.min(index++, turns.length - 1)],
    calls: () => index,
  };
}
const turn = (name: string, args: unknown): ModelTurn => ({
  text: "",
  toolCalls: [{ id: `t${name}`, name, args: JSON.stringify(args) }],
});

await (async () => {
  const script = scripted([
    turn("add_section", { title: "Job", fields: [{ label: "Customer", cell: "B2" }] }),
    turn("add_table", { title: "Readings", rows: 2, columns: [{ label: "Reading", cell: "A2", type: "number" }] }),
    turn("finish", { notes: "The legend was not built." }),
  ]);
  const events: BuildEvent[] = [];
  const run = await runBuild({
    analysis: workbook,
    call: script.call,
    onEvent: (event) => events.push(event),
  });
  check("a scripted build finishes and reports why it stopped", () => {
    assert.equal(run.reason, "finished");
    assert.equal(run.state.sections.length, 2);
    assert.equal(run.notes, "The legend was not built.");
  });
  check("every step is reported as it happens", () => {
    const steps = events.filter((event) => event.kind === "step");
    assert.equal(steps.length, run.steps.length);
    assert.ok(steps.length >= 3);
    assert.ok(events[0].kind === "reading" && /filled cells/.test(events[0].text));
    assert.equal(events[events.length - 1].kind, "done");
  });
  check("the finished build becomes a draft", () => {
    const draft = draftFromBuild(workbook, run);
    assert.equal(draft.template.structure.sections.length, 3, "two built plus the review notes");
    assert.equal(draft.review.reviewed, false);
  });
})();

await (async () => {
  const script = scripted([
    turn("add_table", { title: "Readings", rows: 3, columns: [{ label: "Reading", cell: "A2" }, { label: "Bad", cell: "B9" }] }),
    turn("add_table", { title: "Readings", rows: 3, columns: [{ label: "Reading", cell: "A2" }] }),
    turn("finish", {}),
  ]);
  const run = await runBuild({ analysis: workbook, call: script.call });
  check("a refused step is corrected rather than ending the run", () => {
    assert.equal(run.reason, "finished");
    assert.equal(run.steps[0].ok, false);
    assert.equal(run.state.sections.length, 1);
  });
})();

await (async () => {
  const bad = turn("add_table", { title: "T", rows: 2, columns: [{ label: "A", cell: "A2" }, { label: "B", cell: "B9" }] });
  const run = await runBuild({
    analysis: workbook,
    call: async () => bad,
    budget: { maxConsecutiveErrors: 3 },
  });
  check("a model that keeps failing the same way is stopped", () => {
    assert.equal(run.reason, "stuck");
    assert.equal(run.steps.length, 3);
    assert.equal(run.state.sections.length, 0);
  });
})();

await (async () => {
  const run = await runBuild({
    analysis: workbook,
    call: async () => ({ text: "I think this sheet is nice.", toolCalls: [] }),
    budget: { maxConsecutiveErrors: 2 },
  });
  check("a model that stops calling tools is stopped", () => assert.equal(run.reason, "no_action"));
})();

await (async () => {
  let calls = 0;
  const run = await runBuild({
    analysis: workbook,
    call: async () => {
      calls += 1;
      if (calls > 2) throw new Error("provider down");
      return turn("add_table", { title: `T${calls}`, rows: 2, columns: [{ label: "A", cell: "A2" }] });
    },
    budget: { maxConsecutiveErrors: 2 },
  });
  check("a provider outage keeps what was already built", () => {
    assert.equal(run.reason, "provider_error");
    assert.equal(run.state.sections.length, 2);
    const draft = draftFromBuild(workbook, run);
    assert.match(String(
      draft.template.structure.sections.find((section) => section.id === "excel-import-review")!.field?.defaultValue,
    ), /INCOMPLETE/);
  });
})();

await (async () => {
  const controller = new AbortController();
  let calls = 0;
  const run = await runBuild({
    analysis: workbook,
    signal: controller.signal,
    call: async () => {
      calls += 1;
      if (calls === 2) controller.abort();
      return turn("add_table", { title: `T${calls}`, rows: 2, columns: [{ label: "A", cell: "A2" }] });
    },
  });
  check("stopping keeps the sections built so far", () => {
    assert.equal(run.reason, "cancelled");
    assert.ok(run.state.sections.length >= 1);
    assert.ok(draftFromBuild(workbook, run).template.structure.sections.length > 1);
  });
})();

await (async () => {
  const run = await runBuild({
    analysis: workbook,
    call: async () => turn("add_note", { section: "s1", text: "x" }),
    budget: { maxSteps: 4, maxConsecutiveErrors: 99 },
  });
  check("the step budget is enforced", () => {
    assert.equal(run.reason, "step_limit");
    assert.equal(run.steps.length, 4);
  });
})();

await (async () => {
  // The first real run built fifteen sections and carried over none of the
  // sixty-five formulas, because whole calculated columns had no field.
  const script = scripted([
    turn("add_table", { title: "Readings", rows: 2, columns: [{ label: "Reading", cell: "A2" }] }),
    turn("finish", {}),
    turn("add_table", {
      title: "Results",
      rows: 2,
      columns: [
        { label: "Corrected", cell: "B2" },
        { label: "Result", cell: "C2" },
        { label: "Lookup", cell: "D2" },
      ],
    }),
    turn("add_section", { title: "Settings", fields: [{ label: "TCF", cell: "E2" }] }),
    turn("finish", { notes: "done" }),
  ]);
  const run = await runBuild({ analysis: workbook, call: script.call });
  check("finish is refused while calculated cells have nowhere to go", () => {
    const refusal = run.steps.find((step) => step.tool === "finish" && !step.ok);
    assert.ok(refusal, "the first finish should have been refused");
    assert.match(refusal!.text, /calculated cells of the sheet have no field/);
    assert.match(refusal!.text, /B2|C2|D2/);
  });
  check("once the gaps are filled the build finishes", () => {
    assert.equal(run.reason, "finished");
    assert.equal(uncoveredFormulaCells(workbook, run.state).length, 0);
  });
  check("the formulas then translate instead of being lost", () => {
    const draft = draftFromBuild(workbook, run);
    const counts = summarizeExcelReview(draft.review);
    assert.equal(counts.matched, 4, "two corrected cells and two verdicts");
    assert.equal(counts.unsupported, 1, "only the VLOOKUP");
  });
})();

await (async () => {
  // A model that cannot close the gaps must still be able to stop.
  const script = scripted([
    turn("add_table", { title: "Readings", rows: 2, columns: [{ label: "Reading", cell: "A2" }] }),
    turn("finish", {}),
  ]);
  const run = await runBuild({ analysis: workbook, call: script.call, budget: { maxConsecutiveErrors: 99 } });
  check("a build is not held hostage by coverage it cannot fix", () => {
    assert.equal(run.reason, "finished");
    assert.equal(run.steps.filter((step) => step.tool === "finish" && !step.ok).length, 3);
  });
  check("what it could not cover is recorded on the draft", () => {
    const notes = String(
      draftFromBuild(workbook, run).template.structure.sections.find(
        (section) => section.id === "excel-import-review",
      )!.field?.defaultValue,
    );
    assert.match(notes, /no field in the generated layout/);
  });
})();

await (async () => {
  const first = scripted([
    turn("add_table", { title: "Settings", rows: 2, columns: [{ label: "Wrong", cell: "A2" }] }),
    turn("add_table", { title: "Readings", rows: 2, columns: [{ label: "Reading", cell: "B2" }] }),
    turn("finish", {}),
  ]);
  const run = await runBuild({ analysis: workbook, call: first.call });
  const before = run.state.sections.map((section) => section.title);

  const fixed = await rebuildSection(
    workbook, run, run.state.sections[0].id, "it only has one column",
    async () => turn("add_table", {
      title: "Settings",
      rows: 2,
      columns: [{ label: "Function", cell: "A2" }, { label: "Setting", cell: "B2" }],
    }),
  );

  check("rebuilding a section replaces it in place", () => {
    assert.deepEqual(fixed.state.sections.map((section) => section.title), before);
    assert.equal(fixed.state.sections[0].columns!.length, 2);
    assert.equal(fixed.state.sections[1].columns!.length, 1, "the other section is untouched");
  });
  check("rebuilding replaces that section's source mapping too", () => {
    const sources = fixed.state.sources.filter((source) => source.sectionId === fixed.state.sections[0].id);
    assert.equal(sources.length, 1);
    assert.deepEqual((sources[0] as { anchors: string[] }).anchors, ["A2", "B2"]);
  });
  check("ids stay unique after a rebuild", () => {
    const ids = fixed.state.sections.flatMap((section) => [
      section.id,
      ...(section.columns ?? []).map((column) => column.id),
    ]);
    assert.equal(new Set(ids).size, ids.length);
  });

  const failed = await rebuildSection(workbook, run, run.state.sections[0].id, "", async () => ({ text: "no", toolCalls: [] }));
  check("a rebuild that produces nothing leaves the form alone", () => {
    assert.deepEqual(failed.state.sections.map((section) => section.title), before);
    assert.equal(failed.state.sections[0].columns!.length, 1);
  });
})();

check("a column's type comes from the workbook, not the model's guess", () => {
  // Every column below is declared text, which is what a model does when it is
  // unsure. A text column cannot carry arithmetic, so the calculations would be
  // dropped and the import would map everything and carry nothing.
  const response = stubResponse();
  const table = response.template.structure.sections.find((section: any) => section.id === "readings")!;
  for (const column of (table as any).columns) column.field = { ...column.field, type: FieldType.TEXT, readOnly: undefined };
  const built = buildExcelDraft(workbook, response);
  const rebuilt = built.template.structure.sections.find((section) => section.id === "readings")!;
  assert.equal(rebuilt.columns!.find((column) => column.id === "c-reading")!.field.type, "number");
  assert.equal(summarizeExcelReview(built.review).matched, 4, "the calculations survive");
});

check("a column of text stays text", () => {
  const response = stubResponse();
  const worded = structuredClone(workbook);
  const cells = worded.sheets[0].cells;
  for (const address of ["A2", "A3"]) {
    const cell = cells.find((entry) => entry.address === address)!;
    cell.type = "string";
    cell.value = "N/A";
  }
  const built = buildExcelDraft(worded, response);
  const table = built.template.structure.sections.find((section) => section.id === "readings")!;
  assert.equal(table.columns!.find((column) => column.id === "c-reading")!.field.type, "number",
    "the stub declares this one numeric, and a declared type is not overruled");
});

check("merged rows are stepped over, not read as blanks", () => {
  // A form's row is often two sheet rows merged into one. Stepping by a single
  // row would read the blank half and map nothing.
  const merged = structuredClone(workbook);
  merged.sheets[0].merges = ["A2:A3", "B2:B3"];
  const issues: ExcelImportIssue[] = [];
  const structure = {
    settings: { includePassFail: false, includeJobInfo: false, includePrintHeader: false },
    sections: [{
      id: "t", componentType: ComponentType.CUSTOM_TABLE, title: "T", order: 0, showInPrint: true,
      rows: 2, allowAddRows: false, allowRemoveRows: false,
      columns: [{ id: "c1", label: "A", field: { id: "f1", label: "A", type: FieldType.NUMBER } }],
    }],
  } as any;
  const mappings = deriveMappings(structure, merged, [
    { sectionId: "t", kind: "columns", sheet: "Readings", anchors: ["A2"], rows: 2 },
  ], issues);
  assert.deepEqual(mappings.map((mapping) => mapping.cell), ["A2", "A4"]);
  assert.equal(issues.length, 0);
});

check("a column of fixed text is not read from the workbook", () => {
  const issues: ExcelImportIssue[] = [];
  const structure = {
    settings: { includePassFail: false, includeJobInfo: false, includePrintHeader: false },
    sections: [{
      id: "t", componentType: ComponentType.CUSTOM_TABLE, title: "T", order: 0, showInPrint: true,
      rows: 2, allowAddRows: false, allowRemoveRows: false,
      columns: [
        { id: "c1", label: "NETA", field: { id: "f1", label: "NETA", type: FieldType.TEXT } },
        { id: "c2", label: "Result", field: { id: "f2", label: "Result", type: FieldType.TEXT } },
      ],
    }],
  } as any;
  const mappings = deriveMappings(structure, workbook, [
    { sectionId: "t", kind: "columns", sheet: "Readings", anchors: ["", "B2"], rows: 2 },
  ], issues);
  assert.deepEqual(mappings.map((mapping) => mapping.cell), ["B2", "B3"]);
});

check("the sheet description marks merged cells as one column", () => {
  const merged = structuredClone(workbook);
  merged.sheets[0].merges = ["A1:E1"];
  assert.match(describeWorkbook(merged), /A1: Reading \[spans 5 cols\]/);
});

check("the sheet is described in a form a person could read", () => {
  const text = describeWorkbook(workbook);
  assert.match(text, /SHEET "Readings"/);
  assert.match(text, /B2 =A2\*\$E\$2/, "formulas are shown at their address");
  assert.match(text, /A1: Reading/);
});

console.log("\nFormulas that mix text with numbers");

{
  const ids: Record<string, string> = { E69: "cell/e69", H69: "cell/h69", N5: "cell/n5", AA47: "cell/aa47" };
  const translate = (formula: string) => translateExcelFormula(formula, "Sheet1", (_s, address) => ids[address]);

  check('"N/A" in a numeric branch becomes a blank cell, and says so', () => {
    const result = translate('IF(E69="N/A", "N/A", E69*H69)');
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.match(result.source, /if\(.*, null, /);
    assert.ok(result.notes?.some((text) => /"N\/A" shows as an empty cell/.test(text)), result.notes?.join(" "));
  });

  check('a dash means the same thing', () => {
    const result = translate('IF(E69="", "-", E69*H69)');
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.match(result.source, /null/);
  });

  check("a marker between two text branches stays text", () => {
    // Here "N/A" is one verdict among others, not a missing number.
    const result = translate('IF(E69="N/A", "N/A", IF(E69>1, "PASS", "FAIL"))');
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.match(result.source, /"N\/A"/);
    assert.ok(!result.notes?.length, "nothing was lost, so nothing to warn about");
  });

  check("text that is not a missing-value marker is still refused", () => {
    const result = translate('IF(E69>1, "SEE NOTE", E69*H69)');
    assert.ok(!result.ok);
    assert.match(result.message, /same type/);
  });

  check("rounding to decimals works, with the half-way caveat stated", () => {
    const result = translate("ROUND((N5-32)*5/9, 1)");
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.match(result.source, /round\(.*, 1\)/);
    assert.ok(result.notes?.some((text) => /may differ from Excel in the last digit/.test(text)));
  });

  check("rounding to zero decimals stays exact and unremarked", () => {
    const result = translate("ROUND(N5, 0)");
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.ok(!result.notes?.length);
  });

  check("computed or out-of-range precision is still refused", () => {
    assert.ok(!translate("ROUND(N5, N5)").ok);
    assert.ok(!translate("ROUND(N5, -1)").ok);
    assert.ok(!translate("ROUND(N5, 9)").ok);
  });

  check("EXP translates, for correction factors", () => {
    const result = translate("ROUND(0.1758*EXP(0.0256*AA47), 3)");
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.match(result.source, /exp\(/);
  });
}

console.log("\nRebuilding a section from an instruction");

await (async () => {
  const existing = {
    id: "sec-settings",
    componentType: ComponentType.CUSTOM_TABLE,
    title: "Device Settings",
    order: 3,
    showInPrint: true,
    referenceCode: "DS",
    rows: 2,
    allowAddRows: false,
    allowRemoveRows: false,
    columns: [{ id: "c1", label: "Everything", field: { id: "f1", label: "Everything", type: FieldType.TEXT } }],
  } as any;

  check("the section is described in the terms the tools use", () => {
    const text = describeSection(existing);
    assert.match(text, /Title: Device Settings/);
    assert.match(text, /2 rows and 1 columns/);
    assert.match(text, /"Everything" \(text\)/);
  });

  const rebuilt = await regenerateSection(existing, "four columns: Function, Setting, Delay, I2t", async (messages) => {
    // The instruction and the current shape both reach the model.
    assert.match(messages[1].content, /four columns: Function/);
    assert.match(messages[1].content, /Everything/);
    return turn("add_table", {
      title: "Device Settings",
      rows: 4,
      columns: [
        { label: "Function", cell: "A1" },
        { label: "Setting", cell: "B1" },
        { label: "Delay", cell: "C1" },
        { label: "I2t", cell: "D1" },
      ],
    });
  });

  check("the rebuilt section keeps its identity and its place", () => {
    assert.ok(rebuilt);
    assert.equal(rebuilt!.length, 1);
    assert.equal(rebuilt![0].id, "sec-settings", "formulas elsewhere point at this id");
    assert.equal(rebuilt![0].referenceCode, "DS");
    assert.equal(rebuilt![0].order, 3);
    assert.equal(rebuilt![0].columns!.length, 4);
  });

  const nothing = await regenerateSection(existing, "make it better", async () => ({ text: "I am not sure.", toolCalls: [] }));
  check("an answer with no tool call changes nothing", () => assert.equal(nothing, null));

  const broken = await regenerateSection(existing, "make it better", async () => {
    throw new Error("provider down");
  });
  check("a provider failure changes nothing", () => assert.equal(broken, null));

  const refused = await regenerateSection(existing, "one column", async () =>
    turn("add_table", { title: "x", rows: 2, columns: [{ label: "A", cell: "A1" }, { label: "B", cell: "Q9" }] }),
  );
  check("a refused call does not produce a half-built section", () => assert.equal(refused, null));
})();

console.log(
  `\n${checks - failures}/${checks} Excel import checks passed${failures ? `, ${failures} FAILED` : ""}`,
);

export const excelCheckCount = checks;
export const excelFailureCount = failures;
