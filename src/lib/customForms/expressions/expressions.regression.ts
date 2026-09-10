/** Phase 3 core tests. Imported by scripts/custom-forms-regression.ts; no browser or database needed. */
import assert from "node:assert/strict";
import { parseExpression, expressionReferences } from "@/lib/customForms/expressions/parser";
import { compileExpressionProgram, type ExpressionProgramDefinition, type CompiledExpressionProgram } from "@/lib/customForms/expressions/program";
import { EXPRESSION_ENGINE_VERSION, EXPRESSION_LIMITS, type ExpressionValue, type Result, type ValueType } from "@/lib/customForms/expressions/types";
import { expressionReferenceId, translateV1Expression } from "@/lib/customForms/expressions/v1-adapter";
import { VALID_FIXTURES } from "@/lib/customForms/__fixtures__/v1Templates";
import { evaluateFormula } from "@/lib/customForms/formCellResolution";
import {
  convertUnits,
  interpolateCurve,
  lookupValue,
  validateResources,
  type ExpressionResources,
  type InterpolationCurve,
  type LookupTable,
} from "@/lib/customForms/expressions/resources";
import { compileRules, ruleTargetKey, type FormRule } from "@/lib/customForms/expressions/rules";
import {
  ELECTRICAL_RESOURCES,
  TCF_CURVE,
  deviationPercentFormula,
  temperatureCorrectedFormula,
  toleranceLimitFormula,
  toleranceWindowFormula,
} from "@/lib/customForms/expressions/rule-packs/electrical";

let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks++;
  console.log(`  ok    ${name}`);
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) assert.fail(JSON.stringify(result.issues));
  return result.value;
}
function errorCode(result: Result<unknown>, code: string) {
  assert.equal(result.ok, false, `Expected ${code}, got a successful result`);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues));
}
function compile(source: string, inputs: Record<string, ValueType> = {}): Result<CompiledExpressionProgram> {
  return compileExpressionProgram({
    engineVersion: EXPRESSION_ENGINE_VERSION,
    inputs: Object.entries(inputs).map(([id, type]) => ({ id, type })),
    calculations: [{ id: "answer", source }],
  });
}
function evaluate(source: string, values: Record<string, unknown> = {}, inputs: Record<string, ValueType> = {}): Result<ExpressionValue> {
  return unwrap(compile(source, inputs)).evaluate(new Map(Object.entries(values))).results.get("answer")!;
}
function compileWith(source: string, inputs: Record<string, ValueType>, resources: ExpressionResources): Result<CompiledExpressionProgram> {
  return compileExpressionProgram({
    engineVersion: EXPRESSION_ENGINE_VERSION,
    inputs: Object.entries(inputs).map(([id, type]) => ({ id, type })),
    calculations: [{ id: "answer", source }],
    resources,
  });
}
function evaluateWith(source: string, values: Record<string, unknown>, inputs: Record<string, ValueType>, resources: ExpressionResources): Result<ExpressionValue> {
  return unwrap(compileWith(source, inputs, resources)).evaluate(new Map(Object.entries(values))).results.get("answer")!;
}

console.log("\nPhase 3: safe parser and typed arithmetic");
const cases: Array<[string, ExpressionValue]> = [
  ["1 + 2 * 3", 7], ["(1 + 2) * 3", 9], ["8 / 4 / 2", 1], ["10 - 3 - 2", 5],
  ["-2 * -3 + +1", 7], [".5 + 1e2 + 2.5E-1", 100.75], ["round(1.23456, 3)", 1.235],
  ["round(1.7)", 2], ["round(-1.5)", -1], ["sqrt(81) + abs(-2)", 11],
  ["min(3, 1, 2)", 1], ["max([1, 2], 3)", 3], ["sum([1, 2], 3)", 6], ["avg(2, 4, 6)", 4],
  ["1 < 2 and 3 >= 3", true], ["not false and true", true], ["!true || true && false", false],
  ['if(2 <= 3, "PASS", "FAIL")', "PASS"], ['"A" != "B"', true], ['concat("PASS", " / ", "review")', "PASS / review"],
  ['"line\\nquote\\""', 'line\nquote"'], ['["A", "B"]', ["A", "B"]], ["[true, false]", [true, false]],
  ["null * 10", null], ["null == null", null], ["isNull(null)", true], ["isNull(0)", false],
  ["coalesce(null, 0)", 0], ["coalesce(null, null, 12)", 12], ["sum([])", null], ["sum([1, null, 2])", null],
  ["avg([null])", null], ["if(null, 1, 2)", null], ["null and false", false], ["null and true", null],
  ["null or true", true], ["null or false", null], ["coalesce(null, [1, 2])", [1, 2]],
  ["if(true, 5, 1 / 0)", 5], ["false and (1 / 0 > 1)", false], ["true or (1 / 0 > 1)", true],
  ["coalesce(5, 1 / 0)", 5],
];
for (const [source, expected] of cases) check(source, () => assert.deepEqual(unwrap(evaluate(source)), expected));

