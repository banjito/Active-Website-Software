import { expressionReferences, parseExpression } from "@/lib/customForms/expressions/parser";
import { evaluateNode, inferNode, isAssignable, readTypedInput } from "@/lib/customForms/expressions/semantics";
import {
  EXPRESSION_ENGINE_VERSION,
  EXPRESSION_LIMITS,
  ExpressionFailure,
  failureResult,
  type ExpressionIssue,
  type ExpressionNode,
  type ExpressionValue,
  type InferredType,
  type Result,
  type ValueType,
} from "@/lib/customForms/expressions/types";
import { validateResources, type ExpressionResources } from "@/lib/customForms/expressions/resources";

export interface ExpressionInput {
  id: string;
  type: ValueType;
}

export interface CalculationDefinition {
  id: string;
  source: string;
  /** Optional expected output type. Null is permitted for incomplete work. */
  type?: ValueType;
}

export interface ExpressionProgramDefinition {
  engineVersion: typeof EXPRESSION_ENGINE_VERSION;
  inputs: readonly ExpressionInput[];
  calculations: readonly CalculationDefinition[];
  /** Lookup tables and interpolation curves the formulas may name. */
  resources?: ExpressionResources;
}

export interface ProgramEvaluation {
  /** Includes inputs and calculated outputs; failed dependencies stay errors. */
  results: ReadonlyMap<string, Result<ExpressionValue>>;
  issues: ExpressionIssue[];
}

export interface CompiledExpressionProgram {
  engineVersion: typeof EXPRESSION_ENGINE_VERSION;
  /** Deterministic dependency-first order of calculations, independent of input values. */
  order: readonly string[];
  evaluate(values: ReadonlyMap<string, unknown>): ProgramEvaluation;
}

const TYPES = new Set<string>(["number", "string", "boolean", "result", "number[]", "string[]", "boolean[]", "result[]"]);
const atStart = { start: 0, end: 0 };

/**
 * Compile from source, never a caller-supplied AST. The closure owns the checked
 * trees so changing a draft after compilation cannot change this program.
 * Persist the definition + engine version, not this executable object.
 */
