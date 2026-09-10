/**
 * Custom forms regression harness.
 *
 * Run with:  npm run custom-forms-regression
 *
 * Checks the phase 0 contract against the captured V1 fixtures:
 *
 *  - a V1 payload adapts into V2 without losing a value;
 *  - V2 projects back to the flat map the renderer reads, unchanged;
 *  - row instance ids survive a save-and-reopen cycle;
 *  - adding a row keeps every existing row's id;
 *  - the compiler passes real templates and refuses a broken one;
 *  - LIMITED SERVICE is a permitted result.
 *
 * This is the harness the plan's test strategy grows into. It follows the same
 * pattern as scripts/importer-regression.ts rather than adding a test runner.
 */

import { expressionCheckCount } from "@/lib/customForms/expressions/expressions.regression";
import {
  renderCheckCount,
  renderFailureCount,
} from "./custom-forms-render";
import { runLowVoltageSwitchRegression } from "../src/lib/customForms/conversions/low-voltage-switch.regression";

import {
  V1_FIXTURES,
  VALID_FIXTURES,
  BROKEN_FIXTURE,
} from "../src/lib/customForms/__fixtures__/v1Templates";
import {
  adaptStoredData,
  buildStoredData,
  mergeRuntimeIntoState,
  parseStoredData,
  projectStateToRuntime,
  type StoredInstanceData,
} from "../src/lib/customForms/instanceState";
import {
  compileTemplate,
  validateInstanceStructure,
  validateTemplateDraft,
} from "../src/lib/customForms/compile";
import { canonicalJson } from "../src/lib/customForms/checksum";
import { CUSTOM_FORM_RESULTS } from "../src/lib/types/customForms";
import { rowStateKey } from "../src/lib/customForms/runtime/layout";
import {
  documentFromV1,
  sectionFromV1,
} from "../src/lib/customForms/v2/fromV1";
import { validateDocumentV2 } from "../src/lib/customForms/v2/validate";
import { resolveGrid, implicitHeaderRow } from "../src/lib/customForms/v2/grid";
import { evaluateCondition } from "../src/lib/customForms/v2/conditions";
import { recordCells, resolveTableRows } from "../src/lib/customForms/v2/rows";
import {
  allSections,
  sectionTable,
  type ColumnV2,
  type HeaderRowV2,
} from "../src/lib/customForms/v2/schema";
import { isKnownBinding } from "../src/lib/customForms/v2/bindings";
import { conditionScopeValues } from "../src/lib/customForms/v2/conditions";
import {
  checkFormula,
  filterReferences,
  groupReferences,
  listReferences,
} from "../src/lib/customForms/referenceCatalog";
import type { SectionConfig } from "../src/lib/types/customForms";
import { prepareTypedForm } from "../src/lib/customForms/expressions/form-program";
import { EXPRESSION_ENGINE_VERSION } from "../src/lib/customForms/expressions/types";
import type { CustomFormStructure } from "../src/lib/types/customForms";
import {
  addHeaderRow,
  beginOverlay,
  currentBody,
  currentHeader,
  fillHeaderGaps,
  hasOverlay,
  moveBodyRow,
  newBodyRow,
  overlayColumns,
  setBodyCellSpan,
  setHeaderCellSpan,
  canMergeBodyRight,
  canMergeHeaderDown,
  canMergeHeaderRight,
  splitBodyCell,
  splitHeaderCell,
  removeColumn,
} from "../src/lib/customForms/v2/authoring";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail?: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------

section("V1 to V2 adapter: no value is lost");

for (const fixture of VALID_FIXTURES) {
  const stored = parseStoredData(fixture.storedData) as StoredInstanceData;
  const state = adaptStoredData(stored, fixture.structure);
  const projected = projectStateToRuntime(state);

  const originalSections = (stored.sections ?? {}) as Record<string, any>;
  const missing: string[] = [];
  for (const [key, values] of Object.entries(originalSections)) {
    for (const [fieldId, value] of Object.entries(values ?? {})) {
      if (projected[key]?.[fieldId] !== value) {
        missing.push(`${key}.${fieldId}: ${String(value)} -> ${String(projected[key]?.[fieldId])}`);
      }
    }
  }
  check(
    `${fixture.name}: every stored value survives the round trip`,
    missing.length === 0,
    missing.slice(0, 5).join("; "),
  );

  const rowIds = Object.values(state.tableRows).flat().map((r) => r.rowInstanceId);
  check(
    `${fixture.name}: every row has a stable id`,
    rowIds.length === new Set(rowIds).size && rowIds.every(Boolean),
    `${rowIds.length} rows, ${new Set(rowIds).size} unique`,
  );
}

// ---------------------------------------------------------------------------

section("Row ids survive a save and reopen");

for (const fixture of VALID_FIXTURES) {
  const stored = parseStoredData(fixture.storedData) as StoredInstanceData;
  const first = adaptStoredData(stored, fixture.structure);
  const runtime = projectStateToRuntime(first);

  // Save, then reopen what was saved.
  const savedData = buildStoredData(
    mergeRuntimeIntoState(first, runtime, fixture.structure),
    { status: "PASS" },
  );
  const reopened = adaptStoredData(savedData, fixture.structure);

  const before = Object.entries(first.tableRows).map(([id, rows]) =>
    `${id}:${rows.map((r) => r.rowInstanceId).join(",")}`,
  );
  const after = Object.entries(reopened.tableRows).map(([id, rows]) =>
    `${id}:${rows.map((r) => r.rowInstanceId).join(",")}`,
  );
  check(
    `${fixture.name}: reopening keeps the same row ids`,
    canonicalJson(before) === canonicalJson(after),
    `${before.join(" | ")}\n        vs\n        ${after.join(" | ")}`,
  );

  const reopenedRuntime = projectStateToRuntime(reopened);
  check(
    `${fixture.name}: reopening keeps the same values`,
    canonicalJson(runtime) === canonicalJson(reopenedRuntime),
  );
}

