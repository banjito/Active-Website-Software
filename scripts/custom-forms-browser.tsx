/**
 * Browser regression for merged headers hidden by eagerly imported report CSS.
 * Markup-only tests cannot detect display:none on an otherwise correct header.
 * Run: node --import ./scripts/ts-alias-loader.mjs scripts/custom-forms-browser.tsx
 * Uses local fixtures and Puppeteer's installed browser; no app/server/database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer";
import ts from "typescript";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { SectionBody } from "../src/components/customForms/runtime/SectionBody";
import { createInteractiveControlRenderer } from "../src/components/customForms/runtime/InteractiveControl";
import { createPlaceholderControlRenderer } from "../src/components/customForms/runtime/PlaceholderControl";
import { compileTemplate } from "../src/lib/customForms/compile";
import { VALID_FIXTURES } from "../src/lib/customForms/__fixtures__/v1Templates";
import type { SectionChrome } from "../src/lib/customForms/runtime";
import { FieldType, type SectionConfig } from "../src/lib/types/customForms";

// Read the actual import-time stylesheet without importing a report and its
// authentication/database dependencies. TypeScript gives us cooked CSS escapes.
const reportPath = "../src/components/reports/DryTypeTransformerReport.tsx";
const reportSource = ts.createSourceFile(
  reportPath,
  readFileSync(new URL(reportPath, import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let reportCss = "";
function collectStyle(node: ts.Node) {
  if (
    ts.isBinaryExpression(node) &&
    node.left.getText(reportSource) === "style.textContent" &&
    ts.isNoSubstitutionTemplateLiteral(node.right)
  ) reportCss += node.right.text;
  ts.forEachChild(node, collectStyle);
}
collectStyle(reportSource);
assert.ok(reportCss, "The real report stylesheet must be exercised");

// The filler also mounts ReportWrapper, whose print table rules override the
// older report defaults. Include those real rules rather than a test-only fix.
const wrapperSource = readFileSync(new URL("../src/components/reports/ReportWrapper.tsx", import.meta.url), "utf8");
const wrapperTableRules = wrapperSource.match(/#report-container \.custom-form-container table \{[^}]+\}/g);
assert.ok(wrapperTableRules?.length, "The wrapper's custom-form table rules must be exercised");
const wrapperPrintCss = `@media print { ${wrapperTableRules.join("\n")} }`;

const fixture = VALID_FIXTURES.find((item) => item.name === "insulation-resistance")!;
const columnIds = ["winding", "voltage", "measured-30", "measured-60", "measured-600", "corrected-30", "corrected-60", "corrected-600"];
const table: SectionConfig = {
  ...fixture.structure.sections.find((section: SectionConfig) => section.id === "sec-ir")!,
  columns: columnIds.map((id) => ({
    id,
    label: "", // Imported tables can rely entirely on the authored grid labels.
    width: id === "winding" ? "20%" : undefined,
    field: { id, label: "", type: FieldType.TEXT, readOnly: id.startsWith("corrected-") },
  })),
  cellFormulas: {},
  v2: {
    header: [
      {
        id: "groups",
        cells: [
          { id: "winding-label", columnId: "winding", label: "Winding Under Test", rowSpan: 2 },
          { id: "voltage-label", columnId: "voltage", label: "Test Voltage", rowSpan: 2 },
          { id: "measured-label", columnId: "measured-30", label: "Measured Values", colSpan: 3 },
          { id: "corrected-label", columnId: "corrected-30", label: "Temperature Corrected Values", colSpan: 3 },
        ],
      },
      {
        id: "times",
        cells: columnIds.slice(2).map((columnId, index) => ({
          id: `${columnId}-label`, columnId, label: ["30 sec", "1 min", "10 min"][index % 3],
        })),
      },
    ],
  },
};
const compiled = compileTemplate({
  name: "Merged header browser regression",
  structure: { ...fixture.structure, sections: [table] },
});
assert.ok(compiled.ok && compiled.structure, JSON.stringify(compiled.report.errors));
// Exercise the same serialization and compilation used by a published version.
const published = JSON.parse(JSON.stringify(compiled.structure));
const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
let failures = 0;
let checks = 0;
try {
  const page = await browser.newPage();
  for (const mode of ["fill", "readonly", "preview"] as const) {
    const chrome: SectionChrome = {
      mode,
      density: "normal",
      renderControl: mode === "preview"
        ? createPlaceholderControlRenderer()
        : createInteractiveControlRenderer({
            formData: {}, sections: published.sections, onFieldChange: () => {}, readOnly: mode === "readonly",
          }),
    };
    const markup = renderToStaticMarkup(<SectionBody section={published.sections[0]} chrome={chrome} />);
    const utilities = await postcss([
      tailwindcss({ content: [{ raw: markup, extension: "html" }] }),
    ]).process("@tailwind base; @tailwind utilities;", { from: undefined });
    for (const media of ["screen", "print"] as const) {
      await page.emulateMediaType(media);
      await page.setContent(`<div id="report-container" style="width:675px"><div class="custom-form-container">${markup}</div></div>`);
      await page.addStyleTag({ content: utilities.css });
      await page.addStyleTag({ content: reportCss + wrapperPrintCss });
      const result = await page.$eval("thead", (head) => ({
        display: getComputedStyle(head).display,
        height: head.getBoundingClientRect().height,
        tableWidth: head.closest("table")!.getBoundingClientRect().width,
        columnWidths: [...head.closest("table")!.querySelectorAll("tbody tr:first-child td")].map((cell) => cell.getBoundingClientRect().width),
        rows: head.rows.length,
        cells: [...head.querySelectorAll("th")].map((cell) => ({
          text: cell.textContent,
          height: cell.getBoundingClientRect().height,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        })),
      }));
      checks += 1;
      try {
        assert.equal(result.display, "table-header-group");
        assert.ok(result.height > 0, "Header must be visible, not just present in the markup");
        assert.equal(result.rows, 2);
        assert.equal(result.cells.length, 10);
        assert.ok(result.cells.every((cell) => cell.height > 0));
        assert.equal(result.cells[0].text, "Winding Under Test");
        assert.equal(result.cells[0].rowSpan, 2);
        assert.equal(result.cells[2].colSpan, 3);
        assert.equal(result.cells[3].text, "Temperature Corrected Values");
        assert.ok(Math.abs(result.tableWidth - 675) <= 1, "Table must fit the report width");
        assert.ok(Math.abs(result.columnWidths[0] / result.tableWidth - 0.2) < 0.01, "Authored label-column width must be preserved");
        const readingWidths = result.columnWidths.slice(2);
        assert.equal(readingWidths.length, 6);
        assert.ok(Math.max(...readingWidths) - Math.min(...readingWidths) <= 1, `Reading columns must be even: ${readingWidths.join(", ")}`);
        console.log(`ok: merged header visible and columns evenly spaced in ${mode}/${media} with global report CSS`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL: ${mode}/${media}`, result, String(error));
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`${checks - failures}/${checks} browser checks passed`);
if (failures) process.exitCode = 1;
