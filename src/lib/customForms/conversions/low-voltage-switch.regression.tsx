/**
 * Run from the project root:
 * node --import ./scripts/ts-alias-loader.mjs src/lib/customForms/conversions/low-voltage-switch.regression.tsx
 *
 * No database or original report component is loaded. Node-only checks run only
 * on direct invocation; the fixture and real-runtime renderer can be imported by
 * the parent's browser harness. HTML checks are not a browser/PDF certification.
 */
/* eslint-disable react-refresh/only-export-components -- This regression module also exports browser fixtures. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLowVoltageSwitchDraft, LOW_VOLTAGE_SWITCH_GAPS } from "@/lib/customForms/conversions/low-voltage-switch";
import { compileTemplate } from "@/lib/customForms/compile";
import { compileFormExpressions, formSlotId } from "@/lib/customForms/expressions/form-program";
import { adaptStoredData, buildStoredData, mergeRuntimeIntoState, parseStoredData, projectStateToRuntime } from "@/lib/customForms/instanceState";
import { applyFieldChange } from "@/lib/customForms/runtime/fieldChange";
import { rowStateKey } from "@/lib/customForms/runtime/layout";
import { sectionFromV1 } from "@/lib/customForms/v2/fromV1";
import { sectionTable } from "@/lib/customForms/v2/schema";
import { resolveGrid } from "@/lib/customForms/v2/grid";
import { recordCells, resolveTableRows } from "@/lib/customForms/v2/rows";
import { DocumentBody } from "@/components/customForms/runtime/SectionFrame";
import { createInteractiveControlRenderer } from "@/components/customForms/runtime/InteractiveControl";
import { createPlaceholderControlRenderer } from "@/components/customForms/runtime/PlaceholderControl";
import type { CustomFormTemplate, SectionConfig } from "@/lib/types/customForms";
import type { RenderMode, SectionChrome } from "@/lib/customForms/runtime/contract";

const READING_IDS = [
  "poleToPoleP1P2", "poleToPoleP2P3", "poleToPoleP3P1",
  "poleToFrameP1", "poleToFrameP2", "poleToFrameP3",
  "lineToLoadP1", "lineToLoadP2", "lineToLoadP3",
];

export function createLowVoltageSwitchRegressionData(): Record<string, Record<string, unknown>> {
  return {
    "lv-switch-job": {
      customer: "Pilot Customer", jobNumber: "JOB-6001", address: "123 Test Lane", identifier: "LVS-01",
      technicians: "Pilot Technician", substation: "North Substation", date: "2026-09-10", eqptLocation: "Electrical Room", user: "Pilot User",
    },
    "lv-switch-environment": { fahrenheit: 77, humidity: 45 },
    "lv-switch-enclosure": {
      manufacturer: "Enclosure Maker", catalogNo: "ENC-CAT-1", serialNumber: "ENC-SN-1", series: "Series A", type: "Fused disconnect",
      systemVoltage: "480 VAC", ratedVoltage: "600 VAC", ratedCurrent: "400 A", aicRating: "200 kA", phaseConfiguration: "3-phase, 3-wire",
    },
    "lv-switch-switch_row0": {
      position: "SW-01", manufacturer: "Switch Maker", catalogNo: "SW-CAT-1", serialNo: "SW-SN-1", type: "Knife switch", ratedAmperage: "400 A", ratedVoltage: "600 V",
    },
    "lv-switch-fuse_row0": {
      position: "FU-01", manufacturer: "Fuse Maker", catalogNo: "FU-CAT-1", class: "J", amperage: "400 A", aic: "200 kA", voltage: "600 V",
    },
    "lv-switch-ir": { testVoltage: "1000V", units: "GΩ" },
    "lv-switch-ir_row0": Object.fromEntries(READING_IDS.map((id, index) => [id, [100, 0, "", 40, 50, 60, 70, 80, 90][index]])),
    "lv-switch-contact": { units: "mΩ" },
    "lv-switch-contact_row0": Object.fromEntries(READING_IDS.map((id, index) => [id, (index + 1) * 10])),
    ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `lv-switch-inspection_row${index}`, { result: ["Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable", ""][index % 6] },
    ])),
    "lv-switch-equipment_row0": { model: "Megohmmeter Model", serialNumber: "MEG-SN-1", ampId: "AMP-100", calDate: "09/01/2026" },
    "lv-switch-equipment_row1": { model: "Low Resistance Model", serialNumber: "LR-SN-2", ampId: "AMP-200", calDate: "08/15/2026" },
    "lv-switch-comments": { enclosure: "Enclosure checked.\nFollow up on interlock indication." },
    "lv-switch-result": { status: "LIMITED SERVICE" },
  };
}

export function createLowVoltageSwitchRegressionChrome(
  template: CustomFormTemplate,
  data: Record<string, Record<string, unknown>>,
  mode: RenderMode,
  onFieldChange: (stateKey: string, fieldId: string, value: any) => void = () => {},
): SectionChrome {
  const readOnly = mode === "readonly" || mode === "print";
  return {
    mode, density: mode === "edit" ? "compact" : "normal",
    renderControl: mode === "edit" || mode === "preview"
      ? createPlaceholderControlRenderer({ density: mode === "edit" ? "compact" : "normal" })
      : createInteractiveControlRenderer({ formData: data, sections: template.structure.sections, readOnly, onFieldChange }),
    conditionValues: () => data,
    getSettingValue: (section, id) => data[section.id]?.[id],
    setSettingValue: readOnly ? undefined : (section, id, value) => onFieldChange(section.id, id, value),
  };
}

/** Uses the production document renderer and its expression wrapper, not a replacement evaluator. */
export function LowVoltageSwitchRegressionRenderer({
  template = createLowVoltageSwitchDraft(),
  data = createLowVoltageSwitchRegressionData(),
  mode = "fill",
  onFieldChange,
}: {
  template?: CustomFormTemplate;
  data?: Record<string, Record<string, unknown>>;
  mode?: RenderMode;
  onFieldChange?: (stateKey: string, fieldId: string, value: any) => void;
}) {
  return <DocumentBody template={template} chrome={createLowVoltageSwitchRegressionChrome(template, data, mode, onFieldChange)} />;
}