for (const source of ["", "1 +", "1 2", "1e", "1..2", "(1", "1)", "{}", "{unclosed", "[1,]", "round(1,)", "1;2", "Math.max(1,2)", "new Function(1)", '"bad\\q"', '"unclosed', "/* comment */1", "2 ** 3", "0x10", "1 = 1"]) {
  check(`reject syntax: ${source}`, () => assert.equal(parseExpression(source).ok, false));
}
for (const source of ['"2" + 1', "true * 2", "if(1, 2, 3)", 'if(true, 1, "FAIL")', 'coalesce(1, "2")', 'sum([1, "2"])', "sum([true])", "[[1]]", "true == 1", "[1] == [1]", 'concat("A", 1)', "coalesce([], 1)", "if(true, 1, unknown())"]) {
  check(`reject types/functions: ${source}`, () => assert.equal(compile(source).ok, false));
}
for (const source of ["sum()", "if(true, 1)", "abs(1, 2)", "round(1, 2, 3)"]) {
  check(`reject arity: ${source}`, () => errorCode(compile(source), "function.arity"));
}
for (const name of ["eval", "Function", "constructor", "__proto__", "fetch", "setTimeout"]) {
  check(`no callable JavaScript: ${name}`, () => errorCode(compile(`${name}(1)`), "function.unknown"));
}

console.log("\nMissing and invalid inputs remain distinguishable");
for (const value of [undefined, null, "", "   "]) {
  check(`blank number stays null: ${String(value)}`, () => assert.equal(unwrap(evaluate("{reading} * 2", { reading: value }, { reading: "number" })), null));
}
for (const value of ["1,000", "<2200", "10A", "0x10", true, Infinity, NaN, {}, []]) {
  check(`invalid number is an error: ${String(value)}`, () => errorCode(evaluate("{reading} * 2", { reading: value }, { reading: "number" }), "dependency.error"));
}
check("numeric input strings are parsed at the boundary", () => assert.equal(unwrap(evaluate("{reading} * 2", { reading: " 1.25e2 " }, { reading: "number" })), 250));
check("zero is not missing", () => assert.equal(unwrap(evaluate("{reading} * 2", { reading: 0 }, { reading: "number" })), 0));
check("invalid boolean is not truthy", () => errorCode(evaluate("not {flag}", { flag: "false" }, { flag: "boolean" }), "dependency.error"));
check("typed lists parse numeric input values", () => assert.equal(unwrap(evaluate("sum({readings})", { readings: ["1", "2", "3"] }, { readings: "number[]" })), 6));
check("a missing list item does not become zero", () => assert.equal(unwrap(evaluate("sum({readings})", { readings: [1, "", 3] }, { readings: "number[]" })), null));
check("invalid list items report an error", () => errorCode(evaluate("sum({readings})", { readings: [1, "N/A"] }, { readings: "number[]" }), "dependency.error"));
for (const [source, code] of [["1 / 0", "number.divisionByZero"], ["sqrt(-1)", "number.domain"], ["round(1, -1)", "number.decimals"], ["round(1, 1.5)", "number.decimals"], ["round(1, 13)", "number.decimals"], ["1e308 * 2", "number.nonFinite"], ["coalesce(1 / 0, 0)", "number.divisionByZero"]]) {
  check(`explicit calculation error: ${source}`, () => errorCode(evaluate(source), code));
}
check("error contains the failing source span", () => {
  const result = evaluate("5 + 1 / 0");
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual([result.issues[0].start, result.issues[0].end, result.issues[0].calculationId], [4, 9, "answer"]);
});

