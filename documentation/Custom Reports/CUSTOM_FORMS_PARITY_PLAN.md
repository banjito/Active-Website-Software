# Custom Form Builder: Report Parity Plan

**Question this answers:** what has to be built before the Custom Form Builder can recreate
*any* report in `src/components/reports/`, so that hard-coded report files stop being the only
way to ship a new test form.

**Status today:** the plumbing is done and roughly half to two-thirds of the ~58 routed reports
can be rebuilt faithfully. The rest are blocked on a short list of missing builder features,
documented below with the code that has to change.

Related docs:
- `src/components/reports/CUSTOM-FORM-BUILDER-REPLICATION.md` - the operational playbook for
  actually building a template from a report file.
- `documentation/Custom Reports/CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md`
- `src/docs/content/custom-forms/` - the in-app user-facing docs.

---

## 1. What already works

Do not rebuild any of this. It is in place and proven by the `3-LowVoltageCableATS` template
(id `07ec77ea-a4dc-486e-bf73-70cab69fef75`, 26-column Electrical Tests table with 10
temperature-corrected columns).

| Report part | Where it lives |
|---|---|
| Print header: logo, title, NETA section, PASS/FAIL badge | `CustomFormFiller.tsx:1658` |
| Job Information incl. temp F/C, TCF, humidity; exposes `{JD.tcf}` | `job-info` component |
| Nameplate / equipment data strips | `nameplate-data`, `extended-nameplate`, `custom-table` |
| Visual & Mechanical Inspection checklists | `visual-inspection` |
| Wide reading tables with 20 C corrected columns | column `cellBehavior: 'calculate'` + `{ETI.C5}*{JD.tcf}` |
| Test Equipment Used with calibration lookup | `test-equipment` + `EquipmentAutocomplete` |
| Comments, custom text, conditional (dropdown-driven) tables | `comments`, `custom-text`, `conditional-table` |
| Per-cell populate-from-another-field | `formCellResolution.ts` `getPopulatedValue` |
| Above-table fields (Test Voltage, Duration) | `SectionConfig.aboveTableFields` |
| Per-table print margins and row height | `SectionConfig.printLayout` |
| Save / autosave, asset row creation, job link | `CustomFormFiller.tsx:622` (`custom-form:` file_url) |
| Photos | `ReportPhotosButton` |
| Approval workflow, deliverables, publish gating | shared `assets` flow, `is_published` |

35 components ship in `src/lib/customForms/componentLibrary.ts`.

---

## 2. Blockers, in priority order

Each item lists what is missing, why it matters, and the files that change. Note that **table
markup is rendered in four places** and every table-model change has to be made in all four:

1. `src/components/customForms/FormCanvas.tsx` (builder canvas)
2. `src/components/customForms/FormPreview.tsx` (builder preview pane)
3. `src/pages/CustomFormPreview.tsx` (standalone template preview)
4. `src/components/customForms/CustomFormFiller.tsx` (the real form, and print/PDF)

Consolidating these into one shared table renderer is worth doing as part of item 2.1, and would
pay for itself across every later item.

### 2.1 Grouped / multi-row table headers  (P0, largest blocker)

**Missing:** the filler renders exactly one flat header row
(`CustomFormFiller.tsx:1442`). There is no way to express a header cell that spans columns.

**Why it matters:** 46 of 63 report files use `colSpan` inside a `<thead>`. Example:
`LowVoltageSwitchReport.tsx:1705` puts "Rated" above a pair of Amperage / Voltage columns.
Without this, every one of those tables has to be flattened into long single-line column names,
which is the single biggest reason a rebuilt template does not look like the original.

**Work:**
- Add to `SectionConfig` in `src/lib/types/customForms.ts`:
  ```ts
  /** One entry per header row, top row first. */
  headerRows?: Array<Array<{
    id: string;
    label: string;
    /** ids of the columns this cell spans, in order */
    columnIds: string[];
  }>>;
  ```
  Modeling it as an array of header rows (rather than one level) covers the two-level and
  three-level headers that appear in the breaker and transformer reports.
- Render: emit one `<tr>` per header row, `<th colSpan>` per group, and a `rowSpan` on columns
  not covered by any group so they occupy the full header height.
- Builder UI in `SectionEditor.tsx`: a "Header groups" block above the Columns accordion. Select
  contiguous columns, name the group. Validate that group column sets are contiguous and
  non-overlapping.
- Print CSS must repeat grouped headers across page breaks (`thead { display: table-header-group }`).

**Acceptance:** rebuild the switch data table from `LowVoltageSwitchReport.tsx` and have the
printed output match the original header structure.

**Effort:** large. Touches the type, four renderers, the section editor, and print CSS.

### 2.2 Formula engine: comparisons, functions, and text output  (P0)