// ---------------------------------------------------------------------------

section("Adding a row does not disturb the rows already there");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const stored = parseStoredData(fixture.storedData) as StoredInstanceData;
  const state = adaptStoredData(stored, fixture.structure);
  const originalIds = state.tableRows["sec-ir"].map((r) => r.rowInstanceId);

  // What the runtime does when the user clicks Add Row: the section grows and
  // a new empty state key appears.
  const grownStructure = {
    ...fixture.structure,
    sections: fixture.structure.sections.map((s) =>
      s.id === "sec-ir" ? { ...s, rows: 4 } : s,
    ),
  };
  const runtime = projectStateToRuntime(state);
  runtime[rowStateKey("sec-ir", 3)] = { test: "N-G", reading: "990" };

  const merged = mergeRuntimeIntoState(state, runtime, grownStructure);
  const newIds = merged.tableRows["sec-ir"].map((r) => r.rowInstanceId);

  check(
    "existing row ids are unchanged after adding a row",
    canonicalJson(newIds.slice(0, 3)) === canonicalJson(originalIds),
    `${originalIds.join(",")} -> ${newIds.slice(0, 3).join(",")}`,
  );
  check(
    "the new row got its own id",
    newIds.length === 4 && !originalIds.includes(newIds[3]),
  );
  check(
    "the new row kept its values",
    merged.tableRows["sec-ir"][3].values.reading === "990",
  );
}

// ---------------------------------------------------------------------------

section("Hidden conditional rows keep their values");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "conditional-windings")!;
  const stored = parseStoredData(fixture.storedData) as StoredInstanceData;
  const state = adaptStoredData(stored, fixture.structure);
  const rows = state.tableRows["sec-wind"];

  check(
    "a row hidden by the current setting still holds its value",
    rows[3]?.values.value === "0.88",
    `row 3 values: ${JSON.stringify(rows[3]?.values)}`,
  );
  check(
    "rows are indexed against the full definition list",
    rows.length === 4 &&
      rows.map((r) => r.rowDefinitionId).join(",") === "row0,row1,row2,row3",
    rows.map((r) => r.rowDefinitionId).join(","),
  );
}

// ---------------------------------------------------------------------------

section("Template compiler");

for (const fixture of VALID_FIXTURES) {
  const result = compileTemplate({
    name: fixture.name,
    structure: fixture.structure,
  });
  check(
    `${fixture.name}: compiles and can be published`,
    result.ok,
    result.report.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
  );
  if (result.structure) {
    check(
      `${fixture.name}: publication normalises settings`,
      typeof result.structure.settings.includePrintHeader === "boolean" &&
        typeof result.structure.settings.pageBreakAfterSection === "boolean",
    );
  }
}

