# Report conversion matrix

Phase 6 starting inventory. **Certified: NO for every report below — 0 of 59.** A draft or a successful structural check is not full report certification. Keep every hard-coded route and historical report available.

## Scope and counts

Derived from the static and lazy report imports and actual route elements in [`src/App.tsx`](../../src/App.tsx), grouped by implementation file, not display name. This is the routed report catalogue, not every page with “report” in its name. See the plan's [inventory](CUSTOM_FORMS_PARITY_PLAN.md#4-verified-report-inventory) and [Phase 6](CUSTOM_FORMS_PARITY_PLAN.md#L1484).

| Measure | Verified count |
|---|---:|
| Canonical implementations (one per matrix row) | 59 |
| Distinct route slugs | 63 |
| Additional slug aliases sharing an implementation | 4 |
| Additional substation route patterns using existing slugs | 4 |
| Distinct full route patterns | 67 |
| Report route declarations, including two duplicates | 69 |
| Top-level report `.tsx` / `.jsx` files | 65 = 59 routed + 6 unrouted |
| Conversion states | 48 not started; 3 pilot draft; 8 blocked |
| Certified reports | **0** |

**All rows:** qualified domain review, live persistence/reload/autosave, approval and locking, production PDF, deliverables and customer access remain **unverified** for the custom conversion. No approved immutable template version or route cutover is certified here. These shared release gates do not automatically make every unstarted draft “blocked”; see [Phase 5](CUSTOM_FORMS_PARITY_PLAN.md#L1449) and the [conversion checklist](CUSTOM_FORMS_PARITY_PLAN.md#18-report-conversion-checklist).

States:
- **not started** — no Phase 6 report draft/check evidence recorded here; not a claim that the source report is simple or all prerequisites are ready.
- **pilot draft** — checked structures or coordinated draft work only, never full certification.
- **blocked** — a named report-specific requirement has a concrete unresolved plan gate, identified below.

## Evidence and named blockers

- **P1 — cable pilot:** [`scripts/custom-forms-conversion.tsx`](../../scripts/custom-forms-conversion.tsx#L255), for `3-LowVoltageCableMTS`. The [Phase 2 note](CUSTOM_FORMS_PARITY_PLAN.md#L1188) records 30 structural/render checks. Durable live saves and full report behavior are not established by these checks.
- **P2 — transformer pilot:** [same diagnostic](../../scripts/custom-forms-conversion.tsx#L411), assigned here to `DryTypeTransformerReport`. The [plan](CUSTOM_FORMS_PARITY_PLAN.md#L1256) records 12 further checks (42 across both pilots). This is selected nameplate/radio/insulation-table structure, not a complete certified report. The diagnostic's “ATS 25” label does **not** establish conversion of the separately routed `SmallLowVoltageDryTypeTransformerATS25Report`. These existing diagnostic results were read, not rerun for this documentation task; the [script explicitly reports gaps without failing the main harness](../../scripts/custom-forms-conversion.tsx#L1).
- **P3 — switch conversion:** deterministic `LowVoltageSwitchReport` conversion in [`src/lib/customForms/conversions/low-voltage-switch.ts`](../../src/lib/customForms/conversions/low-voltage-switch.ts), with its own [regression](../../src/lib/customForms/conversions/low-voltage-switch.regression.tsx) now run by the main harness. It is registered in [`conversions/index.ts`](../../src/lib/customForms/conversions/index.ts), so "Generate template from a report" uses it instead of the AI and labels it *Tested conversion*. Still **not certified**: its `LOW_VOLTAGE_SWITCH_GAPS` list names the engineering, browser/PDF and host-workflow review outstanding, including the source's ATS 7.6.1.2 heading against 7.5.1.1.A.* criteria.
- **C — charts:** the five reports named by the [inventory](CUSTOM_FORMS_PARITY_PLAN.md#L185) need declarative charts with deterministic screen/production-PDF output. [Phase 4](CUSTOM_FORMS_PARITY_PLAN.md#L1425) leaves this gate open; it explicitly names `GroundingFallOfPotentialSlopeMethodTest` for acceptance.
- **S — signatures:** `JobHazardAnalysisForm` and `EnergizedWorkPermitForm` need required signer roles, stored/audited attestations, approval locking and amendment behavior. [Phase 4 acceptance](CUSTOM_FORMS_PARITY_PLAN.md#L1440) and [signature requirements](CUSTOM_FORMS_PARITY_PLAN.md#L917) remain open. VLF signature-shaped data properties alone are **not** evidence of rendered signature controls or a signature blocker.
- **R — repeaters:** `LowVoltageSwitchMultiDeviceTest` needs repeatable **complete device groups**, with durable IDs, scoped calculations and add/save/reopen/print/remove behavior. This is the named [Phase 4 exit gate](CUSTOM_FORMS_PARITY_PLAN.md#L1442), not merely ordinary table rows.
- **V — VLF engineer curve pending:** the interpolation mechanism is not a verified engineering curve. [Phase 3](CUSTOM_FORMS_PARITY_PLAN.md#L1407) requires engineer-signed curve data and verified expected values; the [named acceptance fixture](CUSTOM_FORMS_PARITY_PLAN.md#L1521) is `MediumVoltageCableVLFTest` (both ATS/MTS route slugs). No VLF report's numerical/domain behavior is certified. Do not infer an extra chart/signature blocker for the other VLF reports just from unused data properties. Breaker tolerance fixtures likewise do not certify full breaker acceptance or their thresholds ([Phase 3](CUSTOM_FORMS_PARITY_PLAN.md#L1401)).

## Canonical reports and aliases

Implementation names link to source. Route links point to their actual `App.tsx` declarations. A normal slug expands to `/jobs/:id/<slug>/:reportId?`. **Substation** means `/jobs/:id/<same-slug>/:substation/:reportId` (required report ID). “Primary” is the first normal route for that implementation in `App.tsx`, a documentation convention, not a new routing decision. `—` means no additional alias or no report-specific evidence recorded, not “verified”.

| Canonical implementation | Primary route slug | Aliases / additional route patterns | State | Evidence / blocker |
|---|---|---|---|---|
| [12-CurrentTransformerTestATSReport](../../src/components/reports/12-CurrentTransformerTestATSReport.tsx) | [12-current-transformer-test-ats-report](../../src/App.tsx#L2621) | — | not started | — |
| [12-CurrentTransformerTestMTSReport](../../src/components/reports/12-CurrentTransformerTestMTSReport.tsx) | [12-current-transformer-test-mts-report](../../src/App.tsx#L2913) | — | not started | — |
| [12setslowvoltagecables](../../src/components/reports/12setslowvoltagecables.tsx) | [low-voltage-cable-test-12sets](../../src/App.tsx#L2370) | — | not started | — |
| [13-VoltagePotentialTransformerTestMTSReport](../../src/components/reports/13-VoltagePotentialTransformerTestMTSReport.tsx) | [13-voltage-potential-transformer-test-mts-report](../../src/App.tsx#L2933) | — | not started | — |
| [23-MediumVoltageMotorStarterMTSReport](../../src/components/reports/23-MediumVoltageMotorStarterMTSReport.tsx) | [23-medium-voltage-motor-starter-mts-report](../../src/App.tsx#L2945) | — | not started | — |
| [23-MediumVoltageSwitchMTSReport](../../src/components/reports/23-MediumVoltageSwitchMTSReport.tsx) | [23-medium-voltage-switch-mts-report](../../src/App.tsx#L2955) | — | not started | — |
| [3-LowVoltageCableATS](../../src/components/reports/3-LowVoltageCableATS.tsx) | [low-voltage-cable-test-3sets-ats](../../src/App.tsx#L2390) | — | not started | Existing V1 example is not P1 or a certified V2 conversion. |
| [3-LowVoltageCableMTS](../../src/components/reports/3-LowVoltageCableMTS.tsx) | [low-voltage-cable-test-3sets](../../src/App.tsx#L2380) | — | pilot draft | P1 |
| [6-LowVoltageSwitchMaintMTSReport](../../src/components/reports/6-LowVoltageSwitchMaintMTSReport.tsx) | [6-low-voltage-switch-maint-mts-report](../../src/App.tsx#L2581) | — | not started | — |
| [AppliedVoltageTestATSReport](../../src/components/reports/AppliedVoltageTestATSReport.tsx) | [applied-voltage-test-ats-report](../../src/App.tsx#L2999) | [Substation](../../src/App.tsx#L2989) | not started | — |
| [AutomaticTransferSwitchATSReport](../../src/components/reports/AutomaticTransferSwitchATSReport.tsx) | [automatic-transfer-switch-ats-report](../../src/App.tsx#L2697) | — | not started | — |
| [CableHiPotReport](../../src/components/reports/CableHiPotReport.tsx) | [cable-hipot-test-report](../../src/App.tsx#L2649) | — | not started | — |
| [CurrentTransformerTestATSReport](../../src/components/reports/CurrentTransformerTestATSReport.tsx) | [current-transformer-test-ats-report](../../src/App.tsx#L2611) | — | not started | Separate from the 12-CT implementation. |
| [DryTypeTransformerReport](../../src/components/reports/DryTypeTransformerReport.tsx) | [dry-type-transformer](../../src/App.tsx#L2270) | — | pilot draft | P2 |
| [EmergencySystemsEngineGeneratorATS25Report](../../src/components/reports/EmergencySystemsEngineGeneratorATS25Report.tsx) | [emergency-systems-engine-generator-ats25](../../src/App.tsx#L2571) | — | not started | — |
| [EnergizedWorkPermitForm](../../src/components/reports/EnergizedWorkPermitForm.tsx) | [energized-work-permit-form](../../src/App.tsx#L2807) | — | blocked | S — attestation roles, audit and locking. |
| [GFITripTestReport](../../src/components/reports/GFITripTestReport.tsx) | [gfi-trip-test-report](../../src/App.tsx#L2977) | [Substation](../../src/App.tsx#L2967) | not started | — |
| [GroundingFallOfPotentialSlopeMethodTest](../../src/components/reports/GroundingFallOfPotentialSlopeMethodTest.tsx) | [grounding-fall-of-potential-slope-method-test](../../src/App.tsx#L2250) | [Substation](../../src/App.tsx#L2240) | blocked | C — chart screen/PDF agreement. |
| [GroundingSystemMaster](../../src/components/reports/GroundingSystemMaster.tsx) | [grounding-system-master](../../src/App.tsx#L2229) | [Substation](../../src/App.tsx#L2219) | not started | — |
| [JobHazardAnalysisForm](../../src/components/reports/JobHazardAnalysisForm.tsx) | [job-hazard-analysis-form](../../src/App.tsx#L2795) | — | blocked | S — required signatures and locking. |
| [LargeDryTypeTransformerMTSReport](../../src/components/reports/LargeDryTypeTransformerMTSReport.tsx) | [large-dry-type-transformer-mts-report](../../src/App.tsx#L2300) | — | not started | — |
| [LargeDryTypeTransformerReport](../../src/components/reports/LargeDryTypeTransformerReport.tsx) | [large-dry-type-transformer](../../src/App.tsx#L2280) | [large-dry-type-transformer-report](../../src/App.tsx#L2290) | not started | — |
| [LargeDryTypeXfmrMTSReport](../../src/components/reports/LargeDryTypeXfmrMTSReport.tsx) | [large-dry-type-xfmr-mts-report](../../src/App.tsx#L2310) | — | not started | Separate from LargeDryTypeTransformerMTSReport. |
| [LiquidFilledTransformerReport](../../src/components/reports/LiquidFilledTransformerReport.tsx) | [liquid-filled-transformer](../../src/App.tsx#L2320) | — | not started | — |
| [LiquidFilledXfmrATS25Report](../../src/components/reports/LiquidFilledXfmrATS25Report.tsx) | [liquid-filled-xfmr-ats25](../../src/App.tsx#L2737) | — | not started | — |
| [LiquidXfmrVisualMTSReport](../../src/components/reports/LiquidXfmrVisualMTSReport.tsx) | [liquid-xfmr-visual-mts-report](../../src/App.tsx#L2819) | — | not started | — |
| [LowVoltageCircuitBreakerElectronicTripATSReport](../../src/components/reports/LowVoltageCircuitBreakerElectronicTripATSReport.tsx) | [low-voltage-circuit-breaker-electronic-trip-ats-report](../../src/App.tsx#L2500) | — | not started | Narrow tolerance fixture only; full acceptance unverified. |
| [LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport](../../src/components/reports/LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport.tsx) | [low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report](../../src/App.tsx#L2490) | — | not started | — |
| [LowVoltageCircuitBreakerElectronicTripMTSReport](../../src/components/reports/LowVoltageCircuitBreakerElectronicTripMTSReport.tsx) | [low-voltage-circuit-breaker-electronic-trip-mts-report](../../src/App.tsx#L2510) | — | not started | — |
| [LowVoltageCircuitBreakerThermalMagneticATSReport](../../src/components/reports/LowVoltageCircuitBreakerThermalMagneticATSReport.tsx) | [low-voltage-circuit-breaker-thermal-magnetic-ats-report](../../src/App.tsx#L2520) | — | not started | — |
| [LowVoltageCircuitBreakerThermalMagneticMTSReport](../../src/components/reports/LowVoltageCircuitBreakerThermalMagneticMTSReport.tsx) | [low-voltage-circuit-breaker-thermal-magnetic-mts-report](../../src/App.tsx#L2530) | — | not started | — |
| [LowVoltagePanelboardSmallBreakerTestATSReport](../../src/components/reports/LowVoltagePanelboardSmallBreakerTestATSReport.tsx) | [low-voltage-panelboard-small-breaker-report](../../src/App.tsx#L2591) | — | not started | — |
| [LowVoltageSwitchMultiDeviceTest](../../src/components/reports/LowVoltageSwitchMultiDeviceTest.tsx) | [low-voltage-switch-multi-device-test](../../src/App.tsx#L2460) | — | blocked | R — complete device groups, durable save/reopen/print. |
| [LowVoltageSwitchReport](../../src/components/reports/LowVoltageSwitchReport.tsx) | [low-voltage-switch-report](../../src/App.tsx#L2470) | — | pilot draft | P3 — tested hand-built conversion, wired into Generate; review gaps listed, not certified. |
| [LVCircuitBreakerMTS25Report](../../src/components/reports/LVCircuitBreakerMTS25Report.tsx) | [lv-circuit-breaker-mts](../../src/App.tsx#L2550) | [lv-circuit-breaker-mts25](../../src/App.tsx#L2561) (legacy) | not started | — |
| [LVMoldedCaseCircuitBreakerATS25Report](../../src/components/reports/LVMoldedCaseCircuitBreakerATS25Report.tsx) | [lv-molded-case-circuit-breaker-ats25](../../src/App.tsx#L2540) | — | not started | — |
| [MediumVoltageCableVLFTest](../../src/components/reports/MediumVoltageCableVLFTest.jsx) | [medium-voltage-cable-vlf-test](../../src/App.tsx#L2440) | [medium-voltage-cable-vlf-test-mts](../../src/App.tsx#L2891) | blocked | C + V — charts and engineer-verified VLF curve. Both slugs share this JSX implementation. |
| [MediumVoltageCircuitBreakerMTSReport](../../src/components/reports/MediumVoltageCircuitBreakerMTSReport.tsx) | [medium-voltage-circuit-breaker-mts-report](../../src/App.tsx#L2901) | — | not started | — |
| [MediumVoltageCircuitBreakerReport](../../src/components/reports/MediumVoltageCircuitBreakerReport.tsx) | [medium-voltage-circuit-breaker-report](../../src/App.tsx#L2601) | — | not started | — |
| [MediumVoltageSwitchOilReport](../../src/components/reports/MediumVoltageSwitchOilReport.tsx) | [medium-voltage-switch-oil-report](../../src/App.tsx#L2340) | [mv-switch-oil](../../src/App.tsx#L2480) | not started | — |
| [MediumVoltageSwitchSF6Report](../../src/components/reports/MediumVoltageSwitchSF6Report.tsx) | [medium-voltage-switch-sf6-report](../../src/App.tsx#L2350) | — | not started | — |
| [MediumVoltageVLFMTSReport](../../src/components/reports/MediumVoltageVLFMTSReport.tsx) | [medium-voltage-vlf-mts-report](../../src/App.tsx#L2430) | — | not started | VLF engineering review remains unverified. |
| [MediumVoltageVLFReport](../../src/components/reports/MediumVoltageVLFReport.tsx) | [medium-voltage-vlf](../../src/App.tsx#L2420) | — | not started | VLF engineering review remains unverified. |
| [MetalEnclosedBuswayReport](../../src/components/reports/MetalEnclosedBuswayReport.tsx) | [metal-enclosed-busway](../../src/App.tsx#L2450) | — | not started | — |
| [OilAnalysisReport](../../src/components/reports/OilAnalysisReport.tsx) | [oil-analysis-report](../../src/App.tsx#L2639) | — | not started | — |
| [OilInspectionReport](../../src/components/reports/OilInspectionReport.tsx) | [oil-inspection](../../src/App.tsx#L2330) | — | not started | — |
| [PanelboardAssembliesATS25Report](../../src/components/reports/PanelboardAssembliesATS25Report.tsx) | [panelboard-assemblies-ats25](../../src/App.tsx#L2717) | — | not started | — |
| [PanelboardReport](../../src/components/reports/PanelboardReport.tsx) | [panelboard-report](../../src/App.tsx#L2260) | — | not started | — |
| [PotentialTransformerATSReport](../../src/components/reports/PotentialTransformerATSReport.tsx) | [potential-transformer-ats-report](../../src/App.tsx#L2360) | — | not started | — |
| [RelayTestReport](../../src/components/reports/RelayTestReport.tsx) | [relay-test-report](../../src/App.tsx#L2687) | — | not started | — |
| [SmallLowVoltageDryTypeTransformerATS25Report](../../src/components/reports/SmallLowVoltageDryTypeTransformerATS25Report.tsx) | [small-lv-dry-type-transformer-ats25](../../src/App.tsx#L2727) | — | not started | Separate routed implementation; do not inherit P2. |
| [SwitchgearPanelboardMTSReport](../../src/components/reports/SwitchgearPanelboardMTSReport.tsx) | [switchgear-panelboard-mts-report](../../src/App.tsx#L2783) | — | not started | — |
| [SwitchgearReport](../../src/components/reports/SwitchgearReport.tsx) | [switchgear-report](../../src/App.tsx#L2208) | — | not started | — |
| [SwitchgearSwitchboardAssembliesATS25Report](../../src/components/reports/SwitchgearSwitchboardAssembliesATS25Report.tsx) | [switchgear-switchboard-assemblies-ats25](../../src/App.tsx#L2707) | — | not started | — |
| [TanDeltaChart](../../src/components/reports/TanDeltaChart.tsx) | [medium-voltage-vlf-tan-delta](../../src/App.tsx#L2400) | — | blocked | C — deterministic chart output. |
| [TanDeltaChartMTS](../../src/components/reports/TanDeltaChartMTS.tsx) | [medium-voltage-vlf-tan-delta-mts](../../src/App.tsx#L2410) | — | blocked | C — deterministic chart output. |
| [TanDeltaTestMTSForm](../../src/components/reports/TanDeltaTestMTSForm.tsx) | [electrical-tan-delta-test-mts-form](../../src/App.tsx#L2879) | — | blocked | C — deterministic chart output. |
| [TwoSmallDryTyperXfmrATSReport](../../src/components/reports/TwoSmallDryTyperXfmrATSReport.tsx) | [two-small-dry-typer-xfmr-ats-report](../../src/App.tsx#L2839) | — | not started | — |
| [TwoSmallDryTyperXfmrMTSReport](../../src/components/reports/TwoSmallDryTyperXfmrMTSReport.tsx) | [two-small-dry-typer-xfmr-mts-report](../../src/App.tsx#L2859) | — | not started | — |

## Inventory discrepancies (recorded, not changed)

- **59/63 is confirmed only as implementations/slugs.** It is not the full route-pattern count. Four substation variants make 67 unique patterns. The ordinary `current-transformer-test-ats-report` route is declared at [2611](../../src/App.tsx#L2611) and [2659](../../src/App.tsx#L2659); `12-current-transformer-test-ats-report` at [2621](../../src/App.tsx#L2621) and [2669](../../src/App.tsx#L2669). Each duplicate renders the same implementation, so neither is another alias or canonical report.
- [`reportMappings.ts`](../../src/components/reports/reportMappings.ts#L4) has **59 name entries**, not 59 implementations: 58 match routed slugs; `low-voltage-cable-test-20sets` has **no actual route**. Five actual slugs have no name entry: `low-voltage-cable-test-3sets-ats`, `mv-switch-oil`, `oil-analysis-report`, `cable-hipot-test-report`, `relay-test-report`. Do not invent a 20-set implementation from the name map.
- [`electron/renderer/reportRegistry.tsx`](../../electron/renderer/reportRegistry.tsx) agrees with all **63 slug-to-implementation pairs**. Its [generator](../../scripts/gen-report-registry.mjs#L48) only collects ordinary `/:reportId?` routes; it is a cross-check, not evidence of 63 full route patterns or certification. The generator was **not run** (it writes runtime files).
- The six top-level files outside the routed set are [EvaluationResultBadge](../../src/components/reports/EvaluationResultBadge.tsx), [ReportApprovalWorkflow](../../src/components/reports/ReportApprovalWorkflow.tsx), [ReportDetail](../../src/components/reports/ReportDetail.tsx), [ReportWrapper](../../src/components/reports/ReportWrapper.tsx), [SaveToAssetButton](../../src/components/reports/SaveToAssetButton.tsx), and [StandardReportTemplate](../../src/components/reports/StandardReportTemplate.tsx). They are not additional routed conversions.

## Read-only count derivation

Run from the repository root with the existing local TypeScript package. This parses source only; it does not import report implementations, generate a registry, contact services or write files. Static/lazy import matching follows the existing generator; TypeScript parses the actual JSX routes so comments are not counted as route declarations.

```sh
node <<'NODE'
const fs = require('node:fs');
const ts = require('typescript');
const text = fs.readFileSync('src/App.tsx', 'utf8');
const ast = ts.createSourceFile('src/App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = new Map();
for (const re of [
  /import\s+(\w+)\s+from\s+["'](?:@|\.)\/components\/reports\/([^"']+)["']/g,
  /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["'](?:@|\.)\/components\/reports\/([^"']+)["']/g,
]) for (const m of text.matchAll(re)) imports.set(m[1], m[2]);
const declarations = [];
function visit(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  if (tag?.tagName.getText(ast) === 'Route') {
    const attrs = new Map(tag.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(ast), a.initializer]));
    const path = attrs.get('path');
    const element = attrs.get('element');
    if (path && ts.isStringLiteral(path) && element) {
      const refs = [...element.getText(ast).matchAll(/<([A-Z]\w*)[\s/>]/g)].map(m => m[1]).filter(n => imports.has(n));
      if (refs.length > 1) throw Error('Ambiguous report route: ' + path.text);
      if (refs.length) declarations.push([path.text, imports.get(refs[0])]);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const routes = new Map();
for (const [path, file] of declarations) {
  if (routes.has(path) && routes.get(path) !== file) throw Error('Conflicting route: ' + path);
  routes.set(path, file);
}
const implementations = new Set(routes.values());
const slugs = new Set([...routes.keys()].map(path => path.split('/')[3]));
console.log({ implementations: implementations.size, slugs: slugs.size,
  paths: routes.size, declarations: declarations.length,
  slugAliases: slugs.size - implementations.size,
  substationPatterns: [...routes.keys()].filter(path => path.includes('/:substation/')).length,
  duplicateDeclarations: declarations.length - routes.size });
for (const file of [...implementations].sort()) console.log(file, [...routes].filter(([, f]) => f === file).map(([path]) => path));
NODE
```