**Missing:** `safeEvalNumeric` in `src/lib/customForms/formCellResolution.ts:230` accepts only
digits, `+ - * / ( ) . ,` and `round()`. It returns a number or nothing. There is no `min`,
`max`, `abs`, no conditional, and no way to produce text.

**Why it matters, concretely:**
- A computed **PASS / FAIL** cell is impossible. Reports like
  `LowVoltageCircuitBreakerElectronicTripATSReport.tsx` (7,561 lines) carry
  `toleranceMin` / `toleranceMax` per row and colour the result. In a custom form the technician
  gets a manual dropdown instead, which loses the check entirely.
- Percent deviation from an average cannot be written. There is a hardcoded `showDeviation`
  flag on `contact-resistance` for the single built-in case, and nothing general.
- Min/max windows on trip times, ratio error checks, and "within X percent" rules all fail.

**Work:**
- Extend the evaluator with a whitelisted function set: `min`, `max`, `abs`, `avg`, `sqrt`,
  `round`, and an `if(cond, a, b)`. Keep the regex allow-list approach rather than introducing a
  general expression library, so nothing arbitrary can be evaluated.
- Add comparison operators (`< <= > >= == !=`) returning 1/0 so `if()` works.
- Allow a formula to return a **string** result. New `cellBehavior` value or a
  `resultType: 'number' | 'text'` on the column, so `if({ETI.C5} > {ETI.C6}, "FAIL", "PASS")`
  renders text. Preserve the existing comparison-prefix behaviour (`<`, `>`) from
  `detectRefPrefix`.
- Add a **column range reference** so aggregate math is writable, e.g. `{ETI.C5.R*}` for a whole
  column, feeding `avg()` and `max()`.
- Add conditional cell styling driven by the result value (green/red), matching
  `getPassFailBadgeClass` used by hard-coded reports.
- Builder UI: a formula editor with the function list and live validation, replacing the plain
  textarea. Bad formulas currently fail silently to empty string, which is the top source of
  build mistakes noted in the replication playbook.

**Acceptance:** rebuild one trip-test table where the Result column computes itself from the
reading and the tolerance columns, and shows red on FAIL.

**Effort:** medium for the evaluator, medium for the builder UI.

### 2.3 Signature field  (P1)

**Missing:** no signature `FieldType`.

**Why it matters:** `MediumVoltageVLFReport.tsx`, `MediumVoltageVLFMTSReport.tsx` and
`JobHazardAnalysisForm.tsx` require signatures. A JHA without a signature block is not a usable
document.

**Work:** add `FieldType.SIGNATURE`, a canvas-based capture component, store the data URL in the
instance `data` JSON (or upload to storage and store the path if size becomes a problem), and
render the image in preview and print. Add a `signature-block` section component with
name / title / date / signature so the common case is one drag.

**Effort:** small to medium.

### 2.4 Chart component  (P1)

**Missing:** no chart section type.

**Why it matters:** four reports plot data with recharts and cannot be represented at all:
`TanDeltaChart.tsx`, `TanDeltaChartMTS.tsx`, `TanDeltaTestMTSForm.tsx`,
`GroundingFallOfPotentialSlopeMethodTest.tsx`.

**Work:** add a `chart` component whose config points at a table section, an X column, and one
or more Y columns, plus axis labels and chart type (line / scatter). Render with recharts, which
is already a dependency. Must render correctly in print (fixed pixel size, no
`ResponsiveContainer` in the print path).

**Effort:** medium.

### 2.5 Lookup tables and interpolation  (P1)

**Missing:** TCF is built in and works. Nothing else is.

**Why it matters:** `MediumVoltageVLFReport.tsx:470` interpolates a temperature-factor table that
is not the TCF table. Breaker trip-curve limits come from per-model tables. These cannot be
expressed as arithmetic.

**Work:** a reusable **lookup table** object on the template (name, key column, value columns,
rows), plus formula functions `lookup(tableName, key, column)` and
`interp(tableName, key, column)` for linear interpolation between bracketing rows. Editable in
the builder as a small grid, and shareable across templates via the saved-components mechanism
in `src/lib/customForms/savedComponents.ts`.

**Effort:** medium. Depends on 2.2.

### 2.6 Per-table unit selectors  (P2)

**Missing:** `FieldConfig` already carries `unit` and `unitOptions`, and `UNIT_OPTIONS` is
defined in the types file, but no renderer surfaces a unit dropdown in a table header.

**Why it matters:** 12 reports put a units dropdown (ohms / milliohms / microohms,
gigaohms / megaohms) in or beside the table header. The workaround today is a units column or an
above-table field, which reads differently from the original.

**Work:** render a select in the header cell when a column defines `unitOptions`; store the
choice once per table, not per row; include it in print output.

**Effort:** small.

### 2.7 As Found / As Left paired tables  (P2)

**Missing:** no way to declare a table as a pair.

**Why it matters:** 15 reports carry As Found / As Left pairs. Today they must be built twice by
hand, and the two copies drift when columns are edited.