console.log("\nDependencies, compilation safety and reproducibility");
check("unknown references report exact locations", () => {
  const result = compile("5 + {missing}");
  errorCode(result, "reference.unknown");
  if (!result.ok) assert.deepEqual([result.issues[0].start, result.issues[0].end, result.issues[0].referenceId], [4, 13, "missing"]);
});
const program = (calculations: ExpressionProgramDefinition["calculations"], inputs: ExpressionProgramDefinition["inputs"] = []) => compileExpressionProgram({ engineVersion: EXPRESSION_ENGINE_VERSION, calculations, inputs });
check("direct cycles cannot compile", () => errorCode(program([{ id: "a", source: "{a} + 1" }]), "dependency.cycle"));
check("indirect cycles cannot compile and name their path", () => {
  const result = program([{ id: "a", source: "{b} + 1" }, { id: "b", source: "{c}" }, { id: "c", source: "{a}" }]);
  errorCode(result, "dependency.cycle");
  if (!result.ok) assert.match(result.issues[0].message, /a -> b -> c -> a/);
});
check("a cycle in an unselected branch still blocks compilation", () => errorCode(program([{ id: "a", source: "if(false, {a}, 0)" }]), "dependency.cycle"));
check("duplicate input/calculation ids cannot shadow values", () => errorCode(program([{ id: "a", source: "1" }], [{ id: "a", type: "number" }]), "id.duplicate"));
check("invalid stable ids are rejected", () => errorCode(program([{ id: "bad id", source: "1" }]), "id.invalid"));
check("an expected result type is enforced", () => errorCode(program([{ id: "a", source: '"PASS"', type: "number" }]), "type.output"));
check("a null output can satisfy a typed missing value", () => assert.equal(program([{ id: "a", source: "null", type: "number" }]).ok, true));
check("unknown engine versions never fall back", () => errorCode(compileExpressionProgram({ engineVersion: "future" as typeof EXPRESSION_ENGINE_VERSION, inputs: [], calculations: [] }), "engine.unsupported"));
check("calculated-to-calculated results do not read stale saved outputs", () => {
  const compiled = unwrap(program([{ id: "b", source: "{a} * 2" }, { id: "a", source: "{input} + 1" }], [{ id: "input", type: "number" }]));
  assert.deepEqual(compiled.order, ["a", "b"]);
  assert.equal(unwrap(compiled.evaluate(new Map<string, unknown>([["input", 2], ["a", 900]])).results.get("b")!), 6);
});
check("failed dependencies remain errors but do not break unrelated calculations", () => {
  const result = unwrap(program([{ id: "bad", source: "1/0" }, { id: "dependent", source: "{bad} * 2" }, { id: "good", source: "2+3" }])).evaluate(new Map());
  errorCode(result.results.get("dependent")!, "dependency.error");
  assert.equal(unwrap(result.results.get("good")!), 5);
});
check("prototype-like ids are plain map keys", () => {
  const compiled = unwrap(program([{ id: "constructor", source: "{__proto__} * 2" }], [{ id: "__proto__", type: "number" }]));
  assert.equal(unwrap(compiled.evaluate(new Map([["__proto__", 3]])).results.get("constructor")!), 6);
});
check("a compiled snapshot cannot be changed by mutating its draft", () => {
  const definition: ExpressionProgramDefinition = { engineVersion: EXPRESSION_ENGINE_VERSION, inputs: [{ id: "a", type: "number" }], calculations: [{ id: "b", source: "{a} * 2" }] };
  const first = unwrap(compileExpressionProgram(definition));
  definition.calculations[0].source = "{a} * 3";
  const second = unwrap(compileExpressionProgram(JSON.parse(JSON.stringify(definition))));
  definition.inputs[0].type = "string";
  const values = new Map([["a", 4]]);
  assert.equal(unwrap(first.evaluate(values).results.get("b")!), 8);
  assert.equal(unwrap(second.evaluate(values).results.get("b")!), 12);
});
check("evaluation order is deterministic across source JSON reloads", () => {
  const definition: ExpressionProgramDefinition = { engineVersion: EXPRESSION_ENGINE_VERSION, inputs: [], calculations: [{ id: "a", source: "{b} * 2" }, { id: "b", source: "10" }] };
  assert.deepEqual(unwrap(compileExpressionProgram(definition)).order, unwrap(compileExpressionProgram(JSON.parse(JSON.stringify(definition)))).order);
});

