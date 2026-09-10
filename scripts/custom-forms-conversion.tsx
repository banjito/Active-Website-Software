/**
 * Conversion pilot: 3-Low Voltage Cable MTS.
 *
 * Phase 2's exit gate asks whether a real report can be rebuilt faithfully.
 * This builds one through the same structures the builder writes, compiles it,
 * renders it, and reports what came out right and what did not.
 *
 * It is a diagnostic, not a passing test suite. A FAIL here is a finding about
 * the builder, not a broken build, so it does not fail the main harness.
 *
 * Run with:
 *   node --import ./scripts/ts-alias-loader.mjs scripts/custom-forms-conversion.tsx
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ComponentType,
  FieldType,
  type CustomFormStructure,
  type SectionConfig,
} from "../src/lib/types/customForms";
import { compileTemplate } from "../src/lib/customForms/compile";
import { SectionBody } from "../src/components/customForms/runtime/SectionBody";
import { createInteractiveControlRenderer } from "../src/components/customForms/runtime/InteractiveControl";
import type { SectionChrome } from "../src/lib/customForms/runtime";
import { sectionFromV1 } from "../src/lib/customForms/v2/fromV1";
import { sectionTable } from "../src/lib/customForms/v2/schema";
import { resolveGrid } from "../src/lib/customForms/v2/grid";
import { resolveTableRows } from "../src/lib/customForms/v2/rows";

let pass = 0;
let gaps: string[] = [];

function ok(what: string) {
  pass += 1;
  console.log(`  ok    ${what}`);
}

function gap(what: string, detail: string) {
  gaps.push(`${what} — ${detail}`);
  console.log(`  GAP   ${what}\n        ${detail}`);
}

function report(what: string, condition: boolean, detail = "") {
  if (condition) ok(what);
  else gap(what, detail);
}

function heading(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// The template, built the way the builder would write it
// ---------------------------------------------------------------------------

const PHASE_PAIRS = ["A-G", "B-G", "C-G", "N-G", "A-B", "B-C", "C-A", "A-N", "B-N", "C-N"];

const jobInfo: SectionConfig = {
  id: "job",
  componentType: ComponentType.JOB_INFO,
  title: "Job Information",
  order: 0,
  showInPrint: true,
  referenceCode: "JD",
  layout: "five-column",
  fields: [
    { id: "customer", label: "Customer", type: FieldType.TEXT },
    { id: "temperatureHumidity", label: "Temp", type: FieldType.TEMPERATURE_HUMIDITY, defaultTemperature: 76, defaultHumidity: 70 },
    { id: "jobNumber", label: "Job #", type: FieldType.TEXT },
    { id: "technicians", label: "Technicians", type: FieldType.TEXT },
    { id: "date", label: "Date", type: FieldType.DATE },
    { id: "identifier", label: "Identifier", type: FieldType.TEXT },
    { id: "siteAddress", label: "Address", type: FieldType.TEXT },
    { id: "substation", label: "Substation", type: FieldType.TEXT },
    { id: "eqptLocation", label: "Eqpt. Location", type: FieldType.TEXT },
    { id: "user", label: "User", type: FieldType.TEXT },
  ],
};

// Cable Data is six labelled entries in three columns.
const cableData: SectionConfig = {
  id: "cable",
  componentType: ComponentType.NAMEPLATE_DATA,
  title: "Cable Data",
  order: 1,
  showInPrint: true,
  referenceCode: "CD",
  layout: "three-column",
  fields: [
    { id: "testedFrom", label: "Tested From", type: FieldType.TEXT },
    { id: "manufacturer", label: "Manufacturer", type: FieldType.TEXT },
    { id: "conductorMaterial", label: "Conductor Material", type: FieldType.TEXT },
    { id: "insulationType", label: "Insulation Type", type: FieldType.TEXT },
    { id: "systemVoltage", label: "System Voltage", type: FieldType.TEXT },
    { id: "ratedVoltage", label: "Rated Voltage", type: FieldType.TEXT },
    { id: "length", label: "Length", type: FieldType.TEXT, colSpan: 3 },
  ],
};

const inspection: SectionConfig = {
  id: "vmi",
  componentType: ComponentType.VISUAL_INSPECTION,
  title: "Visual and Mechanical Inspection",
  order: 2,
  showInPrint: true,
  referenceCode: "VMI",
  checklistItems: [
    { id: "7.3.1.A.1", netaSection: "7.3.1.A.1", description: "Inspect exposed sections of cables and connectors for physical damage and evidence of degradation.", resultOptions: ["Select One", "Satisfactory", "Unsatisfactory"] },
    { id: "7.3.1.A.2.1", netaSection: "7.3.1.A.2.1", description: "Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.", resultOptions: ["Select One", "Satisfactory", "Unsatisfactory"] },
    { id: "7.3.1.A.3", netaSection: "7.3.1.A.3", description: "Inspect cable tray and cable supports.", resultOptions: ["Select One", "Satisfactory", "Unsatisfactory"] },
    { id: "7.3.1.A.4", netaSection: "7.3.1.A.4", description: "If cables are terminated through window-type current transformers, inspect to verify that neutral and ground conductors are correctly placed.", resultOptions: ["Select One", "Satisfactory", "Unsatisfactory"] },
    { id: "7.3.1.A.5", netaSection: "7.3.1.A.5*", description: "Compare cable data with drawings and cable schedule. *Optional", resultOptions: ["Select One", "Satisfactory", "Unsatisfactory"] },
  ],
};

// The hard one: sixteen columns under a two-row merged header.
const electricalColumns = [
  { id: "from", label: "From", width: "7%" },
  { id: "to", label: "To", width: "7%" },
  { id: "size", label: "Size", width: "5%" },
  { id: "config", label: "Config.", width: "5%" },
  { id: "spacer", label: "", width: "4%" },
  ...PHASE_PAIRS.map((pair) => ({ id: pair.toLowerCase(), label: pair, width: "5.5%" })),
  { id: "cont", label: "Cont.", width: "5.5%" },
  { id: "results", label: "Results", width: "7%" },
];

const electrical: SectionConfig = {
  id: "et",
  componentType: ComponentType.CUSTOM_TABLE,
  title: "Electrical Tests",
  order: 3,
  showInPrint: true,
  referenceCode: "ET",
  rows: 12,
  allowAddRows: true,
  allowRemoveRows: true,
  minRows: 1,
  maxRows: 30,
  aboveTableFields: [
    { id: "cableSets", label: "Number of Cable Sets", type: FieldType.NUMBER, defaultValue: 12 },
    { id: "testVoltage", label: "Test Voltage", type: FieldType.SELECT, defaultValue: "1000V", options: [{ label: "1000V", value: "1000V" }, { label: "2500V", value: "2500V" }] },
  ],
  columns: electricalColumns.map((column) => ({
    id: column.id,
    label: column.label,
    width: column.width,
    field: { id: column.id, label: column.label, type: FieldType.TEXT },
  })),
  v2: {
    header: [
      {
        id: "h1",
        cells: [
          { id: "h1-circuit", columnId: "from", label: "Circuit Designation", colSpan: 2, align: "center" },
          { id: "h1-size", columnId: "size", label: "Size", colSpan: 2, align: "center" },
          { id: "h1-spacer", columnId: "spacer", label: "", rowSpan: 2 },
          { id: "h1-ir", columnId: "a-g", label: "1 Min. Insulation Resistance in MΩ", colSpan: 10, align: "center" },
          { id: "h1-cont", columnId: "cont", label: "Cont.", rowSpan: 2, align: "center" },
          { id: "h1-results", columnId: "results", label: "Results", rowSpan: 2, align: "center" },
        ],
      },
      {
        id: "h2",
        cells: [
          { id: "h2-from", columnId: "from", label: "From", align: "center" },
          { id: "h2-to", columnId: "to", label: "To", align: "center" },
          { id: "h2-config", columnId: "size", label: "Config.", colSpan: 2, align: "center" },
          ...PHASE_PAIRS.map((pair) => ({
            id: `h2-${pair}`,
            columnId: pair.toLowerCase(),
            label: pair,
            align: "center" as const,
          })),
        ],
      },
    ],
    body: [
      {
        id: "et-records",
        kind: "records",
        policy: {
          initial: 12, min: 1, max: 30,
          allowAdd: true, allowRemove: true, allowReorder: false, allowCopy: false,
          rowsPerRecord: 2,
          spanningColumns: ["from", "to", "size", "config", "cont", "results"],
          subRowLabels: ["RDG", "Corrected"],
        },
      },
      {
        id: "et-caption",
        kind: "note",
        text: "Test Voltage: 1000V | 1 Min. Insulation Resistance in MΩ",
        align: "center",
      },
    ],
  },
};

const testEquipment: SectionConfig = {
  id: "te",
  componentType: ComponentType.TEST_EQUIPMENT,
  title: "Test Equipment Used",
  order: 4,
  showInPrint: true,
  referenceCode: "TE",
  rows: 1,
  columns: [
    { id: "equipment", label: "Megohmmeter", field: { id: "equipment", label: "Megohmmeter", type: FieldType.TEXT } },
    { id: "serialNumber", label: "Serial Number", field: { id: "serialNumber", label: "Serial Number", type: FieldType.TEXT } },
    { id: "ampId", label: "AMP ID", field: { id: "ampId", label: "AMP ID", type: FieldType.TEXT } },
    { id: "calibrationDate", label: "Calibration Date", field: { id: "calibrationDate", label: "Calibration Date", type: FieldType.DATE } },
  ],
};

const comments: SectionConfig = {
  id: "cm",
  componentType: ComponentType.COMMENTS,
  title: "Comments",
  order: 5,
  showInPrint: true,
  referenceCode: "CM",
  field: { id: "comments", label: "Comments", type: FieldType.TEXTAREA },
};

const structure: CustomFormStructure = {
  settings: { includePassFail: true, includeJobInfo: true, includePrintHeader: true },
  sections: [jobInfo, cableData, inspection, electrical, testEquipment, comments],
};

// ---------------------------------------------------------------------------

const chrome = (section: SectionConfig): SectionChrome => ({
  mode: "fill",
  density: "normal",
  renderControl: createInteractiveControlRenderer({
    formData: {},
    sections: structure.sections,
    onFieldChange: () => {},
  }),
  conditionValues: () => ({}),
});

const render = (section: SectionConfig) =>
  renderToStaticMarkup(
    React.createElement(SectionBody, { section, chrome: chrome(section) }),
  );

const countTag = (html: string, tag: string) =>
  (html.match(new RegExp(`<${tag}[\\s>/]`, "g")) ?? []).length;

console.log("Conversion pilot 1: 3-Low Voltage Cable MTS\n" + "=".repeat(46));

// ---------------------------------------------------------------------------

heading("The template compiles");

const compiled = compileTemplate({ name: "3-Low Voltage Cable MTS", structure });
report(
  "the whole report compiles and can be published",
  compiled.ok,
  compiled.report.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
);
if (compiled.report.warnings.length) {
  console.log(
    `        (${compiled.report.warnings.length} warnings: ${compiled.report.warnings
      .slice(0, 2)
      .map((w) => w.message)
      .join("; ")})`,
  );
}

// ---------------------------------------------------------------------------

heading("Job Information");

{
  const html = render(jobInfo);
  report("renders", html.length > 0);
  report("shows every label", ["Customer", "Job #", "Technicians", "Identifier", "Substation", "User"].every((label) => html.includes(label)));
  report("lays out in five columns", countTag(html, "col") >= 5, `${countTag(html, "col")} columns`);
  report("includes the temperature and humidity widget", html.includes("TCF"));
}

// ---------------------------------------------------------------------------

heading("Cable Data");

{
  const html = render(cableData);
  report("renders", html.length > 0);
  report(
    "shows every label",
    ["Tested From", "Manufacturer", "Conductor Material", "Insulation Type", "System Voltage", "Rated Voltage", "Length"].every((label) => html.includes(label)),
    "labels missing from the rendered markup",
  );
  report("lays out in three columns", countTag(html, "col") === 3, `${countTag(html, "col")} columns`);
  report("Length spans the full width", /colspan="3"/i.test(html), "the wide field did not span");
}

// ---------------------------------------------------------------------------

heading("Visual and Mechanical Inspection");

{
  const html = render(inspection);
  report("renders every NETA row", countTag(html, "tr") === 6, `${countTag(html, "tr")} rows including the header`);
  report("shows the NETA section numbers", html.includes("7.3.1.A.1") && html.includes("7.3.1.A.5"));
  report("offers a result per row", countTag(html, "select") === 5, `${countTag(html, "select")} selects`);
}

// ---------------------------------------------------------------------------

heading("Electrical Tests: the merged header");

{
  const table = sectionTable(sectionFromV1(electrical))!;
  const grid = resolveGrid(table.header, table.columns, { regionLabel: "header" });
  report(
    "the two-row merged header is valid",
    grid.problems.length === 0,
    grid.problems.map((p) => p.message).join("; "),
  );

  const html = render(electrical);
  report("renders a header", countTag(html.split("<tbody>")[0] ?? "", "th") > 0, "no header cells at all");
  report("has two header rows", countTag(html.split("<tbody>")[0] ?? "", "tr") === 2, `${countTag(html.split("<tbody>")[0] ?? "", "tr")} header rows`);
  report('"Circuit Designation" spans two columns', /colspan="2"/i.test(html));
  report('"1 Min. Insulation Resistance in MΩ" spans ten', /colspan="10"/i.test(html));
  report('"Cont." and "Results" span two rows', /rowspan="2"/i.test(html));
  report("every phase pair is a column", PHASE_PAIRS.every((pair) => html.includes(`>${pair}<`)), "some phase headers missing");
  report(
    "the above-table fields render",
    html.includes("Number of Cable Sets") && html.includes("Test Voltage"),
    "the fields above the table are missing",
  );
  report("the caption row under the table renders", html.includes("1 Min. Insulation Resistance in M"));
  report(
    "twelve circuits are generated",
    // Two rows per circuit: the reading and its corrected value.
    resolveTableRows(table, "et").filter((r) => r.dataIndex >= 0).length === 24,
    `${resolveTableRows(table, "et").filter((r) => r.dataIndex >= 0).length} data rows`,
  );
}

// ---------------------------------------------------------------------------

heading("Electrical Tests: paired reading rows");

{
  const table = sectionTable(sectionFromV1(electrical))!;
  const rows = resolveTableRows(table, "et").filter((r) => r.dataIndex >= 0);

  report(
    "each circuit is two rows",
    rows.length === 24,
    `${rows.length} rows for 12 circuits`,
  );
  report(
    "the sub-rows are labelled RDG and Corrected",
    rows[0].label === "RDG" && rows[1].label === "Corrected",
    `${rows[0].label} / ${rows[1].label}`,
  );
  report(
    "every sub-row keeps its own data slot",
    rows.map((r) => r.dataIndex).join(",") ===
      Array.from({ length: 24 }, (_, i) => i).join(","),
  );

  const html = render(electrical);
  const body = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
  report(
    "the identifying columns span both rows of a circuit",
    /rowspan="2"/i.test(body),
    "no row spans in the body",
  );
  report(
    "the second row of a circuit omits the spanned columns",
    (() => {
      const bodyRows = body.split("<tr").slice(1);
      const first = (bodyRows[0].match(/<td/g) ?? []).length;
      const second = (bodyRows[1].match(/<td/g) ?? []).length;
      return second === first - 6;
    })(),
    "the second row should be six cells narrower",
  );
  report(
    "column widths carry through to the rendered table",
    table.columns.every((c) => c.width !== undefined) && html.includes("7%"),
    "widths missing",
  );
}

// ---------------------------------------------------------------------------

heading("Test Equipment and Comments");

{
  const equipmentHtml = render(testEquipment);
  report("test equipment renders its four columns", countTag(equipmentHtml.split("<tbody>")[0] ?? "", "th") === 4);
  const commentsHtml = render(comments);
  report("comments renders a textarea", countTag(commentsHtml, "textarea") === 1);
}

// ---------------------------------------------------------------------------


// ===========================================================================
// Pilot 2: 2.1.1 Small Low Voltage Dry Type Transformer, ATS 25
//
// Chosen because it exercises what the cable report did not: radio groups for
// exclusive choices, a merged nameplate block, an insulation table whose first
// column is a fixed set of winding names rather than free entry, and readings
// corrected by the temperature factor.
// ===========================================================================

console.log("\n\nConversion pilot 2: Dry Type Transformer ATS 25\n" + "=".repeat(46));

const CONNECTIONS = ["Delta", "Wye", "Single Phase"];
const MATERIALS = ["Aluminum", "Copper"];

const dtJobInfo: SectionConfig = {
  id: "dt-job",
  componentType: ComponentType.JOB_INFO,
  title: "Job Information",
  order: 0,
  showInPrint: true,
  referenceCode: "JD",
  layout: "five-column",
  fields: [
    { id: "customer", label: "Customer", type: FieldType.TEXT },
    { id: "temperatureHumidity", label: "Temp", type: FieldType.TEMPERATURE_HUMIDITY, defaultTemperature: 68, defaultHumidity: 50 },
    { id: "jobNumber", label: "Job #", type: FieldType.TEXT },
    { id: "technicians", label: "Technicians", type: FieldType.TEXT },
    { id: "date", label: "Date", type: FieldType.DATE },
    { id: "identifier", label: "Identifier", type: FieldType.TEXT },
    { id: "siteAddress", label: "Address", type: FieldType.TEXT },
    { id: "substation", label: "Substation", type: FieldType.TEXT },
    { id: "eqptLocation", label: "Eqpt. Location", type: FieldType.TEXT },
    { id: "user", label: "User", type: FieldType.TEXT },
  ],
};

// The nameplate has a merged block: VOLTAGES / WINDING CONNECTIONS / WINDING
// MATERIAL over Primary and Secondary rows, with radio choices.
const dtNameplate: SectionConfig = {
  id: "dt-np",
  componentType: ComponentType.NAMEPLATE_DATA,
  title: "Nameplate Data",
  order: 1,
  showInPrint: true,
  referenceCode: "ND",
  layout: "three-column",
  fields: [
    { id: "manufacturer", label: "Manufacturer", type: FieldType.TEXT },
    { id: "catalogNumber", label: "Catalog Number", type: FieldType.TEXT },
    { id: "serialNumber", label: "Serial Number", type: FieldType.TEXT },
    { id: "kva", label: "KVA", type: FieldType.TEXT },
    { id: "tempRise", label: "Temp. Rise (°C)", type: FieldType.TEXT },
    { id: "impedance", label: "Impedance (%)", type: FieldType.TEXT },
    { id: "primaryConnection", label: "Primary Connection", type: FieldType.RADIO, options: CONNECTIONS.map((c) => ({ label: c, value: c })) },
    { id: "primaryMaterial", label: "Primary Winding Material", type: FieldType.RADIO, options: MATERIALS.map((m) => ({ label: m, value: m })) },
    { id: "secondaryConnection", label: "Secondary Connection", type: FieldType.RADIO, options: CONNECTIONS.map((c) => ({ label: c, value: c })) },
    { id: "secondaryMaterial", label: "Secondary Winding Material", type: FieldType.RADIO, options: MATERIALS.map((m) => ({ label: m, value: m })) },
  ],
};

// Insulation resistance: a two-row merged header, and a fixed set of winding
// names down the first column rather than rows the technician adds.
const WINDINGS = ["Primary to Ground", "Secondary to Ground", "Primary to Secondary"];

const dtInsulationColumns = [
  { id: "winding", label: "Winding Under Test", width: "18%" },
  { id: "m05", label: "0.5 Min.", width: "9%" },
  { id: "m1", label: "1 Min.", width: "9%" },
  { id: "c05", label: "0.5 Min.", width: "9%" },
  { id: "c1", label: "1 Min.", width: "9%" },
  { id: "units", label: "Units", width: "9%" },
  { id: "tableValue", label: "Value", width: "9%" },
  { id: "tableUnits", label: "Units", width: "9%" },
  { id: "results", label: "Results", width: "10%" },
];

const dtInsulation: SectionConfig = {
  id: "dt-ir",
  componentType: ComponentType.INSULATION_TEST,
  title: "Electrical - Insulation Resistance Tests",
  order: 2,
  showInPrint: true,
  referenceCode: "IR",
  rows: 3,
  allowAddRows: false,
  allowRemoveRows: false,
  columns: dtInsulationColumns.map((c) => ({
    id: c.id,
    label: c.label,
    width: c.width,
    field: { id: c.id, label: c.label, type: FieldType.TEXT },
  })),
  v2: {
    header: [
      {
        id: "ir-h1",
        cells: [
          { id: "ir-h1-w", columnId: "winding", label: "Winding Under Test", rowSpan: 2, align: "center" },
          { id: "ir-h1-m", columnId: "m05", label: "Measured Values", colSpan: 2, align: "center" },
          { id: "ir-h1-c", columnId: "c05", label: "Temp Corrected", colSpan: 2, align: "center" },
          { id: "ir-h1-u", columnId: "units", label: "Units", rowSpan: 2, align: "center" },
          { id: "ir-h1-t", columnId: "tableValue", label: "Table 100.5", colSpan: 2, align: "center" },
          { id: "ir-h1-r", columnId: "results", label: "Results", rowSpan: 2, align: "center" },
        ],
      },
      {
        id: "ir-h2",
        cells: [
          { id: "ir-h2-a", columnId: "m05", label: "0.5 Min.", align: "center" },
          { id: "ir-h2-b", columnId: "m1", label: "1 Min.", align: "center" },
          { id: "ir-h2-c", columnId: "c05", label: "0.5 Min.", align: "center" },
          { id: "ir-h2-d", columnId: "c1", label: "1 Min.", align: "center" },
          { id: "ir-h2-e", columnId: "tableValue", label: "Value", align: "center" },
          { id: "ir-h2-f", columnId: "tableUnits", label: "Units", align: "center" },
        ],
      },
    ],
    body: WINDINGS.map((name, index) => ({
      id: `ir-row-${index}`,
      kind: "fixed" as const,
      cells: dtInsulationColumns.map((column) => {
        if (column.id === "winding") {
          return { id: `ir-${index}-w`, columnId: "winding", kind: "static" as const, text: name, emphasis: "bold" as const };
        }
        if (column.id === "c05" || column.id === "c1") {
          const source = column.id === "c05" ? "C2" : "C3";
          return {
            id: `ir-${index}-${column.id}`,
            columnId: column.id,
            kind: "calculated" as const,
            formula: `{IR.${source}.R${index + 1}}*{JD.tcf}`,
            align: "center" as const,
          };
        }
        return { id: `ir-${index}-${column.id}`, columnId: column.id, kind: "editable" as const, align: "center" as const };
      }),
    })),
  },
};

const dtStructure: CustomFormStructure = {
  settings: { includePassFail: true, includeJobInfo: true, includePrintHeader: true },
  sections: [dtJobInfo, dtNameplate, dtInsulation],
};

const dtChrome = (): SectionChrome => ({
  mode: "fill",
  density: "normal",
  renderControl: createInteractiveControlRenderer({
    formData: {},
    sections: dtStructure.sections,
    onFieldChange: () => {},
  }),
  conditionValues: () => ({}),
});

const dtRender = (sectionConfig: SectionConfig) =>
  renderToStaticMarkup(
    React.createElement(SectionBody, { section: sectionConfig, chrome: dtChrome() }),
  );

heading("The template compiles");
{
  const result = compileTemplate({ name: "Dry Type Transformer ATS 25", structure: dtStructure });
  report(
    "the report compiles and can be published",
    result.ok,
    result.report.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
  );
}

heading("Nameplate radio groups");
{
  const html = dtRender(dtNameplate);
  report("renders radio inputs, not dropdowns", /type="radio"/.test(html), "no radio inputs in the markup");
  report(
    "every connection option is offered",
    CONNECTIONS.every((c) => html.includes(c)),
  );
  report(
    "the two connection groups are independent",
    new Set(
      (html.match(/name="[^"]*"/g) ?? []).filter((n) => n.includes("Connection")),
    ).size === 2,
    "the primary and secondary groups share a name, so choosing one would clear the other",
  );
  report("winding material is a radio group too", MATERIALS.every((m) => html.includes(m)));
}

heading("Insulation resistance table");
{
  const table = sectionTable(sectionFromV1(dtInsulation))!;
  const grid = resolveGrid(table.header, table.columns, { regionLabel: "header" });
  report("the two-row merged header is valid", grid.problems.length === 0,
    grid.problems.map((p) => p.message).join("; "));

  const html = dtRender(dtInsulation);
  const head = html.split("<tbody>")[0] ?? "";
  report("renders two header rows", countTag(head, "tr") === 2, `${countTag(head, "tr")} rows`);
  report('"Measured Values" spans two columns', /colspan="2"/i.test(head));
  report('"Winding Under Test" spans both header rows', /rowspan="2"/i.test(head));
  report(
    "the winding names are fixed text, not entry fields",
    WINDINGS.every((name) => html.includes(name)),
    "winding names missing",
  );
  report(
    "the corrected columns are calculated, not typed",
    countTag(html.split("<tbody>")[1] ?? "", "input") < 9 * 3,
    "every cell is an input; the corrected columns should be read-only",
  );
  report(
    "three winding rows, none addable",
    resolveTableRows(table, "dt-ir").filter((r) => r.dataIndex >= 0).length === 3,
  );
}

console.log("\n" + "=".repeat(46));
console.log(`${pass} checks matched the real report.`);
if (gaps.length === 0) {
  console.log("No gaps found.");
} else {
  console.log(`\n${gaps.length} gap${gaps.length === 1 ? "" : "s"}:\n`);
  gaps.forEach((entry, index) => console.log(`${index + 1}. ${entry}\n`));
}