**Work:** a `pairedWith` marker (or a `duplicateAs: ['As Found', 'As Left']` flag) that renders
two tables sharing one column definition, with a "copy As Found to As Left" button in the filler.
The existing `rowCountLinkGroupId` is the precedent for linked sections.

**Effort:** small to medium.

### 2.8 Dynamic device / row groups  (P2)

**Missing:** repeating a whole section group N times.

**Why it matters:** `LowVoltageSwitchMultiDeviceTest.tsx` (4,299 lines) lets the technician add a
device, which repeats an entire block of tables. `conditional-table` handles dropdown-driven row
and column visibility, which covers some but not all of this.

**Work:** a "repeatable group" wrapper around a set of sections with add / remove, numbered
headings, and per-instance data keys.

**Effort:** large. Do this last; it affects only a handful of reports.

### 2.9 Print controls  (P2)

**Missing:** only a global `settings.pageBreakAfterSection` boolean.

**Work:** per-section `pageBreakBefore` / `pageBreakAfter`, per-section landscape orientation, and
a "keep together" flag so a table is not split mid-body. Also audit that custom form print CSS is
scoped and removed on unmount, given the known issue where 28 hard-coded reports inject unscoped
`@media print` CSS into `<head>` and never clean it up.

**Effort:** small.

---

## 3. Bugs to fix regardless

- **`LIMITED SERVICE` status cannot be saved.** `CustomFormFiller.tsx:67` offers
  `"PASS" | "FAIL" | "LIMITED SERVICE"`, but the DB constraint is
  `custom_form_instances_status_check CHECK (status IN ('PASS','FAIL'))`
  (`database/bootstrap/02_schema.sql:8284`, created in
  `database/migrations/create_custom_forms_tables.sql`). Selecting LIMITED SERVICE fails the
  write. Fix with a migration widening the constraint, matching what
  `gfi_trip_test_reports` already does.
- **Four divergent table renderers.** Canvas, builder preview, standalone preview, and filler
  each render tables independently, so a fix in one silently misses the print output. Extract a
  shared renderer before starting item 2.1.
- **Formulas fail silently.** An unparseable formula returns `""` with no warning anywhere in the
  builder. Surface validation errors in `SectionEditor.tsx`.

---

## 4. Suggested sequencing

| Phase | Contents | Unlocks |
|---|---|---|
| 0 | Section 3 bugs, extract shared table renderer | prevents rework in every later phase |
| 1 | 2.1 grouped headers, 2.2 formula engine | moves most Tier B reports to faithful; the two items together are the bulk of the value |
| 2 | 2.3 signatures, 2.6 unit selectors, 2.9 print controls | small items, high visual fidelity return |
| 3 | 2.4 charts, 2.5 lookup tables | unlocks VLF, Tan Delta, grounding slope, trip curves |
| 4 | 2.7 As Found / As Left, 2.8 repeatable groups | the long tail |

After phase 1, expect the majority of the report catalogue to be rebuildable without visible
compromise. Phases 3 and 4 are what "any report" actually requires.

---

## 5. Report tiers

Buckets below come from grepping `src/components/reports/*.tsx`. A per-report pass is still
needed to place every file precisely, but the shape is clear.

**Tier A - buildable today, faithful.** Cable ATS/MTS, most insulation-resistance style reports,
switch and switchgear visual + IR reports. Pattern proven by `3-LowVoltageCableATS`.

**Tier B - buildable now with visible compromises, faithful after phase 1.** Anything whose only
gaps are flattened grouped headers or a manual result dropdown where the original computed the
result. Most transformer and CT/PT reports.

**Tier C - not buildable until phases 3 and 4.**
- Charts: `TanDeltaChart.tsx`, `TanDeltaChartMTS.tsx`, `TanDeltaTestMTSForm.tsx`,
  `GroundingFallOfPotentialSlopeMethodTest.tsx`
- Signatures plus non-TCF interpolation: `MediumVoltageVLFReport.tsx`,
  `MediumVoltageVLFMTSReport.tsx`
- Signatures plus heavy layout: `JobHazardAnalysisForm.tsx`
- Tolerance math: the electronic-trip and thermal-magnetic breaker family
  (`LowVoltageCircuitBreakerElectronicTrip*`, `LowVoltageCircuitBreakerThermalMagnetic*`,
  `LVMoldedCaseCircuitBreakerATS25Report.tsx`, `LVCircuitBreakerMTS25Report.tsx`,
  `GFITripTestReport.tsx`)
- Repeatable device groups: `LowVoltageSwitchMultiDeviceTest.tsx`

**Definition of "operational":** a new NETA test form can be created end to end in the builder,
by a non-developer, with output that matches the hard-coded equivalent in structure, computed
values, and print layout, and no new `src/components/reports/*.tsx` file is required.
