/**
 * Run: node scripts/low-voltage-cable-print-browser.mjs
 * Local Chromium, synthetic data, no app/server/network or output files.
 * Expected-correct regression: exit 1 on extraction, layout, or PDF failures.
 * Uses native print media + window.print() + Chromium's Save-as-PDF backend,
 * not ReportWrapper preview emulation. The interactive OS dialog is not tested.
 * Fixture: real job/electrical/equipment/comments JSX and all layout ancestors.
 * Cable data, visual inspection, app chrome, photos and application effects are
 * omitted; this is a section regression, not a whole-report page-count snapshot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer";
import ts from "typescript";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import tailwindConfig from "../tailwind.config.cjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = (path) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const reportSource = (name) => source(`src/components/reports/${name}.tsx`);
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
  const result = [];
  for (let p = node.parent; p; p = p.parent) result.push(p);
  return result;
}
const tag = (node) => ts.isJsxElement(node) ? node.openingElement.tagName.getText() :
  ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : "";
const attr = (node, name) => (node.openingElement || node).attributes?.properties.find(
  (p) => ts.isJsxAttribute(p) && p.name.text === name);
const hasClass = (node, name) => attr(node, "className")?.initializer?.getText().includes(name);
const declaration = (src, name) => findAll(src, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name)[0];
const shell = (node, content) => node.openingElement.getText() + content + node.closingElement.getText();

// Cook template escapes through TS; only resolve literal local CSS constants.
function cssText(node, src) {
  assert.ok(node, `Missing CSS initializer in ${src.fileName}`);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) {
    const constants = { BRAND_COLOR: "#f26722", JOB_INFO_EDITABLE_ATTR: "data-job-info-editable" };
    return constants[node.text] ?? cssText(declaration(src, node.text)?.initializer, src);
  }
  assert.ok(ts.isTemplateExpression(node), `Unsupported CSS expression: ${node.getText()}`);
  return node.head.text + node.templateSpans.map((s) => cssText(s.expression, src) + s.literal.text).join("");
}
function stylesheets(src, importTimeOnly = false) {
  const property = src.fileName.endsWith("/JobInfoPrintTable.tsx") ? "el.textContent" : "style.textContent";
  const assignments = findAll(src, (n) => ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) &&
    n.left.getText() === property &&
    (!importTimeOnly || !ancestors(n).some(ts.isFunctionLike)));
  assert.ok(assignments.length, `No actual stylesheet in ${src.fileName}`);
  return assignments.map((n) => cssText(n.right, src)).join("\n");
}
function compile(text, name) {
  const output = ts.transpileModule(text, {
    fileName: name, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  assert.deepEqual(output.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error), []);
  return output.outputText;
}

const wrapperSource = reportSource("ReportWrapper");
const layoutSource = source("src/components/ui/Layout.tsx");
const jobSource = reportSource("common/JobInfoPrintTable");
const jobExports = {};
new Function("require", "exports", compile(jobSource.text, jobSource.fileName))((name) => {
  assert.equal(name, "react", "JobInfoPrintTable acquired an unhandled runtime dependency");
  return React;
}, jobExports);

function buildFixture(src) {
  const tables = findAll(src, (n) => tag(n) === "table" && hasClass(n, "electrical-tests-table"));
  assert.equal(tables.length, 1, "Expected one real electrical table");
  const electrical = ancestors(tables[0]).find((n) => tag(n) === "section");
  const wrapper = ancestors(electrical).find((n) => tag(n) === "ReportWrapper");
  const outer = ancestors(wrapper).find((n) => tag(n) === "div");
  assert.ok(outer && electrical && wrapper, "Missing actual report ancestors");
  const headings = ["section-job-info", "section-test-equipment", "section-comments"];
  const sections = headings.map((name) => {
    const heading = findAll(wrapper, (n) => tag(n) === "h2" && hasClass(n, name));
    assert.equal(heading.length, 1, `Missing ${name}`);
    return heading[0].parent;
  });
  const keep = new Set([electrical, ...sections, ...findAll(wrapper, (n) => tag(n) === "style")]);
  // Empty sibling shells keep positional selectors intact. Never change ancestor
  // attributes (notably the outer inline minHeight/padding) or add corrective CSS.
  function prune(node) {
    if (keep.has(node)) return node.getText();
    if (ts.isJsxElement(node)) {
      const children = node.children.map(prune).join("");
      if (!children && node.parent !== electrical.parent && node.parent !== wrapper) return "";
      return shell(node, children);
    }
    const parts = [];
    ts.forEachChild(node, (child) => parts.push(prune(child)));
    return parts.join("");
  }
  const wrapperShell = findAll(wrapperSource, (n) => tag(n) === "div" &&
    attr(n, "id")?.initializer?.getText() === '"report-container"')[0];
  assert.ok(wrapperShell, "Missing ReportWrapper container");
  const main = findAll(declaration(layoutSource, "mainContent"), (n) => tag(n) === "main")[0];
  const mainReference = findAll(layoutSource, (n) => ts.isJsxExpression(n) && n.expression?.getText() === "mainContent")[0];
  const layoutAncestors = ancestors(mainReference).filter(ts.isJsxElement);
  assert.ok(main && layoutAncestors.length >= 3, "Missing Layout flex/scroll ancestors");
  let layout = shell(main, "{children}");
  for (const ancestor of layoutAncestors) layout = shell(ancestor, layout);
  const names = ["TEST_VOLTAGES", "CABLE_SIZES", "EVALUATION_RESULTS", "CONFIGURATION_OPTIONS",
    "TEMP_CONVERSION_DATA", "TCF_DATA", "convertFahrenheitToCelsius", "getTCF", "applyTCF", "renderTextWithBreaks"];
  // Include any mounted literal stylesheet constants introduced by the source fix.
  for (const n of src.statements.filter(ts.isVariableStatement).flatMap((s) => [...s.declarationList.declarations])) {
    if (/STYLES|CSS/.test(n.name.getText())) names.push(n.name.getText());
  }
  const constants = [...new Set(names)].map((name) => {
    const n = declaration(src, name);
    assert.ok(n, `Missing source helper ${name}`);
    return `const ${n.getText()};`;
  }).join("\n");
  const code = `
    const BRAND_COLOR = '#f26722';
    ${constants}
    const unexpected = () => { throw new Error('Fixture executed an application handler'); };
    const handleChange = unexpected, handleNumberOfCablesChange = unexpected;
    const handleRemoveEmptyRows = unexpected, setFormData = unexpected;
    const handleReadingChange = unexpected, handleTestSetChange = unexpected, handleKeyDown = unexpected;
    const maskCustomerName = value => value, maskCustomerAddress = value => value;
    // Screen-only autocomplete is intentionally not mounted; its print table is real.
    const EquipmentAutocomplete = () => null;
    function ReportWrapper({children, isPrintMode}) {
      const isReportLocked = false;
      return (${shell(wrapperShell, "{children}")});
    }
    function Layout({children}) {
      const useHeaderBarLayout = true;
      return (${layout});
    }
    function Fixture({formData}) {
      const isEditMode = false, isPrintMode = false;
      const celsiusTemperature = convertFahrenheitToCelsius(formData.temperature);
      const tcf = getTCF(celsiusTemperature);
      return (<Layout>${prune(outer)}</Layout>);
    }
    return { Fixture, applyTCF, getTCF, convertFahrenheitToCelsius };
  `;
  return new Function("React", "JobInfoPrintTable", compile(code, "lv-cable-fixture.tsx"))(React, jobExports.default);
}

const readingKeys = ["aToGround", "bToGround", "cToGround", "nToGround", "aToB", "bToC", "cToA", "aToN", "bToN", "cToN"];
function fixtureData(helpers) {
  const temperature = 77;
  const tcf = helpers.getTCF(helpers.convertFahrenheitToCelsius(temperature));
  return {
    customer: "Local Cable Regression", address: "1200 Test Avenue, Denver, CO 80202",
    jobNumber: "LV-2026-012", technicians: "Alex Tester", date: "2026-10-06",
    identifier: "LV-FEEDERS", user: "Local Inspector", substation: "Station West",
    eqptLocation: "Electrical Room", temperature, humidity: 45, numberOfCables: 12, testVoltage: "1000V",
    testSets: Array.from({ length: 12 }, (_, i) => {
      const readings = Object.fromEntries(readingKeys.map((key, j) => [key, (1234.25 + i * 20 + j).toFixed(2)]));
      return {
        id: i + 1, from: `FROM${String(i + 1).padStart(2, "0")} Main switchboard west wing\nFeeder isolation cabinet`,
        to: `TO${String(i + 1).padStart(2, "0")} Distribution panel east wing\nLevel three motor control`,
        size: "500", config: "4 wire", result: "PASS", readings: { ...readings, continuity: "✓" },
        correctedReadings: { ...Object.fromEntries(readingKeys.map((key) => [key, helpers.applyTCF(readings[key], tcf)])), continuity: "✓" },
      };
    }),
    testEquipment: { megohmmeter: "Megger MIT1025", serialNumber: "LV-SERIAL-9912", ampId: "AMP-4012", calDate: "09/15/2026",
      comments: "COMMENTSTART All twelve feeder sets were isolated and tested.\nMeasured and temperature-corrected readings recorded. COMMENTEND" },
  };
}

// Chromium-side checks: real text ranges and input glyph widths, not just scrollWidth.
function inspectLayout() {
  const failures = [];
  let checks = 0;
  const check = (ok, message) => { checks++; if (!ok) failures.push(message); };
  const rect = (el) => el.getBoundingClientRect();
  const label = (el) => el.id || el.getAttribute("aria-label") || `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`;
  const visible = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    }
    return rect(el).width > 0 && rect(el).height > 0;
  };
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const table = document.querySelector(".electrical-tests-table");
  const report = document.querySelector("#report-container");
  const outer = report.parentElement;
  const tableBox = rect(table);
  check(visible(table), "Electrical table hidden or collapsed");
  check(tableBox.left >= -1 && tableBox.right <= innerWidth + 1,
    `Electrical table outside printable width: ${tableBox.left.toFixed(1)}..${tableBox.right.toFixed(1)} / ${innerWidth}px`);
  const chain = [];
  for (let el = table; el; el = el.parentElement) {
    const s = getComputedStyle(el), box = rect(el);
    chain.push({ name: label(el), width: +box.width.toFixed(1), minHeight: s.minHeight,
      paddingBottom: s.paddingBottom, overflow: `${s.overflowX}/${s.overflowY}`, transform: s.transform });
    check(box.left >= -1 && box.right <= innerWidth + 1,
      `${label(el)} outside printable width: ${box.left.toFixed(1)}..${box.right.toFixed(1)} / ${innerWidth}px`);
    check(el.scrollWidth <= el.clientWidth + 2, `${label(el)} horizontal overflow ${el.scrollWidth} > ${el.clientWidth}px`);
    if (["auto", "scroll", "hidden", "clip"].includes(s.overflowY)) {
      check(el.scrollHeight <= el.clientHeight + 2, `${label(el)} vertical clipping ${el.scrollHeight} > ${el.clientHeight}px`);
    }
  }
  check(["0px", "auto"].includes(getComputedStyle(outer).minHeight), `Outer report retains min-height ${getComputedStyle(outer).minHeight}`);
  check(parseFloat(getComputedStyle(outer).paddingBottom) <= 1, `Outer report retains bottom padding ${getComputedStyle(outer).paddingBottom}`);
  check(getComputedStyle(table).transform === "none", `Electrical table retains print transform ${getComputedStyle(table).transform}`);
  check(parseFloat(getComputedStyle(table).marginBottom) >= 0, `Electrical table has negative bottom margin ${getComputedStyle(table).marginBottom}`);
  check(parseFloat(getComputedStyle(table).minWidth) <= innerWidth || getComputedStyle(table).minWidth === "auto",
    `Screen table minimum leaked into print: ${getComputedStyle(table).minWidth}`);

  // Resolve the logical grid through colSpan/rowSpan; a physical cell count is
  // wrong for this table. Do not hard-code the reported "26 columns" assumption.
  function grid(rows) {
    const cells = [];
    [...rows].forEach((row, r) => {
      cells[r] ||= [];
      let c = 0;
      for (const cell of row.cells) {
        while (cells[r][c]) c++;
        for (let y = r; y < r + cell.rowSpan; y++) {
          cells[y] ||= [];
          for (let x = c; x < c + cell.colSpan; x++) cells[y][x] = cell;
        }
        c += cell.colSpan;
      }
    });
    return cells;
  }
  const heads = grid(table.tHead.rows), body = grid(table.tBodies[0].rows);
  const columns = heads[0].length;
  check(table.tBodies[0].rows.length === 24, `Expected 24 body rows, got ${table.tBodies[0].rows.length}`);
  for (const [r, row] of [...heads, ...body].entries()) {
    check(row.length === columns && row.every(Boolean), `Row ${r + 1}: inconsistent logical columns (${row.length} vs ${columns})`);
    row.forEach((cell, c) => {
      if (c && row[c - 1] === cell) return;
      const reference = heads[heads.length - 1][c];
      check(Math.abs(rect(cell).left - rect(reference).left) <= 1,
        `Row ${r + 1} col ${c + 1}: header/body left edges disagree`);
    });
  }
  const context = document.createElement("canvas").getContext("2d");
  const targets = [...report.querySelectorAll("th, td, h2, caption, input, select, textarea")].filter(visible);
  for (const el of targets) {
    const bounds = rect(el), s = getComputedStyle(el);
    if (el.matches("input, select, textarea")) {
      const value = el.tagName === "SELECT" ? el.selectedOptions[0]?.textContent : el.value;
      if (!value) continue;
      context.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const available = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      if (el.tagName !== "TEXTAREA") check(context.measureText(value).width <= available + 1,
        `${label(el)}: "${value}" needs ${context.measureText(value).width.toFixed(1)}px, has ${available.toFixed(1)}px`);
      check(el.scrollHeight <= el.clientHeight + 1, `${label(el)}: value clipped vertically`);
      const cell = el.closest("td");
      if (cell) {
        const box = rect(cell);
        const outsets = [box.left - bounds.left, bounds.right - box.right, box.top - bounds.top, bounds.bottom - box.bottom]
          .map((value) => Math.max(0, value).toFixed(1));
        check(inside(bounds, box), `${label(el)}: control extends beyond cell (left/right/top/bottom ${outsets.join("/")}px; CSS left ${s.left})`);
      }
      continue;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent.trim() || !visible(text.parentElement) || text.parentElement.closest("input, select, textarea")) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const boxes = [...range.getClientRects()].filter((box) => box.width > 0);
      const description = text.textContent.trim().replace(/\s+/g, " ");
      check(boxes.every((box) => inside(box, bounds)), `${label(el)}: clipped/overlapping text "${description}"`);
      for (let p = text.parentElement; p && p !== document.body; p = p.parentElement) {
        const css = getComputedStyle(p), clip = rect(p);
        if (["hidden", "clip", "auto", "scroll"].includes(css.overflowX))
          check(boxes.every((b) => b.left >= clip.left - 1 && b.right <= clip.right + 1), `"${description}" clipped horizontally by ${label(p)}`);
        if (["hidden", "clip", "auto", "scroll"].includes(css.overflowY))
          check(boxes.every((b) => b.top >= clip.top - 1 && b.bottom <= clip.bottom + 1), `"${description}" clipped vertically by ${label(p)}`);
      }
      if (/^\d+\.\d+$/.test(description)) check(boxes.length === 1, `Reading wraps: ${description}`);
    }
  }
  for (const [name, selector] of [["Job info", ".job-info-print-table"], ["Electrical header", "#electrical-tests-heading"],
    ["Equipment", ".section-test-equipment"], ["Comments", ".section-comments"]]) {
    check(!!report.querySelector(selector) && visible(report.querySelector(selector)), `${name} hidden/collapsed`);
  }
  return { failures, checks, columns, chain, tableWidth: +tableBox.width.toFixed(1) };
}

// Read the source cascade's actual @page margins rather than masking it with
// harness CSS. Letter dimensions below are CSS pixels (96/in), PDF uses 72/in.
function pageSetup() {
  const margins = { top: 0, right: 0, bottom: 0, left: 0 };
  const px = (value) => {
    const match = value.match(/^([\d.]+)(in|px|pt|mm|cm)?$/);
    if (!match) throw new Error(`Unsupported @page margin: ${value}`);
    return Number(match[1]) * ({ in: 96, px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54 }[match[2]] || 1);
  };
  function visit(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
      if (rule instanceof CSSPageRule) {
        if (rule.selectorText) throw new Error(`Handle named/pseudo-page rule explicitly: ${rule.selectorText}`);
        for (const side of Object.keys(margins)) {
          const value = rule.style.getPropertyValue(`margin-${side}`);
          if (value) margins[side] = px(value);
        }
      } else if (rule.cssRules) visit(rule.cssRules);
    }
  }
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
  return { margins, width: Math.floor(816 - margins.left - margins.right), height: Math.floor(1056 - margins.top - margins.bottom) };
}
const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, "");
async function inspectPDF(bytes, data, setup) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const failures = [], texts = [];
  let checks = 0;
  const check = (ok, message) => { checks++; if (!ok) failures.push(message); };
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str?.trim());
      texts.push(normalize(items.map((item) => item.str).join("")));
      check(items.length > 0, `PDF page ${i} is empty`);
      check(Math.abs(viewport.width - 612) < 1 && Math.abs(viewport.height - 792) < 1,
        `PDF page ${i}: not Letter (${viewport.width} x ${viewport.height}pt)`);
      for (const item of items) {
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        check(x >= setup.margins.left * .75 - 2 && x + item.width <= 612 - setup.margins.right * .75 + 2 &&
          y - item.height >= setup.margins.top * .75 - 2 && y <= 792 - setup.margins.bottom * .75 + 2,
        `PDF page ${i}: text outside printable box "${item.str}" at ${x.toFixed(1)},${y.toFixed(1)} (${item.width.toFixed(1)}pt wide)`);
      }
    }
    const allText = texts.join("");
    const expected = ["Electrical Tests", "Circuit Designation", "From", "To", "Size", "Config.", "Cont.", "Results",
      "A-G", "B-G", "C-G", "N-G", "A-B", "B-C", "C-A", "A-N", "B-N", "C-N", "RDG", "20°C",
      data.customer, data.jobNumber, data.technicians, data.identifier, data.user, data.substation, data.eqptLocation,
      ...Object.values(data.testEquipment), ...data.testSets.flatMap((set) => [set.from, set.to,
        ...readingKeys.flatMap((key) => [set.readings[key], set.correctedReadings[key]])])];
    for (const text of expected) check(allText.includes(normalize(text)), `PDF missing text: ${JSON.stringify(text)}`);
    // Each page containing readings needs the repeated table header; extraction
    // alone can otherwise pass even when pagination loses the headings.
    texts.forEach((text, i) => {
      if (data.testSets.some((set) => readingKeys.some((key) => text.includes(normalize(set.readings[key]))))) {
        for (const heading of ["Circuit Designation", "A-G", "C-N", "Results"])
          check(text.includes(normalize(heading)), `PDF page ${i + 1}: readings without header ${heading}`);
      }
    });
    return { failures, checks, pages: texts.map((text) => text.length) };
  } finally { await pdf.destroy(); }
}

async function main() {
  const leaked = ["DryTypeTransformerReport", "LiquidFilledTransformerReport", "LargeDryTypeTransformerReport"]
    .map((name) => stylesheets(reportSource(name), true)).join("\n");
  const browser = await puppeteer.launch({ headless: true, timeout: 15000, args: ["--disable-background-networking"] });
  let failed = 0;
  try {
    for (const name of ["12setslowvoltagecables", "LowVoltageCableMTS23Report"]) {
      const src = reportSource(name), helpers = buildFixture(src), data = fixtureData(helpers);
      const markup = renderToStaticMarkup(React.createElement(helpers.Fixture, { formData: data }));
      const utilities = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: markup, extension: "html" }] })])
        .process(read("src/index.css"), { from: undefined });
      // Import-time styles precede child effects (JobInfo, then Wrapper), which
      // precede report effects. Mounted JSX styles remain at their real location.
      const css = utilities.css + leaked + stylesheets(jobSource) + stylesheets(wrapperSource) + stylesheets(src);
      for (const platform of ["native", "windows"]) {
        const page = await browser.newPage();
        try {
          page.setDefaultTimeout(15000);
          await page.setRequestInterception(true);
          page.on("request", (request) => { void request.abort(); });
          await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
          await page.emulateMediaType("screen");
          await page.setContent(`<!doctype html><html class="${platform === "windows" ? "is-windows" : ""}"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root">${markup}</div></body></html>`);
          // Call the real native entry point; headless Chromium has no OS dialog.
          await page.evaluate(() => { window.printEvents = 0; addEventListener("beforeprint", () => window.printEvents++); window.print(); });
          await page.emulateMediaType("print");
          const setup = await page.evaluate(pageSetup);
          await page.setViewport({ width: setup.width, height: setup.height, deviceScaleFactor: 1 });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          const layout = await page.evaluate(inspectLayout);
          const bytes = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, scale: 1, timeout: 15000 });
          const pdf = await inspectPDF(bytes, data, setup);
          assert.ok(await page.evaluate(() => window.printEvents > 0), "Native beforeprint event did not fire");
          const failures = [...layout.failures, ...pdf.failures];
          const title = `${name}/${platform}`;
          console.log(`${failures.length ? "FAIL" : "ok"} ${title}: ${failures.length}/${layout.checks + pdf.checks} checks failed; ${layout.columns} columns; table ${layout.tableWidth}/${setup.width}px; PDF page text lengths [${pdf.pages.join(", ")}]`);
          if (failures.length) {
            failed++;
            // Group repeated failures, retaining one concrete example and count.
            const groups = new Map();
            for (const failure of failures) {
              const key = failure.replace(/Set \d+ Reading \w+/g, "Set N Reading").replace(/Set \d+/g, "Set N")
                              .replace(/"[^"]*"/g, '"…"').replace(/\d+(?:\.\d+)?/g, "N");
              const group = groups.get(key) || { count: 0, example: failure };
              group.count++;
              groups.set(key, group);
            }
            for (const { count, example } of groups.values()) console.error(`  ${count}x ${example}`);
            console.log(`  scroll ancestors: ${layout.chain.filter((item) => item.overflow.includes("auto"))
              .map((item) => `${item.name} (${item.width}px, ${item.overflow})`).join(" > ")}`);
          }
        } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
  console.log(`${4 - failed}/4 native print cases passed. No preview emulation or source CSS overrides.`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(`FAIL: ${error.stack || error}`); process.exitCode = 1; });
