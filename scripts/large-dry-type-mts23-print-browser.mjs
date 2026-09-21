/**
 * Run: node scripts/large-dry-type-mts23-print-browser.mjs
 * Local Chromium only; no app, server, database, network, or output files.
 * Exit 1 = missing source styles, extraction, rendering, or browser regression failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer";
import ts from "typescript";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config.cjs";

const PRINTABLE_WIDTH = (8.5 - 0.25 * 2) * 96;
const SCOPE = "large-dry-type-mts23-winding";
const STYLE_NAME = "WINDING_RESISTANCE_PRINT_STYLES";
const readSource = (name) => ts.createSourceFile(name,
  readFileSync(new URL(`../src/components/reports/${name}.tsx`, import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findAll(root, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}
function ancestors(node) {
  const parents = [];
  for (let parent = node.parent; parent; parent = parent.parent) parents.push(parent);
  return parents;
}
const tag = (node) => ts.isJsxElement(node) ? node.openingElement.tagName.getText() : "";
const attr = (node, name) => node.openingElement.attributes.properties.find(
  (property) => ts.isJsxAttribute(property) && property.name.text === name);
const hasClass = (node, name) => attr(node, "className")?.initializer?.getText().includes(name);
const declaration = (source, name) => findAll(source, (node) =>
  ts.isVariableDeclaration(node) && node.name.getText(source) === name &&
  ts.isVariableStatement(node.parent.parent) && node.parent.parent.parent === source)[0];

// Cook template escapes through TypeScript. Never evaluate arbitrary CSS interpolations.
function templateText(node, substitutions = {}) {
  assert.ok(node, "Missing stylesheet initializer");
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return node.text;
  assert.ok(ts.isTemplateExpression(node), "Expected a literal stylesheet template");
  return node.head.text + node.templateSpans.map(({ expression, literal }) => {
    const name = expression.getText();
    assert.ok(Object.hasOwn(substitutions, name), `Unsupported CSS interpolation: ${name}`);
    return substitutions[name] + literal.text;
  }).join("");
}
function stylesheets(source, importTimeOnly = false) {
  const assignments = findAll(source, (node) => ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.left.getText(source) === "style.textContent" &&
    (!importTimeOnly || !ancestors(node).some(ts.isFunctionLike)));
  assert.ok(assignments.length, `No actual stylesheet found in ${source.fileName}`);
  return assignments.map((node) => templateText(node.right, {
    BRAND_COLOR: "#f26722", JOB_INFO_EDITABLE_ATTR: "data-job-info-editable",
  })).join("\n");
}

function buildFixture(source, wrapperSource, cssDeclaration) {
  const tables = findAll(source, (node) => tag(node) === "table" && hasClass(node, "wr-table"));
  assert.equal(tables.length, 2, "Expected the two real winding tables");
  const sections = tables.map((table, index) => {
    const side = index === 0 ? "Primary" : "Secondary";
    const section = ancestors(table).find((node) => ["div", "section"].includes(tag(node)) &&
      node.children.some((child) => tag(child) === "h2" &&
        child.getText(source).includes(`Electrical Tests - Winding Resistance - ${side} Side`)));
    assert.ok(section, `Cannot locate the actual ${side} winding card`);
    assert.ok(hasClass(section, SCOPE), `${side} card is missing ${SCOPE}`);
    assert.ok(findAll(table, (node) => tag(node) === "colgroup").length,
      `${side} table is missing its print colgroup`);
    return section;
  });
  const wrapper = ancestors(sections[0]).find((node) => tag(node) === "ReportWrapper");
  assert.ok(wrapper && ancestors(sections[1]).includes(wrapper), "Both cards must be inside ReportWrapper");
  const siblings = sections[0].parent.children?.filter(ts.isJsxElement);
  assert.equal(siblings?.[siblings.indexOf(sections[0]) + 1], sections[1],
    "Primary card must immediately precede the secondary section");
  const mountedStyles = findAll(wrapper, (node) => tag(node) === "style" &&
    attr(node, "data-report-print") && node.children.some((child) =>
      ts.isJsxExpression(child) && child.expression?.getText(source) === STYLE_NAME));
  assert.equal(mountedStyles.length, 1, "The real returned JSX must mount the print stylesheet exactly once");
  const helper = declaration(source, "calculateSmallestValueDeviation");
  assert.ok(helper, "Extract the real deviation helper, not a copied implementation");
  const wrapperShell = findAll(wrapperSource, (node) => tag(node) === "div" &&
    attr(node, "id")?.initializer?.getText() === '"report-container"')[0];
  assert.ok(wrapperShell, "Cannot find ReportWrapper's real container");

  // Keep the actual manual-mode cards and their layout ancestors, not the rest
  // of the report. Empty top-level sibling shells preserve positional selectors.
  const keep = new Set([...sections, ...mountedStyles]);
  function prune(node) {
    if (keep.has(node)) return node.getText(source);
    if (ts.isJsxElement(node)) {
      const children = node.children.map(prune).join("");
      if (!children && node.parent !== wrapper) return "";
      return node.openingElement.getText(source) + children + node.closingElement.getText(source);
    }
    const parts = [];
    ts.forEachChild(node, (child) => { parts.push(prune(child)); });
    return parts.join("");
  }
  const fixtureSource = `
    const ${STYLE_NAME} = ${JSON.stringify(templateText(cssDeclaration.initializer))};
    const ${helper.getText(source)};
    const unexpectedHandler = () => { throw new Error("Fixture must not execute event handlers"); };
    const handleNestedChange = unexpectedHandler;
    const handleWindingResistanceTestChange = unexpectedHandler;
    const configuredTapCount = 7;
    function ReportWrapper({children, isPrintMode}) {
      const isReportLocked = false;
      return (${wrapperShell.openingElement.getText(wrapperSource)}{children}${wrapperShell.closingElement.getText(wrapperSource)});
    }
    function Fixture({formData}) {
      const isEditing = false, isPrintMode = true;
      return (${prune(wrapper)});
    }
  `;
  const compiled = ts.transpileModule(fixtureSource, {
    fileName: "winding-fixture.tsx", reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  assert.deepEqual(compiled.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error), []);
  // Only the extracted JSX/helper execute; no report imports or application effects.
  return new Function("React", `${compiled.outputText}\nreturn Fixture;`)(React);
}

const windingData = (secondary) => ({
  testCurrent: "10.00", windingTemperature: "25.0", correctionTemperature: "75.0",
  windingMaterial: secondary ? "Aluminum" : "Copper", tempCorrectionFactor: "1.0350000",
  tests: Array.from({ length: 7 }, (_, index) => ({
    tap: index + 1, units: "mΩ",
    ...Object.fromEntries(["phaseA", "phaseB", "phaseC"].map((phase, phaseIndex) => [phase, {
      rMeas: (210 + index + phaseIndex * (index % 2 ? 15 : 1)).toFixed(2),
      rDev: `${(phaseIndex * (index % 2 ? 7.14 : 0.48)).toFixed(2)}%`,
      rCorr: (217.53 + index + phaseIndex * 0.11).toFixed(7),
    }])),
  })),
});

// Runs in Chromium. Range rectangles catch clipped/overlapping static numbers;
// canvas metrics catch clipping inside inputs, whose values aren't DOM text nodes.
function inspectLayout(scope, printableWidth) {
  let checks = 0;
  const failures = [];
  const check = (ok, message) => { checks++; if (!ok) failures.push(message); };
  const rect = (element) => element.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) <= 1;
  const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  const visible = (element) => {
    if (rect(element).width <= 0 || rect(element).height <= 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === "none" || ["hidden", "collapse"].includes(css.visibility) || Number(css.opacity) === 0) return false;
    }
    return true;
  };
  const context = document.createElement("canvas").getContext("2d");
  function checkText(element, label, singleLine = false) {
    const bounds = rect(element);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (!text) continue;
      const range = document.createRange();
      const start = node.textContent.indexOf(text);
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const boxes = [...range.getClientRects()];
      check(boxes.length > 0 && boxes.every((box) => inside(box, bounds)), `${label}: clipped/overlapping text "${text}"`);
      if (singleLine) check(boxes.length === 1, `${label}: numeric value wraps "${text}"`);
    }
  }
  function checkControl(control, bounds, label, tableInput = false) {
    const box = rect(control), css = getComputedStyle(control);
    check(visible(control) && inside(box, bounds), `${label}: control hidden or outside its cell`);
    const available = control.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const text = control.tagName === "SELECT" ? control.selectedOptions[0]?.textContent : control.value;
    context.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const metrics = context.measureText(text || "");
    const textWidth = metrics.width + (parseFloat(css.letterSpacing) || 0) * (text?.length || 0);
    check(textWidth <= available + 1, `${label}: "${text}" needs ${textWidth.toFixed(1)}px, has ${available.toFixed(1)}px`);
    check(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent <=
      control.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom) + 1,
    `${label}: value clipped vertically`);
    if (tableInput) check(parseFloat(css.minWidth) === 0, `${label}: screen min-width not overridden (${css.minWidth})`);
  }

  check(innerWidth === printableWidth, "Viewport must equal Letter width minus two 0.25in margins");
  const report = document.querySelector("#report-container");
  check(visible(report) && rect(report).left >= -1 && rect(report).right <= printableWidth + 1,
    "Report exceeds Letter printable width");
  const cards = [...document.querySelectorAll(`.${scope}`)];
  check(cards.length === 2, "Expected both winding sections");
  const measurements = cards.map((card, sideIndex) => {
    const side = sideIndex === 0 ? "Primary" : "Secondary";
    const grid = card.querySelector(".wr-header"), table = card.querySelector(".wr-table");
    check(visible(card.querySelector("h2")), `${side}: section heading hidden`);
    check(visible(grid) && getComputedStyle(grid).display === "grid", `${side}: five-column grid hidden/collapsed`);
    check(getComputedStyle(grid).gridTemplateColumns.split(" ").length === 5, `${side}: expected five grid tracks`);
    const fields = [...grid.children];
    check(fields.length === 5, `${side}: expected five header fields`);
    const fieldBoxes = fields.map(rect);
    const controls = fields.map((field) => field.querySelector("input, select"));
    fields.forEach((field, index) => {
      check(inside(rect(field), rect(grid)) && near(rect(field).width, fieldBoxes[0].width), `${side}: grid field ${index + 1} width/containment`);
      if (index) check(rect(field).left >= fieldBoxes[index - 1].right - 1, `${side}: grid fields overlap`);
      check(near(rect(controls[index]).bottom, rect(controls[0]).bottom), `${side}: grid inputs not aligned`);
      checkText(field.querySelector("label"), `${side} field ${index + 1} label`);
      checkControl(controls[index], rect(field), `${side} field ${index + 1}`);
    });
    const tableBox = rect(table), head = table.tHead;
    check(visible(table) && tableBox.left >= -1 && tableBox.right <= printableWidth + 1,
      `${side}: table exceeds Letter printable width (${tableBox.width.toFixed(1)}px)`);
    check(table.parentElement.scrollWidth <= table.parentElement.clientWidth + 1, `${side}: horizontal table overflow`);
    check(head && visible(head) && getComputedStyle(head).display === "table-header-group", `${side}: table headers hidden`);
    check(head?.rows.length === 2 && head.querySelectorAll("th").length === 16, `${side}: expected both complete header rows`);
    const cols = [...table.querySelectorAll(":scope > colgroup > col")];
    check(cols.reduce((sum, col) => sum + col.span, 0) === 13 && cols.every(visible), `${side}: expected 13 visible print columns`);
    for (const th of head.querySelectorAll("th")) {
      check(visible(th), `${side}: hidden header ${th.textContent.trim()}`);
      checkText(th, `${side} header`);
    }
    const rows = [...table.tBodies[0].rows];
    check(rows.length === 7, `${side}: expected seven taps`);
    const bodyCols = [...rows[0].cells].map(rect);
    rows.forEach((row, rowIndex) => {
      const cells = [...row.cells];
      check(cells.length === 13, `${side} tap ${rowIndex + 1}: expected 13 body columns`);
      cells.forEach((cell, column) => {
        const box = rect(cell), label = `${side} tap ${rowIndex + 1} col ${column + 1}`;
        check(visible(cell) && inside(box, tableBox) && box.right <= printableWidth + 1,
          `${label}: hidden/outside table or page`);
        check(near(box.left, bodyCols[column].left) && near(box.width, bodyCols[column].width), `${label}: column misaligned`);
        if (column) check(box.left >= rect(cells[column - 1]).right - 1, `${label}: cells overlap`);
        checkText(cell, label, true);
        for (const input of cell.querySelectorAll("input")) checkControl(input, box, label, true);
      });
      check(/^\d+\.\d+%$/.test(cells[11].textContent.trim()), `${side} tap ${rowIndex + 1}: missing numeric deviation`);
      check(cells[12].textContent.trim() === (rowIndex % 2 ? "Fail" : "Pass"), `${side} tap ${rowIndex + 1}: wrong assessment`);
    });
    [...head.rows[0].cells].filter((cell) => cell.colSpan === 3).forEach((cell, phase) => {
      const first = bodyCols[1 + phase * 3], last = bodyCols[3 + phase * 3];
      check(near(rect(cell).left, first.left) && near(rect(cell).right, last.right), `${side}: Phase ${"ABC"[phase]} header doesn't span its three columns`);
    });
    check([...head.rows[0].cells].filter((cell) => cell.colSpan === 3).length === 3, `${side}: missing phase groups`);
    return { columns: bodyCols.map((box) => box.width), fields: fieldBoxes.map((box) => ({ left: box.left, width: box.width })) };
  });
  if (measurements.length === 2) {
    measurements[0].columns.forEach((width, index) => check(near(width, measurements[1].columns[index]),
      `Primary/secondary column ${index + 1} widths differ: ${width.toFixed(1)} / ${measurements[1].columns[index].toFixed(1)}px`));
    measurements[0].fields.forEach((field, index) => check(near(field.left, measurements[1].fields[index].left) &&
      near(field.width, measurements[1].fields[index].width), `Primary/secondary header field ${index + 1} not aligned`));
  }
  return { checks, failures };
}

async function main() {
  const source = readSource("LargeDryTypeTransformerMTS23Report");
  const cssDeclaration = declaration(source, STYLE_NAME);
  assert.ok(cssDeclaration, `${source.fileName} must declare module-level ${STYLE_NAME}`);
  const wrapperSource = readSource("ReportWrapper");
  const Fixture = buildFixture(source, wrapperSource, cssDeclaration);
  const markup = renderToStaticMarkup(React.createElement(Fixture, {
    formData: { windingResistance: { primary: windingData(false), secondary: windingData(true) } },
  }));
  assert.ok(markup.includes("217.5300000"), "Fixture must exercise long corrected values");
  const utilities = await postcss([tailwindcss({ ...tailwindConfig,
    content: [{ raw: markup, extension: "html" }],
  })]).process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });
  const leakedCss = ["DryTypeTransformerReport", "LiquidFilledTransformerReport", "LargeDryTypeTransformerReport"]
    .map((name) => stylesheets(readSource(name), true)).join("\n");
  const headCss = utilities.css + leakedCss + stylesheets(wrapperSource);
  const emulationModule = ts.transpileModule(readFileSync(new URL(
    "../src/components/reports/common/printMediaEmulation.ts", import.meta.url), "utf8"), {
    fileName: "printMediaEmulation.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.deepEqual(emulationModule.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error), []);
  const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
  let failed = 0, totalChecks = 0;
  const cases = [
    { name: "print", media: "print", classes: "" },
    { name: "print/windows", media: "print", classes: "is-windows" },
    { name: "preview/emulated", media: "screen", classes: "" },
    { name: "preview/emulated/windows", media: "screen", classes: "is-windows" },
  ];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: PRINTABLE_WIDTH, height: 1100, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request) => { void request.abort(); });
    for (const scenario of cases) {
      await page.emulateMediaType(scenario.media);
      await page.setContent(`<!doctype html><html class="${scenario.classes}"><head><meta charset="utf-8"><style>${headCss}</style></head><body><div id="root">${markup}</div></body></html>`);
      if (scenario.media === "screen") {
        const state = await page.evaluate((code) => {
          const exports = {};
          new Function("exports", code)(exports);
          // Match ReportWrapper's preview/embedded effect: force-print is only
          // a fallback when the real helper cannot access any print rules.
          const emulation = exports.enablePrintMediaEmulation();
          window.windingPrintEmulation = emulation;
          if (!emulation.isActive()) document.documentElement.classList.add("force-print");
          return {
            active: emulation.isActive(),
            marked: document.documentElement.classList.contains(exports.PRINT_EMULATED_CLASS),
            fallback: document.documentElement.classList.contains("force-print"),
          };
        }, emulationModule.outputText);
        assert.deepEqual(state, { active: true, marked: true, fallback: false },
          `${scenario.name}: real print-media emulation must activate without the fallback class`);
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const result = await page.evaluate(inspectLayout, SCOPE, PRINTABLE_WIDTH);
      if (scenario.media === "screen") result.checks += 3;
      if (scenario.media === "print") {
        // Exercise actual paged printing too, without writing a PDF artifact.
        const pdf = Buffer.from(await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true, timeout: 15000 }));
        result.checks++;
        if (!/\/MediaBox\s*\[\s*0\s+0\s+612(?:\.0+)?\s+792(?:\.0+)?\s*\]/.test(pdf.toString("latin1"))) {
          result.failures.push("Printed PDF is not Letter (612 × 792 points)");
        }
      }
      totalChecks += result.checks;
      if (result.failures.length) {
        failed++;
        console.error(`FAIL ${scenario.name}: ${result.failures.length}/${result.checks} checks failed`);
        result.failures.slice(0, 10).forEach((failure) => console.error(`  ${failure}`));
        if (result.failures.length > 10) console.error(`  ... ${result.failures.length - 10} more failures`);
      } else console.log(`ok ${scenario.name}: ${result.checks} checks`);
      if (scenario.media === "screen") await page.evaluate(() => {
        window.windingPrintEmulation.stop();
        document.documentElement.classList.remove("force-print");
        delete window.windingPrintEmulation;
      });
    }

    // Remove only the fix; the same real markup and leaked styles must expose
    // layout failures, not merely complain about the now-missing colgroups.
    await page.emulateMediaType("print");
    await page.setContent(`<!doctype html><html><head><style>${headCss}</style></head><body><div id="root">${markup}</div></body></html>`);
    const removed = await page.evaluate((scope) => {
      const styles = [...document.querySelectorAll("#report-container style[data-report-print]")];
      const groups = [...document.querySelectorAll(`.${scope} .wr-table > colgroup`)];
      [...styles, ...groups].forEach((element) => element.remove());
      return { styles: styles.length, groups: groups.length };
    }, SCOPE);
    assert.deepEqual(removed, { styles: 1, groups: 2 }, "Negative control must remove the mounted fix");
    const negative = await page.evaluate(inspectLayout, SCOPE, PRINTABLE_WIDTH);
    assert.ok(negative.failures.some((failure) => failure.includes("five-column grid hidden/collapsed")),
      "Negative control must reproduce the collapsed winding header");
    assert.ok(negative.failures.some((failure) => /tap \d+ col (?:[2-9]|10): (?:clipped\/overlapping text|numeric value wraps|\".*\" needs)/.test(failure)),
      "Negative control must reproduce squeezed/clipped reading values");
    console.log("ok negative control: omitted winding CSS/colgroups reproduces collapsed headers and squeezed readings");
  } finally {
    await browser.close();
  }
  console.log(`${cases.length - failed}/${cases.length} browser cases passed (${totalChecks} checks; actual report markup and styles).`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL: ${error.stack || error}`);
  process.exitCode = 1;
});