console.log("\nV1 references upgrade once without reinterpreting historical formulas");
const fixture = VALID_FIXTURES.find((entry) => entry.name === "insulation-resistance")!;
const sections = structuredClone(fixture.structure.sections);
const context = { sections, rowIdsBySection: new Map([["sec-ir", ["reading-a", "reading-b", "reading-c"]]]), currentRowIndex: 0 };
const irReference = expressionReferenceId({ scope: "cell", tableId: "sec-ir", rowId: "reading-a", columnId: "col-reading" });
const tcfReference = expressionReferenceId({ scope: "field", sectionId: "sec-job", fieldId: "tcf" });
check("captured insulation-resistance fixture retains its numeric TCF result", () => {
  const formula = sections.find((entry) => entry.id === "sec-ir")!.cellFormulas!["row0_col-corrected"];
  const translated = unwrap(translateV1Expression(formula, context));
  const values = fixture.storedData.sections as Record<string, Record<string, unknown>>;
  assert.equal(unwrap(evaluate(translated.source, { [irReference]: values["sec-ir_row0"].reading, [tcfReference]: values["sec-job"].tcf }, { [irReference]: "number", [tcfReference]: "number" })), 1200);
  assert.equal(evaluateFormula(formula, values, "sec-ir", 0, sections), "1200");
});
check("case-insensitive friendly references and exact section ids agree", () => {
  assert.equal(unwrap(translateV1Expression("{ir.C2.R1} * {jd.TCF}", context)).source, unwrap(translateV1Expression("{sec-ir.C2.R1} * {sec-job.tcf}", context)).source);
});
check("same-row and explicit legacy row keys resolve to persisted identity", () => {
  for (const source of ["{IR.C2}", "{sec-ir.sameRow.reading}", "{sec-ir.row0.reading}"]) {
    assert.equal(unwrap(translateV1Expression(source, context)).source, `{${irReference}}`);
  }
});
check("column and row reorder cannot retarget an already upgraded formula", () => {
  const translated = unwrap(translateV1Expression("{IR.C2.R1}", context));
  const compiled = unwrap(compile(translated.source, { [irReference]: "number" }));
  const reordered = structuredClone(context);
  reordered.sections.find((entry) => entry.id === "sec-ir")!.columns!.reverse();
  reordered.rowIdsBySection.get("sec-ir")!.reverse();
  const serialized = JSON.parse(JSON.stringify({ source: translated.source }));
  assert.equal(serialized.source, `{${irReference}}`);
  assert.equal(unwrap(compiled.evaluate(new Map([[irReference, 1200]])).results.get("answer")!), 1200);
});
check("literal reference-looking text is not rewritten", () => assert.equal(unwrap(translateV1Expression('concat("{IR.C2}", " literal")', context)).source, 'concat("{IR.C2}", " literal")'));
for (const source of ["{missing.reading}", "{IR.C9.R1}", "{IR.C2.R0}", "{IR.C2.R9}", "{IR.C2.nope}", "{JD.missing}", "{IR.row0.missing}"]) {
  check(`unresolvable V1 reference blocks upgrade: ${source}`, () => errorCode(translateV1Expression(source, context), "v1.reference"));
}
check("table translation refuses to invent row ids", () => errorCode(translateV1Expression("{IR.C2}", { ...context, rowIdsBySection: new Map() }), "v1.reference"));
check("ambiguous section codes block upgrade", () => errorCode(translateV1Expression("{IR.C2}", { ...context, sections: [...sections, { ...sections[1], id: "other-ir" }] }), "v1.reference"));
check("duplicate row ids block upgrade", () => errorCode(translateV1Expression("{IR.C2}", { ...context, rowIdsBySection: new Map([["sec-ir", ["same", "same"]]]) }), "v1.reference"));
check("id encoding avoids slash/brace collisions", () => {
  assert.notEqual(expressionReferenceId({ scope: "field", sectionId: "a/b", fieldId: "c" }), expressionReferenceId({ scope: "field", sectionId: "a", fieldId: "b/c" }));
  const id = expressionReferenceId({ scope: "binding", bindingId: "a{b} c" });
  assert.equal(unwrap(parseExpression(`{${id}}`)).kind, "reference");
});
check("V1 waits for a reading, then counts a blank as zero", () => {
  // Nothing entered: blank, not "0" (which printed as a reading of zero).
  assert.equal(evaluateFormula("{JD.tcf} * 2", {}, "sec-ir", 0, sections), "");
  const row = { "sec-ir_row0": { a: "5" }, "sec-job": { tcf: "2" } };
  // A filled TCF alone does not make a reading exist.
  assert.equal(evaluateFormula("{sec-ir.sameRow.b} * {sec-job.tcf}", row, "sec-ir", 0, sections), "");
  assert.equal(evaluateFormula('if({sec-ir.sameRow.b} >= 100, "PASS", "FAIL")', row, "sec-ir", 0, sections), "");
  // Once one reading is in, the rest still count as zero, so a partial total works.
  assert.equal(evaluateFormula("{sec-ir.sameRow.a} + {sec-ir.sameRow.b}", row, "sec-ir", 0, sections), "5");
  const translated = unwrap(translateV1Expression("{JD.tcf} * 2", context));
  assert.equal(unwrap(evaluate(translated.source, {}, { [tcfReference]: "number" })), null);
});
check("the adapter leaves the original fixture untouched", () => assert.deepEqual(sections, fixture.structure.sections));

// The builder's own formulas used to run through `new Function` behind an
// allowlist of arithmetic and `round`, so `if`, `min`, `max` and comparisons
// silently gave a blank cell. They now use this engine's parser.
check("builder formulas keep their arithmetic results", () => {
  const legacy = (formula: string) => evaluateFormula(formula, {}, "sec-ir", 0, sections);
  assert.equal(legacy("1+2"), "3");
  assert.equal(legacy("10 / 3"), String(10 / 3));
  assert.equal(legacy("2*(3+4)"), "14");
  assert.equal(legacy("round(3.14159, 2)"), "3.14");
  assert.equal(legacy("round(2.5)"), "3");
  assert.equal(legacy("0.1+0.2"), String(0.1 + 0.2));
  assert.equal(legacy("1/0"), "");
});
check("builder formulas run functions, comparisons and text", () => {
  const row = { "sec-ir_row0": { a: "10", b: "-3", c: "<30" } };
  const legacy = (formula: string) => evaluateFormula(formula, row, "sec-ir", 0, sections);
  assert.equal(legacy("max(1, 2, 3)"), "3");
  assert.equal(legacy("min(4, 2, 9)"), "2");
  assert.equal(legacy("avg(1, 2, 3)"), "2");
  assert.equal(legacy("{sec-ir.sameRow.a} - {sec-ir.sameRow.b}"), "13");
  assert.equal(legacy('if({sec-ir.sameRow.a} > 5 and {sec-ir.sameRow.b} < 0, "PASS", "FAIL")'), "PASS");
  assert.equal(legacy('if(max({sec-ir.sameRow.a}, {sec-ir.sameRow.c}) / min({sec-ir.sameRow.a}, {sec-ir.sameRow.c}) > 1.5, "FAIL", "PASS")'), "FAIL");
});
check("a < or > carried by a reading stays on numbers and never reaches a verdict", () => {
  const row = { "sec-ir_row0": { c: "<30" } };
  const legacy = (formula: string) => evaluateFormula(formula, row, "sec-ir", 0, sections);
  assert.equal(legacy("{sec-ir.sameRow.c} * 2"), "<60");
  assert.equal(legacy('if({sec-ir.sameRow.c} >= 30, "PASS", "FAIL")'), "PASS");
});
check("builder formulas never execute source", () => {
  const legacy = (formula: string) => evaluateFormula(formula, {}, "sec-ir", 0, sections);
  assert.equal(legacy("(function(){ return 1 })()"), "");
  assert.equal(legacy("globalThis"), "");
  assert.equal(legacy('"PASS" + 1'), "");
});

