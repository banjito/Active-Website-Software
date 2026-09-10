/**
 * Initial electrical domain rule packs.
 *
 * ⚠️ ENGINEERING SIGN-OFF REQUIRED.
 *
 * Every pack here is marked `engineeringVerified: false`. The mechanism is
 * tested; the numbers are not certified. They were derived from the shapes
 * already present in the hard-coded reports, not from a standard anyone has
 * signed. A pack stays unverified until a qualified engineer checks its
 * thresholds against the governing NETA table and flips the flag, and the
 * compiler surfaces that state rather than hiding it.
 *
 * The builders below are parameterised precisely so a template supplies its own
 * tolerances rather than inheriting a guess. Prefer them over the ready-made
 * packs.
 */

import type { FormRule, RulePack } from "@/lib/customForms/expressions/rules";
import type {
  ExpressionResources,
  InterpolationCurve,
  LookupTable,
} from "@/lib/customForms/expressions/resources";

// ---------------------------------------------------------------------------
// Reusable formula builders
// ---------------------------------------------------------------------------

/**
 * A reading inside an inclusive window.
 *
 * Inclusive on both ends: a reading exactly on the limit passes, which is how
 * the hard-coded reports treat it. Blank stays blank rather than becoming a
 * FAIL, because "not measured" is not "measured and wrong".
 */
export function toleranceWindowFormula(args: {
  readingRef: string;
  lowRef: string;
  highRef: string;
}): string {
  return `if(isnull({${args.readingRef}}) or isnull({${args.lowRef}}) or isnull({${args.highRef}}), null, if({${args.readingRef}} >= {${args.lowRef}} and {${args.readingRef}} <= {${args.highRef}}, verdict("PASS"), verdict("FAIL")))`;
}

/** Tolerance limits from a nominal value and a percentage either side. */
export function toleranceLimitFormula(args: {
  nominalRef: string;
  percent: number;
  bound: "low" | "high";
}): string {
  const sign = args.bound === "low" ? "-" : "+";
  return `if(isnull({${args.nominalRef}}), null, {${args.nominalRef}} ${sign} {${args.nominalRef}} * ${args.percent} / 100)`;
}

/** Percentage deviation of a reading from the smallest reading in a set. */
export function deviationPercentFormula(args: {
  readingRef: string;
  setRef: string;
}): string {
  return `if(isnull({${args.readingRef}}) or isnull(min({${args.setRef}})) or min({${args.setRef}}) == 0, null, ({${args.readingRef}} - min({${args.setRef}})) / min({${args.setRef}}) * 100)`;
}

/**
 * Insulation resistance corrected to 20 °C.
 *
 * The temperature correction factor is a lookup, not arithmetic, because the
 * NETA table is not a smooth function. `tcfCurveId` interpolates between the
 * tabulated Celsius points.
 */
export function temperatureCorrectedFormula(args: {
  readingRef: string;
  celsiusRef: string;
  tcfCurveId: string;
}): string {
  return `if(isnull({${args.readingRef}}) or isnull({${args.celsiusRef}}), null, {${args.readingRef}} * interpolate("${args.tcfCurveId}", {${args.celsiusRef}}))`;
}

/** A reading at or above a minimum. */
export function minimumFormula(args: {
  readingRef: string;
  minimumRef: string;
}): string {
  return `if(isnull({${args.readingRef}}) or isnull({${args.minimumRef}}), null, if({${args.readingRef}} >= {${args.minimumRef}}, verdict("PASS"), verdict("FAIL")))`;
}

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

/**
 * Temperature correction factor against Celsius.
 *
 * ⚠️ Unverified. These are the points the existing `temperatureCorrection`
 * utility already uses; they have not been checked against the published NETA
 * table by an engineer. `outOfRange: "null"` so a reading past the tabulated
 * range refuses to answer rather than extrapolating.
 */
export const TCF_CURVE: InterpolationCurve = {
  id: "neta.tcf",
  outOfRange: "null",
  points: [
    { x: -10, y: 0.125 },
    { x: -5, y: 0.25 },
    { x: 0, y: 0.25 },
    { x: 5, y: 0.4 },
    { x: 10, y: 0.5 },
    { x: 15, y: 0.75 },
    { x: 20, y: 1.0 },
    { x: 25, y: 1.25 },
    { x: 30, y: 1.98 },
    { x: 35, y: 2.5 },
    { x: 40, y: 3.95 },
    { x: 45, y: 5.0 },
    { x: 50, y: 7.85 },
    { x: 55, y: 10.0 },
    { x: 60, y: 15.85 },
    { x: 65, y: 20.0 },
    { x: 70, y: 31.75 },
  ],
};

