/**
 * Run: node scripts/estimate-row-insert-browser.mjs
 * Exercises the real insert control inside a dialog and scrolling table,
 * including the global report stylesheet imported by App.tsx.
 * Local browser fixture only; no app server, authentication, or database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { rolldown } from "rolldown";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import puppeteer from "puppeteer";

const source = readFileSync(new URL("../src/components/estimates/EstimateSheet.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("EstimateSheet.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let containerStyle;
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === "style" && node.initializer?.getText(ast).includes("paddingLeft: isViewMode ? 0 : 16")) {
    containerStyle = node.initializer.expression.getText(ast);
  }
  ts.forEachChild(node, collect);
}
collect(ast);
assert.ok(declarations.has("renderSovInsertHandle") && containerStyle);
assert.match(source, /ref=\{sovInsertPortalRef\}/, "The portal must remain inside the estimate dialog");

// App.tsx eagerly imports this report, which injects CSS even on estimate pages.
const reportUrl = new URL("../src/components/reports/DryTypeTransformerReport.tsx", import.meta.url);
const reportAst = ts.createSourceFile(reportUrl.pathname, readFileSync(reportUrl, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let reportCss = "";
function collectReportCss(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(reportAst) === "style.textContent" && ts.isNoSubstitutionTemplateLiteral(node.right)) {
    reportCss += node.right.text;
  }
  ts.forEachChild(node, collectReportCss);
}
collectReportCss(reportAst);
assert.ok(reportCss, "Exercise the actual imported report CSS, not a test-only imitation");

const fixture = `
import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "@headlessui/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Plus } from "lucide-react";
const styles = ${declarations.get("styles")};
function App() {
  const [open, setOpen] = useState(true);
  const [isViewMode, setIsViewMode] = useState(false);
  const [sovInsertMenuIndex, setSovInsertMenuIndex] = useState(null);
  const [sovInsertHoverIndex, setSovInsertHoverIndex] = useState(null);
  const sovInsertPortalRef = useRef(null);
  const handleInsertLine = (section, index, rowType) => {
    window.insertions.push({ section, index, rowType });
    setSovInsertMenuIndex(null);
  };
  const renderSovInsertHandle = ${declarations.get("renderSovInsertHandle")};
  return <Dialog open={open} onClose={() => setOpen(false)} className="fixed inset-0 z-50 overflow-y-auto">
    <div className="flex min-h-screen items-center justify-center">
      <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />
      <div ref={sovInsertPortalRef} id="estimate-dialog" className="relative m-4 w-full bg-white p-6 dark:bg-neutral-900">
        <Dialog.Title>Estimate fixture</Dialog.Title>
        <button id="outside" onClick={() => {}}>Other estimate action</button>
        <button id="view-mode" onClick={() => setIsViewMode(true)}>View mode</button>
        <div id="outer-scroll" style={{ maxHeight: 300, overflowY: "auto", paddingLeft: 16 }}>
          <div id="table-scroll" style={${containerStyle}}>
            <table style={{ ...styles.table, minWidth: 1100 }}>
              <thead><tr><th style={styles.tableHeader}>Select</th><th style={styles.tableHeader}>Item</th></tr></thead>
              <tbody>{[44, 76, 32, 44].map((height, index) => <tr key={index} style={{ height }}
                onMouseEnter={() => setSovInsertHoverIndex(index)}
                onMouseLeave={() => setSovInsertHoverIndex(null)}>
                <td style={{ ...styles.tableCell, position: "relative", width: 44 }}>
                  {renderSovInsertHandle(index)}
                  {index % 2 === 0 && <input type="checkbox" />}
                </td>
                <td style={styles.tableCell}>Item {index}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </Dialog>;
}
window.insertions = [];
createRoot(document.getElementById("root")).render(<App />);
`;
const virtualEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "estimate-row-insert-fixture.js");
const bundle = await rolldown({
  input: virtualEntry,
  platform: "browser",

  plugins: [{
    name: "estimate-insert-fixture",
    resolveId(id) { if (id === virtualEntry) return id; },
    load(id) {
      if (id === virtualEntry) return ts.transpileModule(fixture, {
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    },
  }],
});
const { output } = await bundle.generate({ format: "iife" });
await bundle.close();
const css = (await postcss([tailwindcss({
  darkMode: "class",
  content: [{ raw: source + fixture, extension: "tsx" }],
})]).process("@tailwind base; @tailwind utilities;", { from: undefined })).css;

const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const trigger = (index) => `tbody tr:nth-child(${index + 1}) button[aria-label="Insert a row here"]`;
  const assertVisibleMenu = async () => {
    await page.waitForSelector('[role="menu"]', { visible: true });
    const displays = await page.$$eval('[role="menuitem"]', (items) => items.map((item) => ({
      label: item.textContent,
      display: getComputedStyle(item).display,
    })));
    assert.equal(displays.length, 4);
    for (const item of displays) assert.notEqual(item.display, "none", `${item.label} is hidden by app-wide CSS`);
    await page.waitForFunction(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      return items.length === 4 && items.every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && item.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      });
    });
    assert.equal(await page.$eval('[role="menu"]', (menu) => !!menu.closest("#table-scroll")), false);
    assert.equal(await page.$eval('[role="menu"]', (menu) => !!menu.closest("#estimate-dialog")), true);
  };
  for (const dark of [false, true]) {
    await page.goto("about:blank");
    await page.setViewport({ width: 900, height: 700 });
    await page.setContent(`<html class="${dark ? "dark" : ""}"><style>${css}
      :root { --brand:#f26722; --cell-bg:${dark ? "#242526" : "#fff"}; --table-bg:var(--cell-bg);
      --header-bg:${dark ? "#1c1e21" : "#f9fafb"}; --border-color:${dark ? "#3a3b3d" : "#e5e7eb"};
      --text-color:${dark ? "#e4e6eb" : "#333"}; --muted-fg:#888; }
      </style><style>${reportCss}</style><div id="root"></div></html>`);
    await page.addScriptTag({ content: output.find((item) => item.type === "chunk").code });
    await page.waitForSelector(trigger(3));
    const alignment = await page.$$eval("tbody tr", (rows) => rows.map((row) => {
      const cell = row.cells[0].getBoundingClientRect();
      const button = row.querySelector("button").getBoundingClientRect();
      return Math.max(Math.abs(button.x + button.width / 2 - cell.x), Math.abs(button.y + button.height / 2 - cell.y));
    }));
    assert.ok(alignment.every((offset) => offset <= 1), "Handles stay centered at every row height");

    for (const [optionIndex, rowType] of ["item", "blank", "section", "subsection"].entries()) {
      const index = optionIndex % 2 === 0 ? 0 : 3;
      await page.click(trigger(index));
      await assertVisibleMenu();
      // Moving from the trigger, through the gap, to the menu must not dismiss it.
      const item = await page.$(`[role="menuitem"]:nth-child(${optionIndex + 1})`);
      const rect = await item.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 8 });
      await item.click();
      await page.waitForSelector('[role="menu"]', { hidden: true });
      await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), {}, trigger(index));
      assert.deepEqual(await page.evaluate(() => window.insertions.at(-1)), { section: "sov", index, rowType });
      assert.ok(await page.$("#estimate-dialog"), "Selection must not close the estimate");
    }

    await page.focus(trigger(3));
    await page.keyboard.press("Enter");
    await assertVisibleMenu();
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="menu"]', { hidden: true });
    await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), {}, trigger(3));
    assert.ok(await page.$("#estimate-dialog"), "Escape closes the menu, not the estimate");

    await page.click(trigger(3));
    await page.click("#outside");
    await page.waitForSelector('[role="menu"]', { hidden: true });
    assert.ok(await page.$("#estimate-dialog"));

    await page.setViewport({ width: 600, height: 400 });
    await page.click(trigger(3));
    await assertVisibleMenu();
    assert.equal(await page.$eval('[role="menu"]', (menu) => menu.dataset.side), "top", "Menu flips above the lower rows when space is tight");
    await page.keyboard.press("Escape");
    await page.click("#view-mode");
    assert.equal(await page.$$eval('button[aria-label="Insert a row here"]', (buttons) => buttons.length), 0);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: centered handles; unclipped first/last-row menus; all four selections; pointer travel; keyboard/Escape; outside dismissal; narrow-screen positioning; view mode; light/dark themes.");
} finally {
  await browser.close();
}
