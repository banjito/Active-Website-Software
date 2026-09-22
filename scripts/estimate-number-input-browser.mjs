/** Run: node scripts/estimate-number-input-browser.mjs (local browser; no server). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { rolldown } from "rolldown";
import puppeteer from "puppeteer";

const component = fileURLToPath(new URL("../src/components/estimates/EstimateNumberInput.tsx", import.meta.url));
const entry = fileURLToPath(new URL("estimate-number-input-fixture.js", import.meta.url));
const sheetSource = readFileSync(new URL("../src/components/estimates/EstimateSheet.tsx", import.meta.url), "utf8");
const sheetAst = ts.createSourceFile("EstimateSheet.tsx", sheetSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map([
  "handleItemChange", "handleEstimateCellKeyDown", "SOV_FOCUSABLE_COLS", "NON_SOV_FOCUSABLE_COLS",
].map(name => [name, null]));
const cells = { sov: [], nonSov: [] };
function collect(node) {
  if (ts.isVariableDeclaration(node) && declarations.has(node.name.getText(sheetAst))) {
    declarations.set(node.name.getText(sheetAst), node.initializer?.getText(sheetAst));
  }
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sheetAst) === "EstimateNumberInput") {
    const section = node.attributes.properties.find(attr => attr.name?.getText(sheetAst) === "data-estimate-table")?.initializer?.text;
    assert.ok(cells[section], "Numeric cells must identify their estimate table");
    cells[section].push(node.getText(sheetAst));
  }
  ts.forEachChild(node, collect);
}
collect(sheetAst);
assert.deepEqual(Object.values(cells).map(nodes => nodes.length), [4, 4], "Exercise all eight actual numeric controls");
for (const [name, source] of declarations) assert.ok(source, `Missing actual ${name}`);
const fixture = `
import React, { useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import EstimateNumberInput from "@/components/estimates/EstimateNumberInput";
window.changes = [];
window.values = [];
window.events = [];
window.keys = [];
window.readOnlyChanges = [];
function App() {
  const [value, setValue] = useState(12);
  const [revision, rerender] = useReducer(n => n + 1, 0);
  window.fixture = { value, setValue, rerender, revision };
  const number = Number(value);
  const total = (Number.isFinite(number) ? number : 0) * 2;
  return <>
    <EstimateNumberInput id="number" name="quantity" value={value}
      className="estimate-cell" style={{ textAlign: "right", width: 120, borderRadius: 0 }}
      data-row-index="3" aria-label="Quantity" placeholder="Amount"
      onValueChange={number => { window.values.push(number); setValue(number); rerender(); }}
      onChange={event => window.changes.push(event.currentTarget.value)}
      onFocus={event => window.events.push(["focus", event.currentTarget.id])}
      onBlur={event => window.events.push(["blur", event.currentTarget.id])}
      onKeyDown={event => {
        if (event.key === "k") event.preventDefault();
        window.keys.push([event.key, event.currentTarget.id, event.defaultPrevented]);
      }} />
    <button id="after">Next cell</button>
    <EstimateNumberInput id="readonly" value={7.5} readOnly
      onValueChange={number => window.readOnlyChanges.push(number)}
      onKeyDown={event => window.keys.push([event.key, event.currentTarget.id, event.defaultPrevented])} />
    <output id="total">{total}</output>
  </>;
}
window.sheetArrowLeaks = [];
function SheetCells() {
  const items = offset => [0, 1].map(index => ({
    quantity: offset + index * 10 + 1, materialPrice: offset + index * 10 + 2,
    laborMen: offset + index * 10 + 3, laborHours: offset + index * 10 + 4,
  }));
  const [data, setData] = useState(() => ({ sovItems: items(10), nonSovItems: items(30), hoursSummary: {} }));
  const [isDirty, setIsDirty] = useState(false);
  const [isManualLaborHours, setIsManualLaborHours] = useState(true);
  const [isViewMode, setIsViewMode] = useState(false);
  const [revision, rerender] = useReducer(n => n + 1, 0);
  // Only unrelated presentation and hours-summary calculations are stubbed.
  const styles = { tableInput: { width: 100 } };
  const calculateDefaultLaborHours = () => ({ straightTime: 0, overtime: 0, doubleTime: 0 });
  ${[...declarations].map(([name, source]) => `const ${name} = ${source};`).join("\n")}
  window.sheet = { data, isDirty, isManualLaborHours, revision, rerender, setIsViewMode };
  return <div onKeyDown={event => { if (event.key.startsWith("Arrow")) window.sheetArrowLeaks.push(event.key); }}>
    {["sov", "nonSov"].map(section => <section key={section}>
      {data[section + "Items"].map((item, index) => <div key={index}>
        {section === "sov" ? <>${cells.sov.join("\n")}</> : <>${cells.nonSov.join("\n")}</>}
        {(section === "sov" ? SOV_FOCUSABLE_COLS : NON_SOV_FOCUSABLE_COLS)
          .filter(col => ![1, 2, 6, 7].includes(col)).map(col => <input key={col}
            data-estimate-table={section} data-estimate-row={index} data-estimate-col={col}
            onKeyDown={event => handleEstimateCellKeyDown(event, section, index, col, data[section + "Items"].length)} />)}
      </div>)}
    </section>)}
  </div>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><App /><SheetCells /></React.StrictMode>);
`;
const bundle = await rolldown({
  input: entry,
  platform: "browser",
  plugins: [{
    name: "estimate-number-input-fixture",
    resolveId(id) {
      if (id === entry) return entry;
      if (id === "@/components/estimates/EstimateNumberInput") return component;
    },
    load(id) {
      if (id !== entry && id !== component) return;
      return ts.transpileModule(id === entry ? fixture : readFileSync(component, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    },
  }],
});
let code;
try {
  const { output } = await bundle.generate({ format: "iife" });
  code = output.find(item => item.type === "chunk").code;
} finally {
  await bundle.close();
}

const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setOfflineMode(true);
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: code });
  await page.waitForSelector("#number");

  const expectState = async (raw, value, cursor) => {
    const actual = await page.evaluate(() => {
      const input = document.getElementById("number");
      return {
        raw: input.value, value: window.fixture.value,
        total: Number(document.getElementById("total").textContent),
        start: input.selectionStart, end: input.selectionEnd,
      };
    });
    assert.equal(actual.raw, raw, "Keep the exact draft");
    assert.equal(actual.value, value, "Parent receives a live numeric value");
    assert.equal(actual.total, value * 2, "Parent calculations update immediately");
    if (cursor !== undefined) assert.deepEqual([actual.start, actual.end], [cursor, cursor], "Keep the natural caret");
  };
  const rerender = async (name = "fixture") => {
    const before = await page.evaluate(name => {
      const revision = window[name].revision;
      window[name].rerender();
      return revision;
    }, name);
    await page.waitForFunction((name, before) => window[name].revision > before, {}, name, before);
  };
  const select = async (start = 0, end) => {
    await page.focus("#number");
    await page.$eval("#number", (input, start, end) => input.setSelectionRange(start, end ?? input.value.length), start, end);
  };
  const clear = async (key = "Backspace") => {
    await select();
    await page.keyboard.press(key);
    await rerender();
    await expectState("", 0, 0);
  };
  const tab = async (raw, value) => {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "after");
    await expectState(raw, value);
  };

  assert.deepEqual(await page.$eval("#number", input => [
    input.type, input.inputMode, input.name, input.className, input.style.textAlign,
    input.style.width, input.dataset.rowIndex, input.getAttribute("aria-label"), input.placeholder,
  ]), ["text", "decimal", "quantity", "estimate-cell", "right", "120px", "3", "Quantity", "Amount"]);

  // Delete individual digits as well as selected values; zero returns only on blur.
  await select(2, 2);
  await page.keyboard.press("Backspace");
  await expectState("1", 1, 1);
  await page.keyboard.press("Backspace");
  await rerender();
  await expectState("", 0, 0);
  await tab("0", 0);
  await select();
  await page.keyboard.type("12");
  await select(0, 0);
  await page.keyboard.press("Delete");
  await expectState("2", 2, 0);
  await page.keyboard.press("Delete");
  await rerender();
  await expectState("", 0, 0);
  await tab("0", 0);

  await select();
  await page.keyboard.type("42");
  await expectState("42", 42, 2);
  await clear("Delete");
  await tab("0", 0);

  // Assert each keystroke, including drafts that parse to the same parent number.
  for (const text of [".25", "0.25", "1.", "1.20", "-.25", "-1.20", "-", ".", "1e", "bad", "Infinity", "1e309"]) {
    await clear();
    let raw = "";
    let value = 0;
    for (const character of text) {
      raw += character;
      value = Number.isFinite(Number(raw)) ? Number(raw) : 0;
      await page.keyboard.type(character);
      await rerender();
      await expectState(raw, value, raw.length);
    }
    await tab(String(value), value);
  }

  // Partial selection and middle-of-text edits must not jump the caret to the end.
  await select();
  await page.keyboard.type("123.45");
  await select(1, 3);
  await page.keyboard.type("9");
  await expectState("19.45", 19.45, 2);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Delete");
  await expectState("1.45", 1.45, 1);
  await page.keyboard.press("Backspace");
  await expectState(".45", 0.45, 0);
  await page.keyboard.type("-");
  await rerender();
  await expectState("-.45", -0.45, 1);
  await page.keyboard.type("k");
  await expectState("-.45", -0.45, 1);
  await page.click("#after");
  await expectState("-0.45", -0.45);

  // Prop changes outside editing normalize strings and never render NaN/Infinity.
  for (const value of [23, "1.20", "", null, undefined, "bad", NaN, Infinity, -Infinity]) {
    await page.evaluate(value => window.fixture.setValue(value), value);
    await rerender();
    const expected = Number.isFinite(Number(value)) ? String(Number(value)) : "0";
    assert.equal(await page.$eval("#number", input => input.value), expected);
  }

  await page.focus("#readonly");
  await page.$eval("#readonly", input => input.select());
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Delete");
  await page.keyboard.type("99");
  assert.deepEqual(await page.$eval("#readonly", input => [input.value, input.readOnly]), ["7.5", true]);
  await page.click("#after");
  assert.equal(await page.$eval("#readonly", input => input.value), "7.5");
  const log = await page.evaluate(() => ({
    safe: window.values.length > 0 && window.values.every(value => typeof value === "number" && Number.isFinite(value)),
    changes: window.changes, events: window.events, keys: window.keys, readOnlyChanges: window.readOnlyChanges,
  }));
  assert.ok(log.safe, "Every emitted parent value is a finite number");
  for (const raw of ["", ".", ".25", "1.20", "-.25"]) assert.ok(log.changes.includes(raw), "Forward onChange");
  assert.ok(log.events.some(([event, id]) => event === "focus" && id === "number"), "Forward onFocus");
  assert.ok(log.events.some(([event, id]) => event === "blur" && id === "number"), "Forward onBlur");
  for (const key of ["Backspace", "Delete", "ArrowLeft", "Tab"]) {
    assert.ok(log.keys.some(([pressed, id]) => pressed === key && id === "number"), "Forward onKeyDown");
  }
  assert.ok(log.keys.some(([key, id, prevented]) => key === "k" && id === "number" && prevented));
  assert.ok(log.keys.some(([key, id]) => key === "Backspace" && id === "readonly"));
  assert.deepEqual(log.readOnlyChanges, []);

  // Keep expectations independent of the extracted JSX to catch wrong field/row/table wiring.
  const numericCols = { quantity: 1, materialPrice: 2, laborMen: 6, laborHours: 7 };
  const focusableCols = { sov: [0, 1, 2, 6, 7, 11, 12], nonSov: [0, 1, 2, 6, 7, 10, 11] };
  const cell = (section, row, col) => `[data-estimate-table="${section}"][data-estimate-row="${row}"][data-estimate-col="${col}"]`;
  const expectedItems = await page.evaluate(() => [window.sheet.data.sovItems, window.sheet.data.nonSovItems]);
  for (const [sectionIndex, section] of ["sov", "nonSov"].entries()) {
    for (const row of [0, 1]) {
      for (const [field, col] of Object.entries(numericCols)) {
        const selector = cell(section, row, col);
        assert.equal(await page.$eval(selector, input => input.value), String(expectedItems[sectionIndex][row][field]));
        const check = async (raw, value, focused = true) => {
          expectedItems[sectionIndex][row][field] = value;
          await rerender("sheet");
          assert.equal(await page.$eval(selector, input => input.value), raw, `${section}[${row}].${field} draft`);
          assert.deepEqual(await page.evaluate(() => [window.sheet.data.sovItems, window.sheet.data.nonSovItems]), expectedItems,
            "Actual handleItemChange updates only the intended cell, with a finite number");
          assert.equal(await page.evaluate(() => window.sheet.isDirty), true, "Real callback marks estimate dirty");
          if (focused) assert.deepEqual(await page.$eval(selector, input => [input.selectionStart, input.selectionEnd]), [raw.length, raw.length]);
        };
        await page.focus(selector);
        await page.$eval(selector, input => input.select());
        await page.keyboard.press("Backspace");
        await check("", 0);
        await page.keyboard.press("Tab");
        await check("0", 0, false);
        await page.focus(selector);
        await page.$eval(selector, input => input.select());
        await page.keyboard.press("Delete");
        await check("", 0);
        for (const [character, raw, value] of [[".", ".", 0], ["2", ".2", 0.2], ["5", ".25", 0.25]]) {
          await page.keyboard.type(character);
          await check(raw, value);
        }
        await page.keyboard.press("Tab");
        await check("0.25", 0.25, false);
      }
    }
    for (const col of Object.values(numericCols)) {
      const position = focusableCols[section].indexOf(col);
      await page.focus(cell(section, 0, col));
      for (const [key, row, targetCol, selected] of [
        ["ArrowUp", 0, col, false], ["ArrowDown", 1, col, true],
        ["ArrowDown", 1, col, true], ["ArrowUp", 0, col, true],
        ["ArrowRight", 0, focusableCols[section][position + 1], true], ["ArrowLeft", 0, col, true],
        ["ArrowLeft", 0, focusableCols[section][position - 1], true], ["ArrowRight", 0, col, true],
      ]) {
        await page.keyboard.press(key);
        assert.equal(await page.$eval(cell(section, row, targetCol), input => input === document.activeElement), true, `${section} ${col} ${key}`);
        if (selected) assert.equal(await page.evaluate(() => {
          const input = document.activeElement;
          return input.selectionStart === 0 && input.selectionEnd === input.value.length;
        }), true, "Existing arrow navigation selects the destination value");
      }
    }
  }
  assert.equal(await page.evaluate(() => window.sheet.isManualLaborHours), false);
  assert.deepEqual(await page.evaluate(() => window.sheetArrowLeaks), [], "Arrow keys must not reach global navigation");
  await page.evaluate(() => window.sheet.setIsViewMode(true));
  await rerender("sheet");
  assert.equal(await page.$$eval('[data-estimate-table][inputmode="decimal"]', inputs => inputs.filter(input => input.readOnly).length), 16);
  assert.deepEqual(errors, []);
  console.log("PASS: standalone input cases; all eight actual EstimateSheet controls on two rows; actual handleItemChange/dirty state; Backspace/Delete blanks and incremental .25 through rerenders; blur normalization; actual arrow navigation/boundaries/selection; view-mode readOnly.");
} finally {
  await browser.close();
}