/**
 * Insulation test voltage against equipment voltage rating.
 *
 * ⚠️ Unverified. Shapes taken from the hard-coded reports.
 */
export const TEST_VOLTAGE_TABLE: LookupTable = {
  id: "neta.insulationTestVoltage",
  keyType: "string",
  valueType: "number",
  fallback: null,
  entries: [
    { key: "250V", value: 500 },
    { key: "600V", value: 1000 },
    { key: "1000V", value: 1000 },
    { key: "2500V", value: 2500 },
    { key: "5000V", value: 5000 },
    { key: "8000V", value: 5000 },
    { key: "15000V", value: 5000 },
  ],
};

export const ELECTRICAL_RESOURCES: ExpressionResources = {
  curves: new Map([[TCF_CURVE.id, TCF_CURVE]]),
  lookups: new Map([[TEST_VOLTAGE_TABLE.id, TEST_VOLTAGE_TABLE]]),
};

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/**
 * Result styling: colour a result cell by its verdict.
 *
 * This one is presentation only, so it carries no engineering risk, but it is
 * still marked unverified for consistency: a pack's flag describes the pack,
 * and mixing verified and unverified rules in one pack would make the flag
 * meaningless.
 */
export function resultStylingPack(args: {
  targetTableId: string;
  resultColumnId: string;
  rowId: string;
  resultFieldRef: string;
}): RulePack {
  const target = {
    kind: "cell" as const,
    tableId: args.targetTableId,
    rowId: args.rowId,
    columnId: args.resultColumnId,
  };
  const rules: FormRule[] = [
    {
      id: "stylePass",
      description: "Colour a passing result green.",
      when: `{${args.resultFieldRef}} == verdict("PASS")`,
      targets: [target],
      effects: [{ kind: "style", style: "pass" }],
    },
    {
      id: "styleFail",
      description: "Colour a failing result red.",
      when: `{${args.resultFieldRef}} == verdict("FAIL")`,
      targets: [target],
      effects: [{ kind: "style", style: "fail" }],
    },
    {
      id: "styleLimited",
      description: "Colour a limited-service result amber.",
      when: `{${args.resultFieldRef}} == verdict("LIMITED SERVICE")`,
      targets: [target],
      effects: [{ kind: "style", style: "limited" }],
    },
  ];

  return {
    id: "electrical.resultStyling",
    version: "0.1.0",
    label: "Result styling",
    description: "Colours result cells by their verdict.",
    engineeringVerified: false,
    rules,
  };
}

/**
 * Require the explanation when a test does not pass.
 *
 * A FAIL or LIMITED SERVICE with no comment is the single most common gap in
 * a returned report, so the rule makes the comments field required rather than
 * relying on the reviewer to notice.
 */
export function commentsRequiredOnFailurePack(args: {
  resultFieldRef: string;
  commentsSectionId: string;
  commentsFieldId: string;
}): RulePack {
  return {
    id: "electrical.commentsOnFailure",
    version: "0.1.0",
    label: "Comments required on failure",
    description:
      "Makes the comments field required when the result is not a pass.",
    engineeringVerified: false,
    rules: [
      {
        id: "requireComments",
        description:
          "A result of FAIL or LIMITED SERVICE has to be explained.",
        when: `{${args.resultFieldRef}} == verdict("FAIL") or {${args.resultFieldRef}} == verdict("LIMITED SERVICE")`,
        targets: [
          {
            kind: "field",
            sectionId: args.commentsSectionId,
            fieldId: args.commentsFieldId,
          },
        ],
        effects: [{ kind: "required", value: true }],
      },
    ],
  };
}

/** Every pack builder, for the builder UI to list. */
export const ELECTRICAL_PACK_BUILDERS = {
  resultStyling: resultStylingPack,
  commentsRequiredOnFailure: commentsRequiredOnFailurePack,
} as const;