export function compileExpressionProgram(definition: ExpressionProgramDefinition): Result<CompiledExpressionProgram> {
  const issues: ExpressionIssue[] = [];
  if (!definition || !Array.isArray(definition.inputs) || !Array.isArray(definition.calculations)) {
    return { ok: false, issues: [{ ...atStart, code: "program.shape", message: "Expression program needs input and calculation arrays." }] };
  }
  if (definition.engineVersion !== EXPRESSION_ENGINE_VERSION) {
    return { ok: false, issues: [{ ...atStart, code: "engine.unsupported", message: `Unsupported expression engine "${definition.engineVersion}".` }] };
  }
  if (definition.inputs.length + definition.calculations.length > EXPRESSION_LIMITS.programNodes) {
    return { ok: false, issues: [{ ...atStart, code: "limit.program", message: "Calculation program is too large." }] };
  }
  // Copy caller-owned definitions; runtime input types must not be mutable via a draft.
  const inputs = definition.inputs.map((input) => ({ ...input }));
  const calculations = definition.calculations.map((calculation) => ({ ...calculation }));
  // Copy the resource maps too: a draft edited after compilation must not be
  // able to change what a published program looks up.
  const resources: ExpressionResources = {
    lookups: new Map(definition.resources?.lookups ?? []),
    curves: new Map(definition.resources?.curves ?? []),
  };
  for (const issue of validateResources(resources)) {
    issues.push({ ...atStart, code: issue.code, message: issue.message, referenceId: issue.resourceId });
  }
  const known = new Set<string>();
  for (const entry of [...inputs, ...calculations]) {
    if (typeof entry.id !== "string" || !entry.id || /[{}\s]/.test(entry.id)) issues.push({ ...atStart, code: "id.invalid", message: "Use a nonempty stable id without whitespace or braces.", calculationId: entry.id });
    if (known.has(entry.id)) issues.push({ ...atStart, code: "id.duplicate", message: `Duplicate expression id "${entry.id}".`, calculationId: entry.id });
    known.add(entry.id);
    if (entry.type !== undefined && !TYPES.has(entry.type)) issues.push({ ...atStart, code: "type.unknown", message: `Unknown value type "${entry.type}".`, calculationId: entry.id });
  }
  for (const input of inputs) {
    if (!TYPES.has(input.type)) issues.push({ ...atStart, code: "type.unknown", message: "Every input needs an explicit supported value type.", referenceId: input.id });
  }
  for (const calculation of calculations) {
    if (typeof calculation.source !== "string") issues.push({ ...atStart, code: "program.source", message: "Every calculation needs formula source text.", calculationId: calculation.id });
  }
  if (issues.length) return { ok: false, issues };

  const nodes = new Map<string, ExpressionNode>();
  const dependencies = new Map<string, string[]>();
  const calculationIds = new Set(calculations.map((entry) => entry.id));
  for (const calculation of calculations) {
    const parsed = parseExpression(calculation.source);
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => ({ ...issue, calculationId: calculation.id })));
      continue;
    }
    nodes.set(calculation.id, parsed.value);
    const refs = expressionReferences(parsed.value);
    for (const ref of refs) {
      if (!known.has(ref.id)) issues.push({ start: ref.start, end: ref.end, code: "reference.unknown", message: `Unknown reference "${ref.id}".`, calculationId: calculation.id, referenceId: ref.id });
    }
    dependencies.set(calculation.id, [...new Set(refs.map((ref) => ref.id).filter((id) => calculationIds.has(id)))]);
  }
  if (issues.length) return { ok: false, issues };

  // Iterative DFS avoids overflowing the JS stack on long calculation chains.
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];
  for (const root of calculations) {
    if (state.has(root.id)) continue;
    const stack = [{ id: root.id, next: 0 }];
    state.set(root.id, "visiting");
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const deps = dependencies.get(frame.id)!;
      if (frame.next === deps.length) {
        state.set(frame.id, "done");
        order.push(frame.id);
        stack.pop();
        continue;
      }
      const dependency = deps[frame.next++];
      if (state.get(dependency) === "visiting") {
        const cycle = [...stack.slice(stack.findIndex((entry) => entry.id === dependency)).map((entry) => entry.id), dependency];
        const ref = expressionReferences(nodes.get(frame.id)!).find((entry) => entry.id === dependency)!;
        issues.push({ start: ref.start, end: ref.end, code: "dependency.cycle", message: `Calculation cycle: ${cycle.join(" -> ")}.`, calculationId: frame.id, referenceId: dependency });
      } else if (!state.has(dependency)) {
        state.set(dependency, "visiting");
        stack.push({ id: dependency, next: 0 });
      }
    }
  }
  if (issues.length) return { ok: false, issues };

  const types = new Map<string, InferredType>(inputs.map((input) => [input.id, input.type]));
  const expectedTypes = new Map(calculations.map((entry) => [entry.id, entry.type]));
  for (const id of order) {
    try {
      const inferred = inferNode(nodes.get(id)!, (reference) => types.get(reference)!, resources);
      const expected = expectedTypes.get(id);
      if (expected && !isAssignable(inferred, expected)) throw new ExpressionFailure("type.output", `Calculation returns ${inferred}, expected ${expected}.`, nodes.get(id)!);
      types.set(id, expected ?? inferred);
    } catch (error) {
      const failed = failureResult(error);
      if (!failed.ok) issues.push(...failed.issues.map((issue) => ({ ...issue, calculationId: id })));
      // Do not infer dependent types from a failed calculation.
      return { ok: false, issues };
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      engineVersion: EXPRESSION_ENGINE_VERSION,
      order: Object.freeze(order),
      evaluate(values: ReadonlyMap<string, unknown>): ProgramEvaluation {
        const results = new Map<string, Result<ExpressionValue>>();
        for (const input of inputs) {
          try { results.set(input.id, { ok: true, value: readTypedInput(values.get(input.id), input.type, atStart) }); }
          catch (error) {
            const failed = failureResult(error);
            results.set(input.id, failed.ok ? failed : { ok: false, issues: failed.issues.map((issue) => ({ ...issue, referenceId: input.id })) });
          }
        }
        for (const id of order) {
          try {
            const value = evaluateNode(nodes.get(id)!, (reference, span) => {
              const result = results.get(reference)!;
              if (!result.ok) throw new ExpressionFailure("dependency.error", `Reference "${reference}" failed: ${result.issues[0].message}`, span, reference);
              return result.value;
            }, resources);
            results.set(id, { ok: true, value });
          } catch (error) {
            const failed = failureResult(error);
            results.set(id, failed.ok ? failed : { ok: false, issues: failed.issues.map((issue) => ({ ...issue, calculationId: id })) });
          }
        }
        return { results, issues: [...results.values()].flatMap((result) => result.ok ? [] : result.issues) };
      },
    }),
  };
}