console.log("\nElectronic-trip breaker acceptance slice (not report certification)");
// Numeric formulas from LowVoltageCircuitBreakerElectronicTripATSReport.tsx,
// recomputeTopFromMultiplier / recomputeBottomTolerance. Percent inputs here
// are numeric percentages, not the legacy strings ending in '%'. The PASS/FAIL
// calculation is a synthetic inclusive-window assertion, not a certified rule.
const breaker = unwrap(program([
  { id: "breaker/result", source: 'if({breaker/measured} >= {breaker/min} and {breaker/measured} <= {breaker/max}, "PASS", "FAIL")', type: "string" },
  { id: "breaker/min", source: "round({breaker/testAmperes} * (1 + {breaker/minPercent} / 100), 1)", type: "number" },
  { id: "breaker/max", source: "round({breaker/testAmperes} * (1 + {breaker/maxPercent} / 100), 1)", type: "number" },
  { id: "breaker/testAmperes", source: "round({breaker/rated} * {breaker/multiplierPercent} / 100, 1)", type: "number" },
], ["rated", "multiplierPercent", "minPercent", "maxPercent", "measured"].map((name) => ({ id: `breaker/${name}`, type: "number" }))));
const breakerInputs = new Map<string, unknown>([["breaker/rated", 100], ["breaker/multiplierPercent", 300], ["breaker/minPercent", -10], ["breaker/maxPercent", 10], ["breaker/measured", 300]]);
check("tolerance bounds depend on the calculated test amperes", () => {
  const { results } = breaker.evaluate(breakerInputs);
  assert.equal(unwrap(results.get("breaker/testAmperes")!), 300);
  assert.equal(unwrap(results.get("breaker/min")!), 270);
  assert.equal(unwrap(results.get("breaker/max")!), 330);
});
for (const [reading, expected] of [[269.9, "FAIL"], [270, "PASS"], [300, "PASS"], [330, "PASS"], [330.1, "FAIL"], [null, null]] as const) {
  check(`breaker reading ${reading} returns ${expected}`, () => {
    const values = new Map(breakerInputs);
    values.set("breaker/measured", reading);
    assert.equal(unwrap(breaker.evaluate(values).results.get("breaker/result")!), expected);
  });
}

console.log("\nResource limits and parser boundaries");
check("source length is bounded", () => errorCode(parseExpression("1".repeat(EXPRESSION_LIMITS.sourceLength + 1)), "limit.source"));
check("nested formulas are bounded", () => errorCode(parseExpression("(".repeat(70) + "1" + ")".repeat(70)), "limit.depth"));
check("long left-associative trees are bounded", () => errorCode(parseExpression(Array(80).fill("1").join("+")), "limit.depth"));
check("non-finite numeric literals are refused", () => errorCode(parseExpression("1e999"), "number.nonFinite"));
check("large input lists are bounded", () => errorCode(evaluate("sum({x})", { x: Array(1025).fill(1) }, { x: "number[]" }), "dependency.error"));
check("large dependency graphs are bounded", () => errorCode(program(Array.from({ length: 2049 }, (_, index) => ({ id: `a${index}`, source: "1" }))), "limit.program"));
check("long dependency chains do not recurse on the JavaScript stack", () => {
  const calculations = Array.from({ length: 1000 }, (_, index) => ({ id: `c${index}`, source: index === 999 ? "1" : `{c${index + 1}} + 1` }));
  assert.equal(unwrap(unwrap(program(calculations)).evaluate(new Map()).results.get("c0")!), 1000);
});
check("reference scanner ignores braces inside strings", () => assert.deepEqual(expressionReferences(unwrap(parseExpression('concat("{not-a-reference}", {real})'))).map((ref) => ref.id), ["real"]));

