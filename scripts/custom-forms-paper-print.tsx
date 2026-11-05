/**
 * Browser check: does paper view size table columns the same as the printout?
 * Renders every default component, filled in, under the real ReportWrapper print
 * stylesheet and the real paper view stylesheet, on Windows and non-Windows.
 * Run: node --import ./scripts/ts-alias-loader.mjs scripts/custom-forms-paper-print.tsx
 * Uses Puppeteer's installed browser; no app/server/database.
 */
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer";
import ts from "typescript";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { SectionBody } from "../src/components/customForms/runtime/SectionBody";
import { createInteractiveControlRenderer } from "../src/components/customForms/runtime/InteractiveControl";
import { PaperViewStyles } from "../src/components/customForms/runtime/PaperView";
import { COMPONENT_LIBRARY } from "../src/lib/customForms/componentLibrary";
import type { SectionChrome } from "../src/lib/customForms/runtime";
import { rowStateKey } from "../src/lib/customForms/runtime/layout";

/** Columns further apart than this (share of the table) count as a mismatch. */
const TOLERANCE = 1.5;

// The wrapper's real stylesheet, read from source so its imports stay out of it.
const wrapperPath = "../src/components/reports/ReportWrapper.tsx";
const wrapperSource = ts.createSourceFile(
  wrapperPath,
  readFileSync(new URL(wrapperPath, import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let wrapperCss = "";
function collectStyle(node: ts.Node) {
  if (
    ts.isBinaryExpression(node) &&
    node.left.getText(wrapperSource) === "style.textContent" &&
    ts.isTemplateExpression(node.right)
  ) {
    wrapperCss += node.right.head.text + node.right.templateSpans.map((s) => `#f26722${s.literal.text}`).join("");
  }
  ts.forEachChild(node, collectStyle);
}
collectStyle(wrapperSource);
if (!wrapperCss) throw new Error("ReportWrapper stylesheet not found");

const paperCss = renderToStaticMarkup(<PaperViewStyles />)
  .replace(/^<style>|<\/style>$/g, "")
  .replace(/&gt;/g, ">")
  .replace(/&lt;/g, "<")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&");

/** Realistic readings, so columns that size to their content have some. */
function sampleData(section: any) {
  const data: Record<string, any> = {};
  const value = (field: any) =>
    field?.type === "select" || field?.type === "radio"
      ? (field.options?.[0]?.value ?? "")
      : field?.type === "number"
        ? "1234.5"
        : "Sample reading";
  const rows = section.conditionalRows?.length || section.rows || 1;
  for (let r = 0; r < rows; r++) {
    const row: Record<string, any> = {};
    for (const col of section.columns ?? []) row[col.field?.id ?? col.id] = value(col.field);
    data[rowStateKey(section.id, r)] = row;
  }
  const own: Record<string, any> = {};
  for (const field of section.fields ?? []) own[field.id] = value(field);
  for (const item of section.checklistItems ?? []) own[item.id] = item.resultOptions?.[1] ?? "Satisfactory";
  data[section.id] = { ...own, temperature: "68", temperatureCelsius: 20, humidity: "50" };
  return data;
}

const measure = () =>
  [...document.querySelectorAll(".custom-form-container table")].map((table) => {
    const total = table.getBoundingClientRect().width;
    const row = [...table.querySelectorAll("tr")].sort((a, b) => b.cells.length - a.cells.length)[0];
    const cells = [...table.querySelectorAll<HTMLElement>("td:not(.cf-row-action)")];
    return {
      total: Math.round(total),
      shares: row
        ? [...row.cells]
            .filter((c) => !c.classList.contains("cf-row-action"))
            .map((c) => Math.round((c.getBoundingClientRect().width / total) * 1000) / 10)
        : [],
      // Anything visible that pokes out of the right side of its cell.
      spills: cells.flatMap((cell) => {
        const edge = cell.getBoundingClientRect().right + 1;
        return [...cell.querySelectorAll<HTMLElement>("*")]
          .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().right > edge)
          .map((el) => el.tagName + ":" + (el.textContent || "").slice(0, 20));
      }),
      uncentered: [...table.querySelectorAll(".cf-result-col")].filter((c) => getComputedStyle(c).textAlign !== "center").length,
      actionsShown: [...table.querySelectorAll(".cf-row-action")].filter((c) => getComputedStyle(c).display !== "none").length,
      actionsInsideTable: [...table.querySelectorAll("td.cf-row-action")].filter(
        (c) => getComputedStyle(c).display !== "none" && c.getBoundingClientRect().left < table.getBoundingClientRect().right - 1,
      ).length,
    };
  });

const browser = await puppeteer.launch({ headless: true, timeout: 15000 });
let mismatches = 0;
let compared = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const text = (id: string, label: string) => ({ id, label, field: { id, label, type: "text" } });
  const inspection = COMPONENT_LIBRARY.find((c) => c.name.startsWith("Visual"))!;
  const extras: any[] = [
    {
      name: "Checklist with renamed headings",
      defaultConfig: { ...inspection.defaultConfig, checklistHeaders: { section: "Item", description: "Task", result: "Status" } },
    },
    {
      // Nothing sets a width, and the text differs, so Windows sizes by content.
      name: "Table with no widths",
      defaultConfig: { rows: 2, columns: [text("a", "Short"), text("b", "A much longer heading"), text("c", "Mid")] },
      rowData: { a: "1", b: "A long reading that needs far more room than the rest", c: "Medium value" },
    },
    {
      name: "Inspection-style table",
      defaultConfig: { rows: 2, columns: [text("a", "NETA Section"), text("b", "Description"), text("c", "Result"), text("d", "Comments")] },
      rowData: { a: "7.1.A", b: "Inspect physical condition", c: "Satisfactory", d: "None" },
    },
  ];
  for (const definition of [...COMPONENT_LIBRARY, ...extras] as any[]) {
    const section: any = { ...definition.defaultConfig, id: "s1", title: definition.name, order: 0, showInPrint: true };
    const data = sampleData(section);
    if (definition.rowData) {
      for (let r = 0; r < section.rows; r++) data[rowStateKey(section.id, r)] = definition.rowData;
    }
    const chrome: SectionChrome = {
      mode: "fill",
      density: "normal",
      renderControl: createInteractiveControlRenderer({ formData: data, sections: [section], onFieldChange: () => {} }),
      conditionValues: () => data,
      getSettingValue: (s, id) => data[s.id]?.[id],
      setSettingValue: () => {},
      renderRowAction: (s) => (s.allowRemoveRows ? <button type="button">×</button> : null),
    };
    let markup = "";
    try {
      markup = renderToStaticMarkup(<SectionBody section={section} chrome={chrome} />);
    } catch {
      console.log(`SKIP  ${definition.name} (did not render on its own)`);
      continue;
    }
    if (!markup.includes("<table")) continue;
    const utilities = await postcss([
      tailwindcss({ content: [{ raw: markup, extension: "html" }] }),
    ]).process("@tailwind base; @tailwind utilities;", { from: undefined });

    // A checklist also runs with its own widths, as a builder can now set them.
    const variants: [string, string][] = [[definition.name, markup]];
    if (section.checklistItems) {
      const cols = ["20%", "60%", "20%"].map((w) => `<col style="width:${w}">`).join("");
      variants.push([`${definition.name} (own widths 20/60/20)`, markup.replace(/<colgroup>.*?<\/colgroup>/, `<colgroup>${cols}</colgroup>`)]);
    }

    for (const [name, variant] of variants) for (const windows of [true, false]) {
      const htmlClass = windows ? "is-windows" : "";
      const load = async (media: "print" | "screen", paper: boolean) => {
        await page.emulateMediaType(media);
        const inner = `<div class="custom-form-container"><div>toolbar</div><div>${variant}</div></div>`;
        await page.setContent(
          `<!doctype html><html class="${htmlClass}"><body style="margin:0"><div id="report-container"><div>header</div><div class="report-body">${
            paper ? `<div class="cf-paper">${inner}</div>` : inner
          }</div></div></body></html>`,
        );
        await page.addStyleTag({ content: utilities.css });
        await page.addStyleTag({ content: wrapperCss });
        if (paper) await page.addStyleTag({ content: paperCss });
        return page.evaluate(measure);
      };
      const printed = await load("print", false);
      const paper = await load("screen", true);
      printed.forEach((table, i) => {
        compared += 1;
        const other = paper[i];
        const gap = Math.max(0, ...table.shares.map((share, c) => Math.abs(share - (other?.shares[c] ?? 0))));
        const equal = name.includes("Visual") || name.includes("renamed") || name.includes("no widths");
        const ownWidths = name.includes("own widths") ? [20, 60, 20] : equal ? [33.3, 33.3, 33.3] : null;
        const ignored = ownWidths?.some((width, c) => Math.abs(width - table.shares[c]) > TOLERANCE);
        const layoutIssues = [
          ...(other?.spills ?? []).map((s) => `paper spill ${s}`),
          ...(table.uncentered ? ["print result not centered"] : []),
          ...(other?.uncentered ? ["paper result not centered"] : []),
          ...(table.actionsShown ? ["row button prints"] : []),
          ...(other?.actionsInsideTable ? ["row button inside table"] : []),
        ];
        const bad = gap > TOLERANCE || table.total !== other?.total || !!ignored || layoutIssues.length > 0;
        if (bad) mismatches += 1;
        const label = `${windows ? "win" : "mac"}  ${name}${printed.length > 1 ? ` #${i + 1}` : ""}`;
        if (bad || name.includes("own widths") || name.startsWith("Contact")) {
          console.log(
            `${bad ? "DIFF" : "same"}  ${label}\n      print ${table.total}px ${table.shares.join(" / ")}\n      paper ${other?.total}px ${(other?.shares ?? []).join(" / ")}` +
              (layoutIssues.length ? `\n      ${layoutIssues.join("; ")}` : ""),
          );
        }
      });
    }
  }
  // Finished reports: the original print rules, not the ones above.
  const legacy = async (name: string, section: any, tagged: boolean, expected: number[] | null, data: Record<string, any> = {}) => {
    const chrome: SectionChrome = {
      mode: "readonly",
      density: "normal",
      legacyLayout: true,
      renderControl: createInteractiveControlRenderer({ formData: data, sections: [section], onFieldChange: () => {}, readOnly: true }),
      conditionValues: () => data,
      getSettingValue: () => undefined,
    };
    const markup = renderToStaticMarkup(<SectionBody section={section} chrome={chrome} />);
    const utilities = await postcss([tailwindcss({ content: [{ raw: markup, extension: "html" }] })]).process(
      "@tailwind base; @tailwind utilities;",
      { from: undefined },
    );
    await page.emulateMediaType("print");
    for (const windows of [true, false]) {
      await page.setContent(
        `<!doctype html><html class="${windows ? "is-windows" : ""}"><body style="margin:0"><div id="report-container"><div>header</div><div class="report-body"><div class="custom-form-container cf-legacy-layout"><div>toolbar</div><div>${markup}</div></div></div></div></body></html>`,
      );
      await page.addStyleTag({ content: utilities.css });
      await page.addStyleTag({ content: wrapperCss });
      // ReportWrapper tags these just before printing, as it always did.
      if (tagged) await page.evaluate(`document.querySelector("table").classList.add("vm-standard")`);
      const [table] = await page.evaluate(measure);
      const align = await page.evaluate(`[...document.querySelectorAll("tbody tr:first-child td")].map((c) => getComputedStyle(c).textAlign).join()`);
      compared += 1;
      const wrong = expected?.some((width, c) => Math.abs(width - table.shares[c]) > TOLERANCE);
      if (wrong) mismatches += 1;
      console.log(`${wrong ? "DIFF" : "same"}  ${windows ? "win" : "mac"}  old report: ${name}  print ${table.shares.join(" / ")}  align ${align}`);
    }
  };
  const inspectionSection = { ...inspection.defaultConfig, id: "s1", title: "V&M", order: 0, showInPrint: true };
  await legacy("Visual & Mechanical", inspectionSection, true, [10, 75, 15]);
  await legacy(
    "Table with a Result column",
    { rows: 1, id: "s1", title: "T", order: 0, showInPrint: true, columns: [text("a", "Item"), text("b", "Result")] },
    false,
    null,
    { s1_row0: { a: "A long reading that needs far more room", b: "PASS" } },
  );
} finally {
  await browser.close();
}
console.log(`\n${compared - mismatches}/${compared} tables match between paper view and print`);
process.exitCode = mismatches ? 1 : 0;