export function renderLowVoltageSwitchRegression(
  mode: RenderMode,
  data = createLowVoltageSwitchRegressionData(),
  template = createLowVoltageSwitchDraft(),
): string {
  return renderToStaticMarkup(<LowVoltageSwitchRegressionRenderer template={template} data={data} mode={mode} />);
}

export async function runLowVoltageSwitchRegression(): Promise<void> {
  const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
  const { readFile } = await import("node:fs/promises");
  const draft = createLowVoltageSwitchDraft();
  const pristine = JSON.stringify(draft);
  const getSection = (id: string, template = draft): SectionConfig => {
    const result = template.structure.sections.find((section) => section.id === `lv-switch-${id}`);
    assert.ok(result, `Missing section: ${id}`);
    return result;
  };
  const ir = getSection("ir");
  const corrected = getSection("corrected");
  const environment = getSection("environment");
  const source = await readFile(new URL("../../../components/reports/LowVoltageSwitchReport.tsx", import.meta.url), "utf8");

  assert.deepEqual(createLowVoltageSwitchDraft(), draft, "Factory must be deterministic");
  assert.equal(draft.isPublished, false);
  assert.equal(Object.prototype.hasOwnProperty.call(draft, "id"), false);
  for (const key of ["createdAt", "updatedAt", "createdBy", "activeVersionId"]) assert.equal(Object.prototype.hasOwnProperty.call(draft, key), false, key);
  // The review notes live in their own section, so the description stays empty
  // rather than putting a wall of text at the top of every preview.
  assert.equal(draft.description, undefined, "the template carries no description");
  assert.equal(
    getSection("review", draft).showInPrint,
    false,
    "review notes are for the certifier and must never print on a customer report",
  );
  assert.equal(draft.netaSection, "ATS 7.6.1.2");
  assert.match(source, /NETA - ATS 7\.6\.1\.2/);
  assert.equal(draft.structure.settings.includePassFail, false, "Do not silently add host N/A to the source's three choices");
  const otherDraft = createLowVoltageSwitchDraft();
  getSection("ir", otherDraft).aboveTableFields![0].options![0].label = "Changed";
  otherDraft.structure.expressions!.lookups![0].entries[0].value = 999;
  otherDraft.structure.expressions!.curves![0].points[0].y = 999;
  getSection("switch", otherDraft).v2!.header![0].cells[0].label = "Changed";
  assert.equal(JSON.stringify(draft), pristine, "Factory calls must not share editable arrays");

  const compiled = compileTemplate(draft);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.report.issues));
  assert.deepEqual(compiled.report.errors, []);
  assert.deepEqual(compiled.report.warnings, []);
  assert.ok(compiled.structure);
  assert.equal(JSON.stringify(draft), pristine, "Compilation must not mutate the draft");
  const reopenedDraft = JSON.parse(JSON.stringify({ ...draft, structure: compiled.structure })) as CustomFormTemplate;
  assert.equal(compileTemplate(reopenedDraft).ok, true, "JSON-saved draft must compile on reopen");
  assert.deepEqual(reopenedDraft.structure.expressions, draft.structure.expressions);
  for (const section of draft.structure.sections) {
    assert.deepEqual(reopenedDraft.structure.sections.find((entry) => entry.id === section.id)?.v2, section.v2, `${section.id}: overlays survive draft save/reopen`);
  }
  console.log("PASS deterministic unsaved metadata, isolated factory data, compile and draft JSON reopen");

  assert.deepEqual(draft.structure.sections.map((s) => s.title), [
    "Job Information", "Environmental Data", "Enclosure Data", "Switch Data", "Fuse Data", "Measured Insulation Resistance Values",
    "Temperature Corrected Insulation Resistance Values", "Contact Resistance", "Visual & Mechanical Inspection", "Test Equipment Used",
    "Comments", "Report Result", "Review notes: pending engineering, output and workflow review",
  ]);
  const fieldIds = (id: string) => getSection(id).fields!.map((field) => field.id);
  assert.deepEqual(fieldIds("job"), ["customer", "jobNumber", "address", "identifier", "technicians", "substation", "date", "eqptLocation", "user"]);
  assert.deepEqual(fieldIds("enclosure"), ["manufacturer", "catalogNo", "serialNumber", "series", "type", "systemVoltage", "ratedVoltage", "ratedCurrent", "aicRating", "phaseConfiguration"]);
  assert.equal(getSection("enclosure").fields!.find((field) => field.id === "aicRating")!.label, "SCCR");
  assert.deepEqual(getSection("switch").columns!.map((col) => col.field.id), ["position", "manufacturer", "catalogNo", "serialNo", "type", "ratedAmperage", "ratedVoltage"]);
  assert.deepEqual(getSection("fuse").columns!.map((col) => col.field.id), ["position", "manufacturer", "catalogNo", "class", "amperage", "aic", "voltage"]);
  for (const id of ["ir", "corrected", "contact"]) {
    assert.deepEqual(getSection(id).columns!.map((col) => col.field.id), READING_IDS);
    assert.deepEqual(getSection(id).columns!.map((col) => col.label), ["P1-P2", "P2-P3", "P3-P1", "P1", "P2", "P3", "P1", "P2", "P3"]);
  }
  for (const id of ["enclosure", "switch", "fuse"]) {
    const section = getSection(id);
    for (const field of section.fields ?? section.columns!.map((col) => col.field)) assert.equal(field.type, "text", `${id}/${field.id}: source permits free text`);
  }
  const choiceValues = (field: { options?: { value: string }[] }) => field.options!.map((option) => option.value);
  assert.deepEqual(choiceValues(ir.aboveTableFields![0]), ["250V", "500V", "1000V", "2500V", "5000V"]);
  assert.deepEqual(choiceValues(ir.aboveTableFields![1]), ["kΩ", "MΩ", "GΩ"]);
  assert.deepEqual(choiceValues(getSection("contact").aboveTableFields![0]), ["μΩ", "mΩ", "Ω"]);
  assert.deepEqual(ir.aboveTableFields!.map((field) => field.defaultValue), ["1000V", "MΩ"]);
  assert.equal(getSection("contact").aboveTableFields![0].defaultValue, "μΩ");
  assert.deepEqual(environment.fields!.map((field) => field.unit ?? ""), ["°F", "°C", "", "%"]);
  assert.equal(environment.fields![0].defaultValue, 68);
  assert.equal(environment.fields![3].defaultValue, 0);
  assert.deepEqual(choiceValues(getSection("result").fields![0]), ["PASS", "FAIL", "LIMITED SERVICE"]);
  assert.equal(getSection("result").fields![0].defaultValue, "PASS");
  assert.equal(getSection("job").fields!.find((field) => field.id === "date")!.defaultValue, undefined);
  assert.equal(getSection("comments").field!.id, "enclosure");
  assert.deepEqual(getSection("equipment").columns!.map((col) => col.field.id), ["instrument", "model", "serialNumber", "ampId", "calDate"]);
  assert.deepEqual(getSection("equipment").staticCells, { "row0_col-instrument": "Megohmmeter", "row1_col-instrument": "Low Resistance" });

  const sourceDescriptions = [...source.slice(source.indexOf("const descriptions:"), source.indexOf("return descriptions[")).matchAll(/"(7\.5\.1\.1\.A\.[\d.]+)":\s*"([^"]+)"/g)];
  assert.equal(sourceDescriptions.length, 12, "Source inspection extraction must not silently miss criteria");
  const inspection = getSection("inspection");
  assert.equal(inspection.rows, 12);
  sourceDescriptions.forEach(([, neta, description], index) => {
    assert.equal(inspection.staticCells![`row${index}_col-netaSection`], neta);
    assert.equal(inspection.staticCells![`row${index}_col-description`], description);
  });
  assert.equal(inspection.staticCells!["row7_col-netaSection"], "7.5.1.1.A.8.1");
  assert.deepEqual(inspection.columns![2].field.options, [
    { value: "", label: "Select One" },
    ...["Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"].map((value) => ({ value, label: value })),
  ]);
  assert.equal(getSection("contact").componentType, "custom-table", "Stock contact-resistance would fabricate a deviation block");
  assert.equal(draft.structure.expressions!.rulePacks, undefined, "No invented acceptance rules");
  console.log("PASS all source data sections, exact choices/defaults/units and all 12 static inspection criteria");

  const tempTable = source.match(/const TEMP_CONVERSION_DATA[^=]*=\s*\[([\s\S]*?)\n\];/);
  const tcfTable = source.match(/const TCF_DATA[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(tempTable);
  assert.ok(tcfTable);
  const sourceTemps = [...tempTable[1].matchAll(/fahrenheit:\s*(-?[\d.]+), celsius:\s*(-?[\d.]+)/g)].map(([, f, c]) => ({ x: Number(f), y: Number(c) }));
  const sourceFactors = [...tcfTable[1].matchAll(/celsius:\s*(-?[\d.]+), multiplier:\s*([\d.]+)/g)].map(([, c, value]) => ({ key: Number(c), value: Number(value) }));
  assert.equal(sourceTemps.length, 135);
  assert.equal(sourceFactors.length, 135);
  assert.deepEqual(draft.structure.expressions!.curves![0].points, sourceTemps, "Every original Fahrenheit/Celsius lookup point");
  assert.deepEqual(draft.structure.expressions!.lookups![0].entries, sourceFactors, "Every original TCF, including irregular values");
  assert.deepEqual(draft.structure.expressions!.curves![1].points, sourceFactors.map(({ key, value }) => ({ x: key, y: value })));

  const programResult = compileFormExpressions(compiled.structure);
  assert.equal(programResult.ok, true, JSON.stringify(programResult));
  assert.ok(programResult.ok && programResult.value);
  const program = programResult.value;
  assert.equal(program.calculationIds.size, 13, "Celsius + TCF + displayed TCF + units + nine corrected readings");
  const evaluate = (data: Record<string, Record<string, unknown>>) => {
    const evaluated = program.evaluate(data);
    assert.deepEqual(evaluated.issues, [], JSON.stringify(data));
    return (section: SectionConfig, id: string, rowIndex?: number) => {
      const result = evaluated.results.get(formSlotId(section, id, rowIndex === undefined ? undefined : { rowIndex, colId: `col-${id}` })!);
      assert.ok(result?.ok, `No successful result for ${section.id}/${id}`);
      return result.value;
    };
  };
  // Independent oracle using the actual source data and its algorithm, not the
  // new draft resources or shared TCF helper (which interpolates differently).
  const sourceCelsius = (fahrenheit: number): number => {
    const exact = sourceTemps.find((point) => point.x === fahrenheit);
    if (exact) return exact.y;
    const lower = sourceTemps.filter((point) => point.x <= fahrenheit).at(-1);
    const upper = sourceTemps.find((point) => point.x >= fahrenheit);
    if (!lower || !upper) return (fahrenheit - 32) * (5 / 9);
    return lower.y + ((fahrenheit - lower.x) / (upper.x - lower.x)) * (upper.y - lower.y);
  };
  const sourceTCF = (fahrenheit: number): number => {
    const celsius = sourceCelsius(fahrenheit);
    const exact = sourceFactors.find((point) => point.key === Math.round(celsius));
    if (exact) return exact.value;
    const lower = sourceFactors.filter((point) => point.key <= celsius).at(-1);
    const upper = sourceFactors.find((point) => point.key >= celsius);
    if (!lower || !upper) return lower?.value ?? upper?.value ?? 1;
    return lower.value + ((celsius - lower.key) / (upper.key - lower.key)) * (upper.value - lower.value);
  };
  for (const [fahrenheit, expectedC, expectedTCF] of [
    [68, 20, 1], [77, 25, 1.25], [86, 30, 1.58], [93.2, 34, 1.872],
    [112.28, 44.6, 3.15], [203, 95, 31.6], [-40, -40, 0.054], [248, 120, 63.2],
  ]) {
    const value = evaluate({ "lv-switch-environment": { fahrenheit }, "lv-switch-ir_row0": { poleToPoleP1P2: 100 } });
    assert.ok(Math.abs(Number(value(environment, "celsius")) - expectedC) < 1e-10, `${fahrenheit} °F Celsius`);
    assert.equal(value(environment, "tcf"), expectedTCF, `${fahrenheit} °F TCF`);
    assert.equal(value(corrected, "poleToPoleP1P2", 0), Number((100 * expectedTCF).toFixed(2)));
  }
  const sampleTemperatures = [
    ...sourceTemps.map((point) => point.x),
    ...sourceTemps.slice(0, -1).flatMap((point) => [point.x + 0.72, point.x + 0.9, point.x + 1.08]),
    -100, -11.3, 230.1, 500,
  ];
  for (const fahrenheit of sampleTemperatures) {
    const value = evaluate({ "lv-switch-environment": { fahrenheit }, "lv-switch-ir_row0": { poleToPoleP1P2: 1.2345 } });
    assert.equal(value(environment, "celsius"), sourceCelsius(fahrenheit), `${fahrenheit} °F source conversion`);
    assert.equal(value(environment, "tcf"), sourceTCF(fahrenheit), `${fahrenheit} °F source rounded lookup`);
    assert.equal(value(corrected, "poleToPoleP1P2", 0), Number((1.2345 * sourceTCF(fahrenheit)).toFixed(2)));
  }
  const defaults = evaluate({});
  assert.equal(defaults(environment, "celsius"), 20);
  assert.equal(defaults(environment, "tcf"), 1);
  assert.equal(defaults(environment, "humidity"), 0);
  assert.equal(defaults(corrected, "units"), "MΩ");
  const fixture = createLowVoltageSwitchRegressionData();
  const values = evaluate(fixture);
  READING_IDS.forEach((id, index) => assert.equal(values(corrected, id, 0), [125, 0, null, 50, 62.5, 75, 87.5, 100, 112.5][index], id));
  assert.equal(values(corrected, "units"), "GΩ");
  for (const unit of ["kΩ", "MΩ", "GΩ"]) {
    const changed = evaluate({ ...fixture, "lv-switch-ir": { testVoltage: "5000V", units: unit } });
    assert.equal(changed(corrected, "units"), unit);
    assert.equal(changed(corrected, READING_IDS[0], 0), 125, "Unit choice must not rescale numbers; source does not");
  }
  for (const blank of ["", null]) {
    const cleared = evaluate({ ...fixture, "lv-switch-environment": { fahrenheit: blank } });
    assert.equal(cleared(environment, "celsius"), null);
    assert.equal(cleared(environment, "tcf"), null);
    for (const id of READING_IDS) assert.equal(cleared(corrected, id, 0), null);
  }
  const changedF = applyFieldChange(fixture, environment.id, "fahrenheit", "86");
  assert.equal(evaluate(changedF)(corrected, READING_IDS[0], 0), 158, "Actual field-change path updates the source-specific calculation");
  assert.equal(changedF[environment.id].tcf, undefined, "Generic composite TCF must not be injected");
  const invalid = program.evaluate({ ...fixture, "lv-switch-ir_row0": { poleToPoleP1P2: ">100" } });
  assert.ok(invalid.issues.length > 0, "Typed numeric errors cannot silently become accepted readings");
  console.log(`PASS original calculation examples, all 135 lookup entries and ${sampleTemperatures.length} temperature cases, blank/zero/unit handling`);

  let state = adaptStoredData({ sections: fixture }, draft.structure);
  const initialRowIds = Object.fromEntries(Object.entries(state.tableRows).map(([id, rows]) => [id, rows.map((row) => row.rowInstanceId)]));
  const runtime = projectStateToRuntime(state);
  for (const [key, value] of Object.entries(fixture)) assert.deepEqual(runtime[key], value, key);
  runtime["lv-switch-ir_row0"].lineToLoadP3 = 123.456;
  runtime["lv-switch-inspection_row11"].result = "See Comments";
  state = mergeRuntimeIntoState(state, runtime, draft.structure);
  const saved = buildStoredData(state, { status: "draft", templateName: draft.name });
  const parsed = parseStoredData(JSON.stringify(saved));
  assert.ok(parsed);
  const reopenedState = adaptStoredData(parsed, reopenedDraft.structure);
  const reopened = projectStateToRuntime(reopenedState);
  assert.deepEqual(reopened, runtime, "Every entered value must survive instanceState save/reopen");
  assert.deepEqual(Object.fromEntries(Object.entries(reopenedState.tableRows).map(([id, rows]) => [id, rows.map((row) => row.rowInstanceId)])), initialRowIds);
  assert.equal(reopened["lv-switch-inspection_row11"].result, "See Comments");
  assert.equal(evaluate(reopened)(corrected, "lineToLoadP3", 0), 154.32);
  assert.equal(reopened["lv-switch-ir_row0"].lineToLoadP3, 123.456, "Saving must retain raw precision");
  assert.equal(reopened["lv-switch-ir_row0"].poleToPoleP2P3, 0);
  assert.equal(reopened["lv-switch-ir_row0"].poleToPoleP3P1, "");
  assert.equal(saved.status, "draft", "Workflow metadata stays separate from the equipment result");
  assert.equal(reopened["lv-switch-result"].status, "LIMITED SERVICE");
  const tampered = { ...reopened, "lv-switch-corrected_row0": { poleToPoleP1P2: 999 }, "lv-switch-environment": { fahrenheit: 77, tcf: 999 } };
  assert.equal(evaluate(tampered)(corrected, READING_IDS[0], 0), 125, "Reopen cannot trust stale calculated values");
  console.log("PASS instanceState save/reopen, stable row identities, raw precision and recalculation");

  for (const section of draft.structure.sections.filter((entry) => entry.columns?.length)) {
    const table = sectionTable(sectionFromV1(section));
    assert.ok(table);
    const grid = resolveGrid(table.header, table.columns);
    assert.deepEqual(grid.problems, [], section.title);
    const rows = resolveTableRows(table, section.id, { instanceRows: reopenedState.tableRows[section.id] });
    assert.equal(rows.filter((row) => row.dataIndex >= 0).length, section.rows);
    assert.equal(section.calculationRowIds!.length, section.rows);
    assert.equal(section.allowAddRows, false);
    assert.equal(section.allowRemoveRows, false);
    for (const row of rows) {
      if (row.dataIndex < 0) continue;
      assert.equal(row.stateKey, rowStateKey(section.id, row.dataIndex));
      assert.equal(row.rowInstanceId, reopenedState.tableRows[section.id][row.dataIndex].rowInstanceId);
      const cells = row.cells ?? recordCells(table.columns, row.generatorId!, row.indexInGenerator!);
      assert.deepEqual(resolveGrid([{ id: row.source.id, cells }], table.columns).problems, [], `${section.id} body ${row.dataIndex}`);
    }
  }
  const htmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const sectionMarkup = (html: string, title: string) => {
    const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)];
    const index = headings.findIndex((match) => match[1] === htmlEscape(title));
    assert.notEqual(index, -1, `Missing rendered section: ${title}`);
    return html.slice(headings[index].index! + headings[index][0].length, headings[index + 1]?.index ?? html.length);
  };
  const rowGeometry = (html: string, region: "thead" | "tbody") => {
    const body = html.match(new RegExp(`<${region}[^>]*>([\\s\\S]*?)</${region}>`));
    assert.ok(body, `Missing ${region}`);
    return [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[hd]\b([^>]*)>/g)].map((cell) => Number(cell[1].match(/colspan="(\d+)"/i)?.[1] ?? 1)));
  };
  const expressionText = (html: string, id: string) => {
    const start = html.indexOf(`data-expression-target="${id}"`);
    assert.ok(start >= 0, `Expression not rendered: ${id}`);
    return html.slice(start).match(/^[^>]*>([^<]*)<\/span>/)![1];
  };
  const renderings = new Map<RenderMode, string>();
  for (const mode of ["edit", "preview", "fill", "readonly", "print"] as const) {
    const html = renderLowVoltageSwitchRegression(mode, reopened, reopenedDraft);
    renderings.set(mode, html);
    assert.doesNotMatch(html, /Calculation (?:setup )?error|Calculation errors|role="alert"/);
    for (const section of draft.structure.sections) sectionMarkup(html, section.title);
    assert.deepEqual(rowGeometry(sectionMarkup(html, "Switch Data"), "thead"), [[1, 1, 1, 1, 1, 2], [5, 1, 1]], mode);
    assert.deepEqual(rowGeometry(sectionMarkup(html, "Fuse Data"), "thead"), [[1, 1, 1, 1, 3], [4, 1, 1, 1]], mode);
    for (const id of ["ir", "corrected", "contact"]) {
      const fragment = sectionMarkup(html, getSection(id).title);
      assert.deepEqual(rowGeometry(fragment, "thead"), [[3, 3, 3], Array(9).fill(1)], `${mode}/${id} merged headers`);
      assert.deepEqual(rowGeometry(fragment, "tbody"), id === "ir" ? [Array(9).fill(1)] : [Array(9).fill(1), [9]], `${mode}/${id} body and merged note`);
      for (const label of ["Pole-to-Pole", "Pole-to-Frame", "Line-to-Load"]) assert.ok(fragment.includes(label));
    }
    assert.deepEqual(rowGeometry(sectionMarkup(html, inspection.title), "tbody"), Array.from({ length: 12 }, () => [1, 1, 1]));
    assert.deepEqual(rowGeometry(sectionMarkup(html, "Test Equipment Used"), "tbody"), [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1]]);
    sourceDescriptions.forEach(([, neta, description]) => {
      assert.ok(html.includes(neta), `${mode}: ${neta}`);
      assert.ok(html.includes(htmlEscape(description)), `${mode}: ${description}`);
    });
    assert.equal(expressionText(html, formSlotId(environment, "celsius")!), "25", mode);
    assert.equal(expressionText(html, formSlotId(environment, "tcf")!), "1.25", mode);
    assert.equal(expressionText(html, formSlotId(corrected, "units")!), "GΩ", mode);
    READING_IDS.forEach((id, index) => assert.equal(expressionText(html, formSlotId(corrected, id, { rowIndex: 0, colId: `col-${id}` })!), ["125", "0", "—", "50", "62.5", "75", "87.5", "100", "154.32"][index], `${mode}/${id}`));
    if (mode === "fill" || mode === "readonly" || mode === "print") {
      for (const token of ["Pilot Customer", "ENC-SN-1", "SW-SN-1", "FU-CAT-1", "MEG-SN-1", "LR-SN-2", "AMP-100", "08/15/2026", "Enclosure checked."]) assert.ok(html.includes(token), `${mode}: ${token}`);
      assert.match(sectionMarkup(html, "Report Result"), /<option value="LIMITED SERVICE" selected="">LIMITED SERVICE<\/option>/);
      for (const option of ["250V", "500V", "1000V", "2500V", "5000V", "kΩ", "MΩ", "GΩ", "μΩ", "mΩ", "Ω", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"]) assert.ok(html.includes(`<option value="${option}"`), `${mode} option ${option}`);
      for (const gap of LOW_VOLTAGE_SWITCH_GAPS) assert.ok(html.includes(htmlEscape(gap)), `${mode}: missing review disclosure`);
      if (mode !== "fill") {
        for (const input of html.matchAll(/<input\b[^>]*>/g)) assert.match(input[0], /readonly=""/, `${mode}: input must be read-only`);
        for (const select of html.matchAll(/<select\b[^>]*>/g)) assert.match(select[0], /disabled=""/, `${mode}: select must be disabled`);
        for (const textarea of html.matchAll(/<textarea\b[^>]*>/g)) assert.match(textarea[0], /readonly=""/, `${mode}: textarea must be read-only`);
      }
    }
  }
  assert.match(renderings.get("fill")!, /<input[^>]*value="123\.456"/, "Corrected output must not replace raw reading control");
  assert.match(renderLowVoltageSwitchRegression("fill", { ...fixture, "lv-switch-ir_row0": { poleToPoleP1P2: "bad" } }), /role="alert"/, "Invalid measurements must visibly fail");
  const broken = structuredClone(draft);
  getSection("switch", broken).v2!.header![0].cells.at(-1)!.colSpan = 3;
  assert.equal(compileTemplate(broken).ok, false, "Broken merged geometry must fail the compilation gate");
  console.log("PASS actual runtime in edit/preview/fill/readonly/print, merged header/body geometry, values and visible errors");
  console.log("Low Voltage Switch Phase 6 pilot regression passed. Engineering, browser/PDF and host workflow review remain pending.");
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("/low-voltage-switch.regression.tsx")) {
  await runLowVoltageSwitchRegression();
}