check("aggregate work is bounded across multiple lists", () => errorCode(evaluate("sum({a}, {a})", { a: Array(600).fill(1) }, { a: "number[]" }), "limit.list"));
check("input string length is bounded", () => errorCode(evaluate("{text}", { text: "a".repeat(8193) }, { text: "string" }), "dependency.error"));
check("concatenation output length is bounded", () => errorCode(evaluate("concat({text}, {text})", { text: "a".repeat(5000) }, { text: "string" }), "limit.string"));
check("malformed program payloads return diagnostics", () => {
  for (const payload of [null, {}, { engineVersion: EXPRESSION_ENGINE_VERSION, inputs: {}, calculations: [] }]) {
    errorCode(compileExpressionProgram(payload as unknown as ExpressionProgramDefinition), "program.shape");
  }
});
check("missing input types return diagnostics", () => errorCode(program([], [{ id: "a" } as { id: string; type: ValueType }]), "type.unknown"));
check("non-string formula sources return diagnostics", () => errorCode(program([{ id: "a", source: null as unknown as string }]), "program.source"));
check("long input arrays are copied before evaluation", () => {
  const input = [1, 2];
  const compiled = unwrap(compile("{a}", { a: "number[]" }));
  const evaluated = unwrap(compiled.evaluate(new Map([["a", input]])).results.get("answer")!);
  input[0] = 99;
  assert.deepEqual(evaluated, [1, 2]);
});

console.log("\nPhase 3: unit conversion");
const span = { start: 0, end: 0 };
check("resistance scales convert both ways", () => {
  assert.equal(convertUnits(1, "mΩ", "μΩ", span), 1000);
  assert.equal(convertUnits(1000, "μΩ", "mΩ", span), 1);
  assert.equal(convertUnits(1, "GΩ", "MΩ", span), 1000);
});
check("both micro signs mean the same unit", () => {
  // U+03BC (greek mu) and U+00B5 (micro sign) look identical and both occur in
  // this codebase's unit lists.
  assert.equal(convertUnits(1, "μΩ", "µΩ", span), 1);
  assert.equal(convertUnits(1, "µA", "mA", span), 0.001);
});
check("temperature converts affinely, not by a factor", () => {
  assert.equal(convertUnits(68, "°F", "°C", span), 20);
  assert.equal(convertUnits(20, "°C", "°F", span), 68);
  assert.equal(convertUnits(-40, "°F", "°C", span), -40);
});
check("mixing dimensions is refused", () => {
  assert.throws(() => convertUnits(1, "V", "A", span), /Cannot convert/);
});
check("convert type-checks its units at compile time", () => {
  errorCode(compile('convert(1, "V", "A")'), "unit.dimension");
  errorCode(compile('convert(1, "V", "bananas")'), "unit.unknown");
});
check("convert requires literal unit names", () => {
  errorCode(compile('convert(1, {u}, "V")', { u: "string" }), "argument.literal");
});
check("convert propagates null rather than assuming zero", () => {
  assert.equal(unwrap(evaluate('convert({v}, "kV", "V")', { v: "" }, { v: "number" })), null);
});
check("convert runs inside a formula", () => {
  assert.equal(unwrap(evaluate('convert({v}, "kV", "V")', { v: "2.4" }, { v: "number" })), 2400);
});

console.log("\nPhase 3: lookup tables");
const gradeTable: LookupTable = {
  id: "grades", keyType: "string", valueType: "number", fallback: null,
  entries: [{ key: "A", value: 1 }, { key: "B", value: 2 }],
};
const tableResources: ExpressionResources = { lookups: new Map([[gradeTable.id, gradeTable]]), curves: new Map() };
check("an exact lookup returns its value", () => {
  assert.equal(unwrap(evaluateWith('lookup("grades", {k})', { k: "B" }, { k: "string" }, tableResources)), 2);
});
check("a lookup miss returns the fallback rather than guessing", () => {
  assert.equal(unwrap(evaluateWith('lookup("grades", {k})', { k: "Z" }, { k: "string" }, tableResources)), null);
});
check("a lookup infers the table's value type", () => {
  errorCode(compileWith('concat(lookup("grades", "A"))', {}, tableResources), "type.mismatch");
});
check("an unknown lookup table blocks compilation", () => {
  errorCode(compileWith('lookup("nope", "A")', {}, tableResources), "lookup.unknown");
});
check("a lookup key of the wrong type blocks compilation", () => {
  errorCode(compileWith('lookup("grades", 1)', {}, tableResources), "type.mismatch");
});
check("duplicate lookup keys are refused", () => {
  const issues = validateResources({
    lookups: new Map([["t", { id: "t", keyType: "string", valueType: "number", entries: [{ key: "A", value: 1 }, { key: "A", value: 2 }] } as LookupTable]]),
    curves: new Map(),
  });
  assert.ok(issues.some((issue) => issue.code === "lookup.duplicateKey"), JSON.stringify(issues));
});