{
  const result = compileTemplate({
    name: "broken",
    structure: BROKEN_FIXTURE.structure,
  });
  check("a broken template is refused publication", !result.ok);

  const codes = new Set(result.report.issues.map((i) => i.code));
  const expected = [
    "section.duplicate",
    "column.duplicate",
    "formula.unknownSection",
    "rows.impossibleBounds",
  ];
  for (const code of expected) {
    check(
      `broken template reports ${code}`,
      codes.has(code),
      `got: ${[...codes].join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------

section("Draft validation never blocks a save");

{
  const report = validateTemplateDraft(BROKEN_FIXTURE.structure);
  check("a broken draft still produces a report rather than throwing", !!report);
  check("a broken draft reports errors", report.errors.length > 0);
}

// ---------------------------------------------------------------------------

section("Instance validation");

for (const fixture of VALID_FIXTURES) {
  const stored = parseStoredData(fixture.storedData) as StoredInstanceData;
  const result = validateInstanceStructure(
    (stored.sections ?? {}) as Record<string, any>,
    fixture.structure,
  );
  check(`${fixture.name}: saved instance is not corrupt`, !result.corrupt,
    result.issues.map((i) => i.message).join("; "));
}

{
  const result = validateInstanceStructure(
    { "sec-ir_row0": "not an object" } as any,
    VALID_FIXTURES[0].structure,
  );
  check("a corrupt state key is rejected", result.corrupt);
}

// ---------------------------------------------------------------------------

section("Result status");

check(
  "LIMITED SERVICE is a permitted result",
  CUSTOM_FORM_RESULTS.includes("LIMITED SERVICE"),
);
check(
  "a fixture carrying LIMITED SERVICE round-trips",
  V1_FIXTURES.some((f) => (f.storedData as any).status === "LIMITED SERVICE"),
);


// ---------------------------------------------------------------------------

section("V1 to V2 structure adapter");

for (const fixture of VALID_FIXTURES) {
  const document = documentFromV1(fixture.structure);
  check(
    `${fixture.name}: every V1 section becomes a V2 section`,
    allSections(document).length === fixture.structure.sections.length,
  );
  check(
    `${fixture.name}: the adapted document validates`,
    validateDocumentV2(document).filter((i) => i.severity === "error").length === 0,
    validateDocumentV2(document)
      .filter((i) => i.severity === "error")
      .map((i) => `${i.code}: ${i.message}`)
      .join("; "),
  );
  check(
    `${fixture.name}: adapting twice gives the same document`,
    canonicalJson(documentFromV1(fixture.structure)) ===
      canonicalJson(documentFromV1(fixture.structure)),
  );
}

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const section = sectionFromV1(
    fixture.structure.sections.find((s) => s.id === "sec-ir")!,
  );
  const table = sectionTable(section)!;
  const rows = resolveTableRows(table, "sec-ir");
  check(
    "per-cell formulas become real cells rather than a side map",
    rows.length === 3 && rows.every((r) => r.kind === "fixed"),
    rows.map((r) => r.kind).join(","),
  );
  check(
    "the adapted rows keep their V1 data indices",
    rows.map((r) => r.dataIndex).join(",") === "0,1,2",
    rows.map((r) => r.dataIndex).join(","),
  );
  check(
    "the adapted rows keep their V1 state keys",
    rows[2].stateKey === rowStateKey("sec-ir", 2),
    rows[2].stateKey,
  );
}

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "contact-resistance-limited-service")!;
  const section = sectionFromV1(fixture.structure.sections[0]);
  const table = sectionTable(section)!;
  const rows = resolveTableRows(table, "sec-cr");
  check(
    "a table with no per-cell overrides is one records generator",
    table.body.length === 1 && table.body[0].kind === "records",
  );
  check(
    "the generator expands to the section's row count",
    rows.length === 2 && rows.every((r) => r.kind === "records"),
    `${rows.length} rows`,
  );
  check(
    "generated rows carry their default labels",
    rows[0].label === "Section 1" && rows[1].label === "Section 2",
    `${rows[0].label} / ${rows[1].label}`,
  );
}

// ---------------------------------------------------------------------------

section("Grid resolution: merged cells");

{
  const columns: ColumnV2[] = ["a", "b", "c", "d"].map((id) => ({
    id,
    label: id.toUpperCase(),
  }));

  // A two-row header: one cell spanning both rows, one spanning three columns.
  const header: HeaderRowV2[] = [
    {
      id: "h1",
      cells: [
        { id: "h1-a", columnId: "a", label: "Circuit", rowSpan: 2 },
        { id: "h1-b", columnId: "b", label: "Readings", colSpan: 3 },
      ],
    },
    {
      id: "h2",
      cells: [
        { id: "h2-b", columnId: "b", label: "A" },
        { id: "h2-c", columnId: "c", label: "B" },
        { id: "h2-d", columnId: "d", label: "C" },
      ],
    },
  ];

  const grid = resolveGrid(header, columns, { regionLabel: "header" });
  check("a valid merged header reports no problems", grid.problems.length === 0,
    grid.problems.map((p) => p.message).join("; "));
  check(
    "the second header row omits the cell covered from above",
    grid.rows[1].length === 3,
    `${grid.rows[1].length} cells`,
  );
  check(
    "the spanning cell records its span",
    grid.rows[0][0].rowSpan === 2 && grid.rows[0][1].colSpan === 3,
  );
}

{
  const columns: ColumnV2[] = ["a", "b", "c"].map((id) => ({ id, label: id }));
  const overlapping: HeaderRowV2[] = [
    {
      id: "h1",
      cells: [
        { id: "x", columnId: "a", label: "X", colSpan: 2 },
        { id: "y", columnId: "b", label: "Y", colSpan: 2 },
      ],
    },
  ];
  const grid = resolveGrid(overlapping, columns, { regionLabel: "header" });
  check(
    "overlapping merged cells are caught",
    grid.problems.some((p) => p.code === "grid.overlap"),
    grid.problems.map((p) => p.code).join(","),
  );

  // Overflow is a separate failure: a span that runs off the last column.
  const overflowing = resolveGrid(
    [
      {
        id: "h1",
        cells: [
          { id: "a", columnId: "a", label: "A" },
          { id: "b", columnId: "b", label: "B" },
          { id: "c", columnId: "c", label: "C", colSpan: 2 },
        ],
      },
    ],
    columns,
    { regionLabel: "header" },
  );
  check(
    "a span past the last column is caught",
    overflowing.problems.some((p) => p.code === "grid.overflow"),
    overflowing.problems.map((p) => p.code).join(","),
  );
  check(
    "an overflowing span is clamped to the columns that exist",
    overflowing.rows[0][2].colSpan === 1,
    String(overflowing.rows[0][2]?.colSpan),
  );
}

{
  const columns: ColumnV2[] = ["a", "b", "c"].map((id) => ({ id, label: id }));
  const holed: HeaderRowV2[] = [
    { id: "h1", cells: [{ id: "x", columnId: "a", label: "X" }] },
  ];
  const grid = resolveGrid(holed, columns, { regionLabel: "header" });
  check(
    "a header leaving columns uncovered is caught",
    grid.problems.some((p) => p.code === "grid.hole"),
    grid.problems.map((p) => p.code).join(","),
  );
}

{
  const columns: ColumnV2[] = [{ id: "a", label: "A" }];
  const grid = resolveGrid(
    [{ id: "h1", cells: [{ id: "x", columnId: "nope", label: "X" }] }],
    columns,
    { regionLabel: "header" },
  );
  check(
    "a cell anchored to a column that does not exist is caught",
    grid.problems.some((p) => p.code === "grid.unknownColumn"),
  );
  check(
    "an implicit header covers every column",
    resolveGrid([implicitHeaderRow(columns)], columns).problems.length === 0,
  );
}

// ---------------------------------------------------------------------------

section("Conditions");

{
  const scope = {
    values: {
      "sec-wind": { winding: "secondary" },
      "sec-wind_row0": { value: "12" },
    },
  };

  check(
    "a settings condition matches the current value",
    evaluateCondition(
      {
        kind: "in",
        ref: { scope: "setting", sectionId: "sec-wind", settingId: "winding" },
        values: ["secondary"],
      },
      scope,
    ),
  );
  check(
    "a settings condition rejects a value that is not selected",
    !evaluateCondition(
      {
        kind: "in",
        ref: { scope: "setting", sectionId: "sec-wind", settingId: "winding" },
        values: ["primary"],
      },
      scope,
    ),
  );
  check(
    "an unresolvable reference reads as empty rather than throwing",
    evaluateCondition(
      { kind: "empty", ref: { scope: "field", sectionId: "nope", fieldId: "nope" } },
      scope,
    ),
  );
  check(
    "numeric comparison parses a string reading",
    evaluateCondition(
      {
        kind: "compare",
        ref: { scope: "cell", tableId: "sec-wind", columnId: "value", row: "current" },
        op: "gt",
        value: 10,
      },
      {
        ...scope,
        currentRow: { tableId: "sec-wind", stateKey: "sec-wind_row0", index: 0 },
      },
    ),
  );
  check(
    "all/any/not compose",
    evaluateCondition(
      {
        kind: "all",
        of: [
          { kind: "always" },
          { kind: "not", of: { kind: "never" } },
          { kind: "any", of: [{ kind: "never" }, { kind: "always" }] },
        ],
      },
      scope,
    ),
  );
}

{
  // A V1 conditional table's row visibility must survive the adapter.
  const fixture = VALID_FIXTURES.find((f) => f.name === "conditional-windings")!;
  const section = sectionFromV1(fixture.structure.sections[0]);
  const table = sectionTable(section)!;
  const primaryScope = { values: { "sec-wind": { winding: "primary" } } };
  const secondaryScope = { values: { "sec-wind": { winding: "secondary" } } };

  const sectionScope = (section: SectionConfig, values: Record<string, any>) => ({
    values: conditionScopeValues([section], values),
  });
  const visibleUnder = (scope: any) =>
    table.body.filter((row) => evaluateCondition(row.visibleWhen, scope)).length;

  check(
    "primary shows the two primary rows",
    visibleUnder(primaryScope) === 2,
    `${visibleUnder(primaryScope)} rows`,
  );
  check(
    "secondary shows the two secondary rows",
    visibleUnder(secondaryScope) === 2,
    `${visibleUnder(secondaryScope)} rows`,
  );
  // A form the technician has just opened has touched no dropdown, so the
  // settings hold no value at all. The default has to be applied before the
  // condition is evaluated, or the table renders with no rows.
  check(
    "a freshly opened conditional table shows its default rows",
    visibleUnder(sectionScope(fixture.structure.sections[0], {})) === 2,
    `${visibleUnder(sectionScope(fixture.structure.sections[0], {}))} rows`,
  );
  check(
    "a touched setting still wins over the default",
    visibleUnder(
      sectionScope(fixture.structure.sections[0], {
        "sec-wind": { winding: "secondary" },
      }),
    ) === 2,
  );
  check(
    "hidden rows still occupy their data index",
    resolveTableRows(table, "sec-wind").map((r) => r.dataIndex).join(",") ===
      "0,1,2,3",
  );
}

// ---------------------------------------------------------------------------

section("Bindings are a closed registry");

check("a known binding resolves", isKnownBinding("job.number"));
check("an unknown binding is refused", !isKnownBinding("job.secretColumn"));
check(
  "a template cannot bind to an arbitrary table",
  !isKnownBinding("neta_ops.custom_form_instances.data"),
);


// ---------------------------------------------------------------------------

section("Publication gate: typed calculations");

{
  // The insulation-resistance fixture, upgraded to typed calculations.
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  // Typed calculations need durable row identity, so the adapter refuses a
  // table whose rows can be added and removed. Fix the rows to upgrade it.
  const fixedRows: CustomFormStructure = {
    ...fixture.structure,
    sections: fixture.structure.sections.map((s) =>
      s.id === "sec-ir"
        ? { ...s, allowAddRows: false, allowRemoveRows: false }
        : s,
    ),
  };
  let counter = 0;
  const upgraded = prepareTypedForm(fixedRows, () => `id${counter++}`);
  check(
    "a table with dynamic rows is refused typed calculations",
    !prepareTypedForm(fixture.structure, () => "x").ok,
  );
  check(
    "an existing template upgrades to typed calculations",
    upgraded.ok,
    upgraded.ok ? "" : JSON.stringify(upgraded.issues),
  );

  if (upgraded.ok) {
    const typed = upgraded.value;
    check(
      "the upgrade persists a stable row id per fixed row",
      typed.sections.find((s) => s.id === "sec-ir")?.calculationRowIds?.length === 3,
    );
    check(
      "upgrading twice keeps the same row ids",
      canonicalJson(
        prepareTypedForm(typed, () => "should-not-be-used").ok
          ? (prepareTypedForm(typed, () => "should-not-be-used") as any).value
              .sections.find((s: any) => s.id === "sec-ir").calculationRowIds
          : null,
      ) ===
        canonicalJson(
          typed.sections.find((s) => s.id === "sec-ir")?.calculationRowIds,
        ),
    );
    check(
      "a typed template compiles and can be published",
      compileTemplate({ name: "typed", structure: typed }).ok,
      compileTemplate({ name: "typed", structure: typed })
        .report.errors.map((e) => `${e.code}: ${e.message}`)
        .join("; "),
    );

    // A cycle between two calculated cells.
    const ids = Object.keys(typed.expressions!.formulas);
    const cyclic: CustomFormStructure = {
      ...typed,
      expressions: {
        engineVersion: EXPRESSION_ENGINE_VERSION,
        // Keep every calculated cell supplied, so the cycle is what fails
        // rather than a cell left without a formula.
        formulas: {
          ...typed.expressions!.formulas,
          [ids[0]]: `{${ids[1]}}`,
          [ids[1]]: `{${ids[0]}}`,
        },
      },
    };
    const cyclicReport = compileTemplate({ name: "cyclic", structure: cyclic }).report;
    check(
      "a calculation cycle blocks publication",
      cyclicReport.errors.some((e) => e.code === "expression.dependency.cycle"),
      cyclicReport.errors.map((e) => e.code).join(","),
    );
    check(
      "the cycle error names the exact character range",
      cyclicReport.errors.some((e) => /characters \d+-\d+/.test(e.message)),
      cyclicReport.errors.map((e) => e.message).join(" | "),
    );

    // An unknown reference.
    const unknown: CustomFormStructure = {
      ...typed,
      expressions: {
        engineVersion: EXPRESSION_ENGINE_VERSION,
        formulas: {
          ...typed.expressions!.formulas,
          [ids[0]]: "{no-such-field} * 2",
        },
      },
    };
    const unknownReport = compileTemplate({ name: "unknown", structure: unknown }).report;
    check(
      "an unknown reference blocks publication",
      unknownReport.errors.some((e) => e.code === "expression.reference.unknown"),
      unknownReport.errors.map((e) => e.code).join(","),
    );
  }
}

{
  // A template declaring its own lookup table and curve.
  const structure: CustomFormStructure = {
    settings: {
      includePassFail: true,
      includeJobInfo: false,
      includePrintHeader: true,
    },
    sections: [
      {
        id: "sec",
        componentType: "custom-table" as any,
        title: "Readings",
        order: 0,
        showInPrint: true,
        referenceCode: "RD",
        rows: 1,
        calculationRowIds: ["r0"],
        columns: [
          {
            id: "celsius",
            label: "°C",
            field: { id: "celsius", label: "°C", type: "number" as any },
          },
          {
            id: "corrected",
            label: "Corrected",
            field: {
              id: "corrected",
              label: "Corrected",
              type: "calculated" as any,
            },
          },
        ],
      },
    ],
    expressions: {
      engineVersion: EXPRESSION_ENGINE_VERSION,
      formulas: {
        "cell/sec/r0/corrected":
          'if(isnull({cell/sec/r0/celsius}), null, interpolate("tcf", {cell/sec/r0/celsius}))',
      },
      curves: [
        {
          id: "tcf",
          points: [
            { x: 20, y: 1 },
            { x: 25, y: 1.25 },
          ],
        },
      ],
    },
  };

  check(
    "a template-declared curve compiles",
    compileTemplate({ name: "curve", structure }).ok,
    compileTemplate({ name: "curve", structure })
      .report.errors.map((e) => `${e.code}: ${e.message}`)
      .join("; "),
  );

  const missing: CustomFormStructure = {
    ...structure,
    expressions: { ...structure.expressions!, curves: [] },
  };
  check(
    "naming a curve the template does not declare blocks publication",
    compileTemplate({ name: "missing", structure: missing }).report.errors.some(
      (e) => e.code === "expression.curve.unknown",
    ),
    compileTemplate({ name: "missing", structure: missing })
      .report.errors.map((e) => e.code)
      .join(","),
  );
}

// ---------------------------------------------------------------------------

section("V2 authoring: the grid editor's operations");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const table = fixture.structure.sections.find((s) => s.id === "sec-ir")!;

  check("a section starts with no overlay", !hasOverlay(table));
  check(
    "the implicit header covers every column",
    currentHeader(table)[0].cells.length === table.columns!.length,
  );
  check(
    "opening the editor captures what the table already looks like",
    beginOverlay(table).header?.[0].cells.length === table.columns!.length,
  );

  const withOverlay = { ...table, v2: beginOverlay(table) };
  check("an opened section reports an overlay", hasOverlay(withOverlay));

  const twoRows = {
    ...withOverlay,
    v2: { ...withOverlay.v2, header: addHeaderRow(withOverlay) },
  };
  check(
    "adding a header row gives one cell per column",
    twoRows.v2!.header!.length === 2 &&
      twoRows.v2!.header![1].cells.length === table.columns!.length,
  );

  const firstRow = twoRows.v2!.header![0];
  const merged = setHeaderCellSpan(twoRows, firstRow.id, firstRow.cells[1].id, {
    colSpan: 2,
  });
  check(
    "widening a header cell removes the cell it now covers",
    merged[0].cells.length === 2,
    `${merged[0].cells.length} cells`,
  );
  check(
    "the widened cell records its span",
    merged[0].cells.find((c) => c.id === firstRow.cells[1].id)?.colSpan === 2,
  );
  check(
    "the merged header still resolves without problems",
    resolveGrid(merged, overlayColumns(twoRows), { regionLabel: "header" })
      .problems.length === 0,
    resolveGrid(merged, overlayColumns(twoRows), { regionLabel: "header" })
      .problems.map((p) => p.message)
      .join("; "),
  );
  check(
    "widening past the last column clamps rather than overflowing",
    resolveGrid(
      setHeaderCellSpan(twoRows, firstRow.id, firstRow.cells[0].id, {
        colSpan: 9,
      }),
      overlayColumns(twoRows),
      { regionLabel: "header" },
    ).problems.length === 0,
  );

  const gapped = setHeaderCellSpan(twoRows, firstRow.id, firstRow.cells[0].id, {
    colSpan: 2,
  });
  const refilled = fillHeaderGaps(
    { ...twoRows, v2: { ...twoRows.v2, header: gapped } },
    gapped,
  );
  check(
    "filling gaps restores full coverage",
    resolveGrid(refilled, overlayColumns(twoRows), { regionLabel: "header" })
      .problems.length === 0,
  );
}

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const table = fixture.structure.sections.find((s) => s.id === "sec-ir")!;

  check(
    "a table with no declared body is one records generator",
    currentBody(table).length === 1 && currentBody(table)[0].kind === "records",
  );

  const body = [
    ...currentBody(table),
    newBodyRow(table, "divider"),
    newBodyRow(table, "total"),
  ];
  check("every row kind can be created", body.length === 3);
  check(
    "a total row gets one cell per column",
    (body[2] as any).cells.length === table.columns!.length,
  );
  check(
    "rows can be reordered",
    moveBodyRow(body, body[2].id, -1)[1].kind === "total",
  );
  check("a row cannot move past the end", moveBodyRow(body, body[2].id, 1) === body);

  const spanned = setBodyCellSpan(
    table,
    body,
    body[2].id,
    (body[2] as any).cells[0].id,
    2,
  );
  check(
    "widening a body cell removes what it covers",
    (spanned[2] as any).cells.length === table.columns!.length - 1,
    `${(spanned[2] as any).cells.length} cells`,
  );
}

// ---------------------------------------------------------------------------

section("V2 authoring: the overlay reaches the renderer");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const base = fixture.structure.sections.find((s) => s.id === "sec-ir")!;

  const authored: SectionConfig = {
    ...base,
    v2: {
      header: [
        {
          id: "h1",
          cells: [
            { id: "h1a", columnId: "col-test", label: "Circuit", rowSpan: 2 },
            { id: "h1b", columnId: "col-reading", label: "Readings", colSpan: 2 },
          ],
        },
        {
          id: "h2",
          cells: [
            { id: "h2a", columnId: "col-reading", label: "Measured" },
            { id: "h2b", columnId: "col-corrected", label: "Corrected" },
          ],
        },
      ],
      body: [
        { id: "note1", kind: "criteria", text: "Readings corrected to 20 °C." },
        {
          id: "records1",
          kind: "records",
          policy: {
            initial: 2,
            min: 1,
            max: 10,
            allowAdd: true,
            allowRemove: true,
            allowReorder: false,
            allowCopy: false,
          },
        },
      ],
    },
  };

  const table = sectionTable(sectionFromV1(authored))!;
  check(
    "the overlay's header reaches the adapted table",
    table.header.length === 2,
    `${table.header.length} header rows`,
  );
  check(
    "the overlay's body reaches the adapted table",
    table.body.length === 2 && table.body[0].kind === "criteria",
  );
  check(
    "the authored header resolves cleanly",
    resolveGrid(table.header, table.columns, { regionLabel: "header" }).problems
      .length === 0,
  );
  check(
    "a criteria row consumes no data slot",
    resolveTableRows(table, "sec-ir").filter((r) => r.dataIndex >= 0).length === 2,
  );
  check(
    "the records rows keep their V1 state keys",
    resolveTableRows(table, "sec-ir")
      .filter((r) => r.dataIndex >= 0)
      .map((r) => r.stateKey)
      .join(",") === `${rowStateKey("sec-ir", 0)},${rowStateKey("sec-ir", 1)}`,
  );

  const authoredStructure: CustomFormStructure = {
    ...fixture.structure,
    sections: fixture.structure.sections.map((s) =>
      s.id === "sec-ir" ? authored : s,
    ),
  };
  const report = compileTemplate({
    name: "authored",
    structure: authoredStructure,
  }).report;
  check(
    "an authored grid compiles and can be published",
    report.errors.length === 0,
    report.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
  );

  const broken: SectionConfig = {
    ...authored,
    v2: {
      ...authored.v2,
      header: [
        {
          id: "h1",
          cells: [
            { id: "h1a", columnId: "col-test", label: "A", colSpan: 2 },
            { id: "h1b", columnId: "col-reading", label: "B", colSpan: 2 },
          ],
        },
      ],
    },
  };
  const brokenReport = compileTemplate({
    name: "broken-grid",
    structure: {
      ...fixture.structure,
      sections: fixture.structure.sections.map((s) =>
        s.id === "sec-ir" ? broken : s,
      ),
    },
  }).report;
  check(
    "an overlapping merge blocks publication",
    brokenReport.errors.some((e) => e.code === "grid.overlap"),
    brokenReport.errors.map((e) => e.code).join(","),
  );
}

// ---------------------------------------------------------------------------

section("V2 authoring: merge and split are reversible");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const base = fixture.structure.sections.find((s) => s.id === "sec-ir")!;
  const table = { ...base, v2: beginOverlay(base) };
  const header = addHeaderRow(table);
  const withRows = { ...table, v2: { ...table.v2, header } };
  const cols = overlayColumns(withRows);

  const firstCell = header[0].cells[0];

  check(
    "a cell at the left edge can merge right",
    canMergeHeaderRight(withRows, header, header[0].id, firstCell.id),
  );
  check(
    "a cell at the right edge cannot merge right",
    !canMergeHeaderRight(
      withRows,
      header,
      header[0].id,
      header[0].cells[cols.length - 1].id,
    ),
  );
  check(
    "a cell in the first of two header rows can merge down",
    canMergeHeaderDown(header, header[0].id, firstCell.id),
  );
  check(
    "a cell in the last header row cannot merge down",
    !canMergeHeaderDown(header, header[1].id, header[1].cells[0].id),
  );

  // Merge, then split, and the grid should be whole again.
  const merged = setHeaderCellSpan(withRows, header[0].id, firstCell.id, {
    colSpan: 2,
  });
  check(
    "merging removes the covered cell",
    merged[0].cells.length === cols.length - 1,
    `${merged[0].cells.length} cells`,
  );

  const split = splitHeaderCell(
    { ...withRows, v2: { ...withRows.v2, header: merged } },
    merged,
    header[0].id,
    firstCell.id,
  );
  check(
    "splitting restores every column",
    resolveGrid(split, cols, { regionLabel: "header" }).problems.length === 0,
    resolveGrid(split, cols, { regionLabel: "header" })
      .problems.map((p) => p.message)
      .join("; "),
  );
  check(
    "the split cell is back to one column",
    (split[0].cells.find((c) => c.id === firstCell.id)?.colSpan ?? 1) === 1,
  );
}

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const base = fixture.structure.sections.find((s) => s.id === "sec-ir")!;
  const body = [newBodyRow(base, "total")];
  const cells = (body[0] as any).cells;

  check(
    "a body cell at the left edge can merge right",
    canMergeBodyRight(base, body, body[0].id, cells[0].id),
  );
  check(
    "a body cell at the right edge cannot merge right",
    !canMergeBodyRight(base, body, body[0].id, cells[cells.length - 1].id),
  );

  const merged = setBodyCellSpan(base, body, body[0].id, cells[0].id, 2);
  const split = splitBodyCell(base, merged, body[0].id, cells[0].id);
  check(
    "splitting a body cell restores every column",
    resolveGrid(
      split.map((r) => ({ id: r.id, cells: (r as any).cells })),
      overlayColumns(base),
      { regionLabel: "body" },
    ).problems.length === 0,
  );
  check(
    "restored body cells stay in column order",
    (split[0] as any).cells
      .map((c: any) => c.columnId)
      .join(",") === base.columns!.map((c) => c.id).join(","),
    (split[0] as any).cells.map((c: any) => c.columnId).join(","),
  );
}

// ---------------------------------------------------------------------------

section("Builder: the formula reference picker");

{
  const fixture = VALID_FIXTURES.find((f) => f.name === "insulation-resistance")!;
  const refs = listReferences(fixture.structure.sections);
  const inserts = new Set(refs.map((r) => r.insert));

  check("job info fields are offered", inserts.has("{JD.customer}"));
  check(
    "the derived temperature correction factor is offered",
    inserts.has("{JD.tcf}"),
  );
  check("table columns are offered by number", inserts.has("{IR.C2}"));
  check("specific table rows are offered", inserts.has("{IR.C2.R1}"));
  check("the comments field is offered", inserts.has("{CM.comments}"));
  check(
    "every reference explains itself",
    refs.every((r) => r.description.length > 0 && r.label.length > 0),
  );
  check(
    "references are grouped by section",
    groupReferences(refs).length === fixture.structure.sections.length,
    `${groupReferences(refs).length} groups`,
  );
  check(
    "searching narrows the list",
    filterReferences(refs, "corrected").length > 0 &&
      filterReferences(refs, "corrected").length < refs.length,
  );
  check(
    "searching for nothing returns everything",
    filterReferences(refs, "  ").length === refs.length,
  );

  // The formula checker.
  check("a valid formula reports nothing", checkFormula("{IR.C2} * {JD.tcf}", refs).length === 0);
  check("an empty formula reports nothing", checkFormula("", refs).length === 0);
  check(
    "an unknown reference is reported",
    checkFormula("{IR.C9}", refs).some((p) => p.message.includes("{IR.C9}")),
  );
  check(
    "an unbalanced brace is reported",
    checkFormula("{IR.C2", refs).some((p) => p.message.includes("closing brace")),
  );
  check(
    "an empty reference is reported",
    checkFormula("{}", refs).some((p) => p.message === "Empty reference."),
  );
  check(
    "the problem points at the offending characters",
    (() => {
      const problem = checkFormula("1 + {NOPE.x}", refs)[0];
      return problem.start === 4 && problem.end === 12;
    })(),
    JSON.stringify(checkFormula("1 + {NOPE.x}", refs)[0]),
  );
}

{
  // A conditional table addresses rows by definition order, so the picker has
  // to offer all four winding rows even though only two show at a time.
  const fixture = VALID_FIXTURES.find((f) => f.name === "conditional-windings")!;
  const refs = listReferences(fixture.structure.sections);
  const inserts = new Set(refs.map((r) => r.insert));
  check("conditional rows are all addressable", inserts.has("{WD.C2.R4}"));
  check("the settings dropdown is addressable", inserts.has("{WD.winding}"));
}

// ---------------------------------------------------------------------------

section("Multi-row records");

{
  const columns = ["from", "to", "reading"].map((id) => ({ id, label: id }));
  const table = {
    id: "t",
    columns,
    header: [],
    footer: [],
    body: [
      {
        id: "gen",
        kind: "records" as const,
        policy: {
          initial: 3, min: 1, max: 10,
          allowAdd: true, allowRemove: true, allowReorder: false, allowCopy: false,
          rowsPerRecord: 2,
          spanningColumns: ["from", "to"],
          subRowLabels: ["RDG", "Corrected"],
        },
      },
    ],
  };

  const rows = resolveTableRows(table as any, "t");
  check("a record expands to its sub-rows", rows.length === 6, `${rows.length} rows`);
  check(
    "sub-rows are numbered within their record",
    rows.map((r) => `${r.recordIndex}.${r.subRowIndex}`).join(",") ===
      "0.0,0.1,1.0,1.1,2.0,2.1",
    rows.map((r) => `${r.recordIndex}.${r.subRowIndex}`).join(","),
  );
  check(
    "every sub-row keeps its own data slot",
    rows.map((r) => r.dataIndex).join(",") === "0,1,2,3,4,5",
  );
  check(
    "sub-rows carry their labels",
    rows[0].label === "RDG" && rows[1].label === "Corrected",
  );

  const first = recordCells(columns as any, "gen", 0, {
    rowsPerRecord: 2,
    spanningColumns: ["from", "to"],
    subRowIndex: 0,
  });
  const second = recordCells(columns as any, "gen", 0, {
    rowsPerRecord: 2,
    spanningColumns: ["from", "to"],
    subRowIndex: 1,
  });
  check("the first sub-row draws every column", first.length === 3);
  check(
    "the identifying columns span the record",
    first.filter((c) => c.rowSpan === 2).length === 2,
  );
  check(
    "later sub-rows omit the spanned columns",
    second.length === 1 && second[0].columnId === "reading",
    `${second.length} cells`,
  );

  // A single-row record must behave exactly as before.
  const plain = recordCells(columns as any, "gen", 0, {});
  check("a one-row record is unchanged", plain.length === 3 && plain.every((c) => c.rowSpan === undefined));
}

// ---------------------------------------------------------------------------

section("V2 authoring: deleting a column");

{
  const base: SectionConfig = {
    id: "t",
    componentType: "custom-table" as any,
    title: "T",
    order: 0,
    showInPrint: true,
    rows: 1,
    columns: ["a", "b", "c", "d"].map((id) => ({
      id,
      label: id.toUpperCase(),
      field: { id, label: id.toUpperCase(), type: "text" as any },
    })),
    cellFormulas: { row0_b: "{X.C1}", row0_c: "{X.C2}" },
    v2: {
      header: [
        {
          id: "h1",
          cells: [
            { id: "h-a", columnId: "a", label: "A", rowSpan: 2 },
            { id: "h-group", columnId: "b", label: "Group", colSpan: 3 },
          ],
        },
        {
          id: "h2",
          cells: [
            { id: "h-b", columnId: "b", label: "B" },
            { id: "h-c", columnId: "c", label: "C" },
            { id: "h-d", columnId: "d", label: "D" },
          ],
        },
      ],
      columnUnits: { c: { options: ["Ω", "kΩ"], default: "Ω", scope: "column" } },
    },
  };

  const updates = removeColumn(base, "c");
  const after: SectionConfig = { ...base, ...updates } as SectionConfig;

  check("the column is gone", after.columns!.length === 3);
  check(
    "a cell spanning across it gets one narrower",
    after.v2!.header![0].cells.find((c) => c.id === "h-group")?.colSpan === 2,
    String(after.v2!.header![0].cells.find((c) => c.id === "h-group")?.colSpan),
  );
  check(
    "the header cell anchored to it is gone",
    !after.v2!.header![1].cells.some((c) => c.columnId === "c"),
  );
  check(
    "the grid is still fully covered",
    resolveGrid(after.v2!.header!, overlayColumns(after), { regionLabel: "header" })
      .problems.length === 0,
    resolveGrid(after.v2!.header!, overlayColumns(after), { regionLabel: "header" })
      .problems.map((p) => p.message).join("; "),
  );
  check(
    "per-cell formulas keyed by it are dropped",
    after.cellFormulas!.row0_c === undefined && after.cellFormulas!.row0_b === "{X.C1}",
  );
  check("its unit selector is dropped", after.v2!.columnUnits!.c === undefined);
}

{
  // Deleting the column a merged heading is anchored to should move the
  // heading rather than lose it.
  const base: SectionConfig = {
    id: "t2",
    componentType: "custom-table" as any,
    title: "T",
    order: 0,
    showInPrint: true,
    rows: 1,
    columns: ["a", "b", "c"].map((id) => ({
      id,
      label: id,
      field: { id, label: id, type: "text" as any },
    })),
    v2: {
      header: [
        {
          id: "h1",
          cells: [{ id: "g", columnId: "a", label: "Group", colSpan: 3 }],
        },
      ],
    },
  };

  const after: SectionConfig = { ...base, ...removeColumn(base, "a") } as SectionConfig;
  const group = after.v2!.header![0].cells.find((c) => c.id === "g");
  check("the heading survives", group !== undefined);
  check("it re-anchors to the next column", group?.columnId === "b", String(group?.columnId));
  check("it gets one narrower", group?.colSpan === 2, String(group?.colSpan));
}

{
  // A records row naming the column as spanning must forget it.
  const base: SectionConfig = {
    id: "t3",
    componentType: "custom-table" as any,
    title: "T",
    order: 0,
    showInPrint: true,
    rows: 1,
    columns: ["a", "b"].map((id) => ({
      id,
      label: id,
      field: { id, label: id, type: "text" as any },
    })),
    v2: {
      body: [
        {
          id: "r",
          kind: "records",
          policy: {
            initial: 1, min: 1, max: 5,
            allowAdd: true, allowRemove: true, allowReorder: false, allowCopy: false,
            rowsPerRecord: 2, spanningColumns: ["a", "b"],
          },
        },
      ],
    },
  };
  const after: SectionConfig = { ...base, ...removeColumn(base, "a") } as SectionConfig;
  const policy = (after.v2!.body![0] as any).policy;
  check(
    "a deleted column stops being listed as spanning",
    policy.spanningColumns.join(",") === "b",
    policy.spanningColumns.join(","),
  );
}

// ---------------------------------------------------------------------------

// Phase 6 conversion pilots. Each asserts internally and throws on the first
// failure, so it counts as one check here; its own output lists the detail.
section("Phase 6 conversion: Low Voltage Switch");
let conversionChecks = 0;
let conversionFailures = 0;
try {
  await runLowVoltageSwitchRegression();
  conversionChecks += 1;
} catch (error) {
  conversionChecks += 1;
  conversionFailures += 1;
  console.log(`  FAIL  Low Voltage Switch conversion\n        ${(error as Error).message}`);
}

const total = checks + expressionCheckCount + renderCheckCount + conversionChecks;
const failed = failures + renderFailureCount + conversionFailures;
console.log(
  `\n${total - failed}/${total} checks passed (${expressionCheckCount} expression, ${checks} V1/V2, ${renderCheckCount} render, ${conversionChecks} conversion)${failed ? `, ${failed} FAILED` : ""}`,
);
process.exit(failed > 0 ? 1 : 0);