console.log("\nPhase 3: interpolation");
const line: InterpolationCurve = { id: "line", points: [{ x: 0, y: 0 }, { x: 10, y: 100 }] };
const curveResources: ExpressionResources = { lookups: new Map(), curves: new Map([[line.id, line]]) };
check("interpolation is linear between points", () => {
  assert.equal(interpolateCurve(line, 5, span), 50);
  assert.equal(interpolateCurve(line, 2.5, span), 25);
});
check("interpolation returns the exact value at a point", () => {
  assert.equal(interpolateCurve(line, 0, span), 0);
  assert.equal(interpolateCurve(line, 10, span), 100);
});
check("interpolation refuses to extrapolate by default", () => {
  assert.equal(interpolateCurve(line, -1, span), null);
  assert.equal(interpolateCurve(line, 11, span), null);
});
check("a clamping curve holds its end values", () => {
  const clamped: InterpolationCurve = { ...line, outOfRange: "clamp" };
  assert.equal(interpolateCurve(clamped, -1, span), 0);
  assert.equal(interpolateCurve(clamped, 11, span), 100);
});
check("an unsorted curve is refused", () => {
  const issues = validateResources({
    lookups: new Map(),
    curves: new Map([["c", { id: "c", points: [{ x: 10, y: 1 }, { x: 0, y: 2 }] } as InterpolationCurve]]),
  });
  assert.ok(issues.some((issue) => issue.code === "curve.unsorted"), JSON.stringify(issues));
});
check("a one-point curve is refused", () => {
  const issues = validateResources({
    lookups: new Map(),
    curves: new Map([["c", { id: "c", points: [{ x: 0, y: 1 }] } as InterpolationCurve]]),
  });
  assert.ok(issues.some((issue) => issue.code === "curve.tooFewPoints"), JSON.stringify(issues));
});
check("interpolate runs inside a formula", () => {
  assert.equal(unwrap(evaluateWith('interpolate("line", {x})', { x: "7.5" }, { x: "number" }, curveResources)), 75);
});
check("the TCF curve interpolates between tabulated points", () => {
  // 20 °C is the reference temperature, so its factor is exactly 1.
  assert.equal(interpolateCurve(TCF_CURVE, 20, span), 1);
  // 22.5 °C sits midway between the 20 and 25 °C rows.
  assert.equal(interpolateCurve(TCF_CURVE, 22.5, span), 1.125);
});
check("the TCF curve refuses a temperature past its table", () => {
  assert.equal(interpolateCurve(TCF_CURVE, 200, span), null);
});

console.log("\nPhase 3: rule results");
check("verdict produces a typed result", () => {
  assert.equal(unwrap(evaluate('verdict("PASS")')), "PASS");
});
check("an unknown verdict is refused at evaluation", () => {
  errorCode(evaluate('verdict("MAYBE")'), "result.unknown");
});
check("a result is not interchangeable with a string", () => {
  errorCode(compile('concat(verdict("PASS"))'), "type.mismatch");
});
check("results compare to each other", () => {
  assert.equal(unwrap(evaluate('verdict("PASS") == verdict("PASS")')), true);
  assert.equal(unwrap(evaluate('verdict("PASS") == verdict("FAIL")')), false);
});
check("a result input only accepts permitted verdicts", () => {
  assert.equal(unwrap(evaluate("{r}", { r: "LIMITED SERVICE" }, { r: "result" })), "LIMITED SERVICE");
  errorCode(evaluate("{r}", { r: "MAYBE" }, { r: "result" }), "dependency.error");
});

console.log("\nPhase 3: electrical formula builders");
const toleranceInputs: Record<string, ValueType> = { reading: "number", low: "number", high: "number" };
const window = toleranceWindowFormula({ readingRef: "reading", lowRef: "low", highRef: "high" });
check("a reading inside the window passes", () => {
  assert.equal(unwrap(evaluate(window, { reading: 300, low: 270, high: 330 }, toleranceInputs)), "PASS");
});
check("the window is inclusive at both limits", () => {
  assert.equal(unwrap(evaluate(window, { reading: 270, low: 270, high: 330 }, toleranceInputs)), "PASS");
  assert.equal(unwrap(evaluate(window, { reading: 330, low: 270, high: 330 }, toleranceInputs)), "PASS");
});
check("a reading outside the window fails", () => {
  assert.equal(unwrap(evaluate(window, { reading: 269.9, low: 270, high: 330 }, toleranceInputs)), "FAIL");
  assert.equal(unwrap(evaluate(window, { reading: 330.1, low: 270, high: 330 }, toleranceInputs)), "FAIL");
});
check("a blank reading is blank, not a failure", () => {
  assert.equal(unwrap(evaluate(window, { reading: "", low: 270, high: 330 }, toleranceInputs)), null);
});
check("tolerance limits derive from a nominal and a percentage", () => {
  const low = toleranceLimitFormula({ nominalRef: "n", percent: 10, bound: "low" });
  const high = toleranceLimitFormula({ nominalRef: "n", percent: 10, bound: "high" });
  assert.equal(unwrap(evaluate(low, { n: 300 }, { n: "number" })), 270);
  assert.equal(unwrap(evaluate(high, { n: 300 }, { n: "number" })), 330);
});
check("deviation is measured against the smallest reading", () => {
  const formula = deviationPercentFormula({ readingRef: "r", setRef: "set" });
  assert.equal(unwrap(evaluate(formula, { r: 150, set: [100, 150, 200] }, { r: "number", set: "number[]" })), 50);
});
check("deviation against a zero baseline refuses to divide", () => {
  const formula = deviationPercentFormula({ readingRef: "r", setRef: "set" });
  assert.equal(unwrap(evaluate(formula, { r: 150, set: [0, 150] }, { r: "number", set: "number[]" })), null);
});
check("temperature correction uses the curve, not arithmetic", () => {
  const formula = temperatureCorrectedFormula({ readingRef: "r", celsiusRef: "c", tcfCurveId: TCF_CURVE.id });
  const inputs: Record<string, ValueType> = { r: "number", c: "number" };
  assert.equal(unwrap(evaluateWith(formula, { r: 1000, c: 20 }, inputs, ELECTRICAL_RESOURCES)), 1000);
  assert.equal(unwrap(evaluateWith(formula, { r: 1000, c: 25 }, inputs, ELECTRICAL_RESOURCES)), 1250);
});
check("temperature correction outside the table returns blank", () => {
  const formula = temperatureCorrectedFormula({ readingRef: "r", celsiusRef: "c", tcfCurveId: TCF_CURVE.id });
  assert.equal(unwrap(evaluateWith(formula, { r: 1000, c: 200 }, { r: "number", c: "number" }, ELECTRICAL_RESOURCES)), null);
});

console.log("\nPhase 3: the rule engine");
const ruleInputs = [{ id: "result", type: "result" as ValueType }, { id: "reading", type: "number" as ValueType }];
const sampleRules: FormRule[] = [
  {
    id: "requireComments",
    when: '{result} == verdict("FAIL")',
    targets: [{ kind: "field", sectionId: "notes", fieldId: "comments" }],
    effects: [{ kind: "required", value: true }],
  },
  {
    id: "hideRetest",
    when: '{result} == verdict("PASS")',
    targets: [{ kind: "field", sectionId: "notes", fieldId: "retest" }],
    effects: [{ kind: "visible", value: false }],
  },
];
const compiledRules = unwrap(compileRules({ rules: sampleRules, inputs: ruleInputs }));
const commentsKey = ruleTargetKey({ kind: "field", sectionId: "notes", fieldId: "comments" });
const retestKey = ruleTargetKey({ kind: "field", sectionId: "notes", fieldId: "retest" });

check("a rule fires and applies its effect", () => {
  const evaluated = compiledRules.evaluate(new Map([["result", "FAIL"]]));
  assert.equal(evaluated.byTarget.get(commentsKey)?.required, true);
  assert.equal(evaluated.fired.get("requireComments"), true);
});
check("a rule that does not fire applies nothing", () => {
  const evaluated = compiledRules.evaluate(new Map([["result", "PASS"]]));
  assert.equal(evaluated.byTarget.get(commentsKey), undefined);
  assert.equal(evaluated.byTarget.get(retestKey)?.visible, false);
});
check("a blank input leaves rules unresolved rather than false", () => {
  // Treating null as false would hide a required field on an empty form.
  const evaluated = compiledRules.evaluate(new Map([["result", ""]]));
  assert.equal(evaluated.fired.get("requireComments"), null);
  assert.equal(evaluated.byTarget.get(commentsKey), undefined);
});
check("a rule records which rules applied to a target", () => {
  const evaluated = compiledRules.evaluate(new Map([["result", "FAIL"]]));
  assert.deepEqual(evaluated.byTarget.get(commentsKey)?.appliedBy, ["requireComments"]);
});
check("a non-boolean rule condition is refused", () => {
  errorCode(compileRules({ rules: [{ ...sampleRules[0], when: "{reading}" }], inputs: ruleInputs }), "type.output");
});
check("a rule referencing a missing field is refused", () => {
  errorCode(compileRules({ rules: [{ ...sampleRules[0], when: "{nope} == 1" }], inputs: ruleInputs }), "reference.unknown");
});
check("a rule with no targets is refused", () => {
  errorCode(compileRules({ rules: [{ ...sampleRules[0], targets: [] }], inputs: ruleInputs }), "rule.noTargets");
});
check("duplicate rule ids are refused", () => {
  errorCode(compileRules({ rules: [sampleRules[0], sampleRules[0]], inputs: ruleInputs }), "rule.duplicate");
});
check("later rules win on the same target", () => {
  const conflicting: FormRule[] = [
    { id: "a", when: "true", targets: [{ kind: "field", sectionId: "s", fieldId: "f" }], effects: [{ kind: "style", style: "pass" }] },
    { id: "b", when: "true", targets: [{ kind: "field", sectionId: "s", fieldId: "f" }], effects: [{ kind: "style", style: "fail" }] },
  ];
  const compiled = unwrap(compileRules({ rules: conflicting, inputs: ruleInputs }));
  const evaluated = compiled.evaluate(new Map());
  const key = ruleTargetKey({ kind: "field", sectionId: "s", fieldId: "f" });
  assert.equal(evaluated.byTarget.get(key)?.style, "fail");
  assert.deepEqual(evaluated.byTarget.get(key)?.appliedBy, ["a", "b"]);
});


console.log(`\n${checks}/${checks} expression checks passed`);
export const expressionCheckCount = checks;
