/**
 * The rule engine.
 *
 * A rule is a boolean expression plus the effects it applies when true. Rules
 * are compiled through the same typed program as calculations, so a rule that
 * references a field that does not exist is a publication error rather than a
 * condition that quietly never fires.
 *
 * Effects are resolved, not executed: evaluation produces a plain description
 * of what each target should look like, and the renderer reads it. Nothing
 * here touches the DOM or mutates instance data. In particular, hiding a field
 * never clears it, so flipping a rule back restores the reading.
 */

import {
  compileExpressionProgram,
  type CompiledExpressionProgram,
  type ExpressionInput,
} from "@/lib/customForms/expressions/program";
import {
  EXPRESSION_ENGINE_VERSION,
  type ExpressionIssue,
  type Result,
} from "@/lib/customForms/expressions/types";
import type { ExpressionResources } from "@/lib/customForms/expressions/resources";

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type RuleTarget =
  | { kind: "section"; sectionId: string }
  | { kind: "field"; sectionId: string; fieldId: string }
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "row"; tableId: string; rowId: string }
  | { kind: "cell"; tableId: string; rowId: string; columnId: string };

/** Stable key for a target, so effects can be looked up in one map. */
export function ruleTargetKey(target: RuleTarget): string {
  switch (target.kind) {
    case "section":
      return `section:${target.sectionId}`;
    case "field":
      return `field:${target.sectionId}:${target.fieldId}`;
    case "column":
      return `column:${target.tableId}:${target.columnId}`;
    case "row":
      return `row:${target.tableId}:${target.rowId}`;
    case "cell":
      return `cell:${target.tableId}:${target.rowId}:${target.columnId}`;
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type RuleStyle = "pass" | "fail" | "limited" | "warning" | "none";

export type RuleEffect =
  | { kind: "visible"; value: boolean }
  | { kind: "printable"; value: boolean }
  | { kind: "required"; value: boolean }
  | { kind: "readOnly"; value: boolean }
  | { kind: "choices"; options: readonly string[] }
  | { kind: "style"; style: RuleStyle };

export interface FormRule {
  id: string;
  /** Boolean expression source. Must type-check to boolean. */
  when: string;
  targets: readonly RuleTarget[];
  effects: readonly RuleEffect[];
  description?: string;
}

/** What a target looks like once every rule has had its say. */
export interface ResolvedEffects {
  visible?: boolean;
  printable?: boolean;
  required?: boolean;
  readOnly?: boolean;
  choices?: readonly string[];
  style?: RuleStyle;
  /** Rules that contributed, newest last, for explaining a result. */
  appliedBy: string[];
}

export interface RuleEvaluation {
  byTarget: ReadonlyMap<string, ResolvedEffects>;
  /** Rule id to whether it fired. Null when the rule could not be evaluated. */
  fired: ReadonlyMap<string, boolean | null>;
  issues: ExpressionIssue[];
}

export interface CompiledRules {
  engineVersion: typeof EXPRESSION_ENGINE_VERSION;
  /** Rule ids in the order they resolve. Later rules win on conflict. */
  order: readonly string[];
  evaluate(values: ReadonlyMap<string, unknown>): RuleEvaluation;
}

// ---------------------------------------------------------------------------
// Rule packs
// ---------------------------------------------------------------------------

export interface RulePack {
  id: string;
  /** Bump when a rule's meaning changes; published versions record it. */
  version: string;
  label: string;
  description: string;
  rules: readonly FormRule[];
  resources?: ExpressionResources;
  /**
   * False until a qualified engineer has signed the numbers off. The compiler
   * warns on an unverified pack rather than refusing it, so a template can be
   * built and reviewed before sign-off, but nobody can mistake it for
   * certified.
   */
  engineeringVerified: boolean;
}

const RULE_PREFIX = "rule:";

/** A rule's id inside the compiled program. */
export function ruleCalculationId(ruleId: string): string {
  return `${RULE_PREFIX}${ruleId}`;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

function applyEffect(into: ResolvedEffects, effect: RuleEffect, ruleId: string) {
  switch (effect.kind) {
    case "visible":
      into.visible = effect.value;
      break;
    case "printable":
      into.printable = effect.value;
      break;
    case "required":
      into.required = effect.value;
      break;
    case "readOnly":
      into.readOnly = effect.value;
      break;
    case "choices":
      into.choices = effect.options;
      break;
    case "style":
      into.style = effect.style;
      break;
  }
  into.appliedBy.push(ruleId);
}

export interface CompileRulesOptions {
  rules: readonly FormRule[];
  inputs: readonly ExpressionInput[];
  resources?: ExpressionResources;
}

/**
 * Compile a rule set into an executable program.
 *
 * Every `when` is required to be boolean: a rule whose condition is a number
 * is a mistake that would otherwise fire on any nonzero reading.
 */
export function compileRules(
  options: CompileRulesOptions,
): Result<CompiledRules> {
  const issues: ExpressionIssue[] = [];
  const atStart = { start: 0, end: 0 };

  const seen = new Set<string>();
  for (const rule of options.rules) {
    if (!rule.id || /[{}\s]/.test(rule.id)) {
      issues.push({
        ...atStart,
        code: "rule.id",
        message: "Every rule needs a nonempty id without whitespace or braces.",
        calculationId: rule.id,
      });
    }
    if (seen.has(rule.id)) {
      issues.push({
        ...atStart,
        code: "rule.duplicate",
        message: `Duplicate rule id "${rule.id}".`,
        calculationId: rule.id,
      });
    }
    seen.add(rule.id);
    if (rule.targets.length === 0) {
      issues.push({
        ...atStart,
        code: "rule.noTargets",
        message: `Rule "${rule.id}" applies to nothing.`,
        calculationId: rule.id,
      });
    }
    if (rule.effects.length === 0) {
      issues.push({
        ...atStart,
        code: "rule.noEffects",
        message: `Rule "${rule.id}" has no effects.`,
        calculationId: rule.id,
      });
    }
  }
  if (issues.length) return { ok: false, issues };

  const compiled = compileExpressionProgram({
    engineVersion: EXPRESSION_ENGINE_VERSION,
    inputs: options.inputs,
    resources: options.resources,
    calculations: options.rules.map((rule) => ({
      id: ruleCalculationId(rule.id),
      source: rule.when,
      type: "boolean" as const,
    })),
  });
  if (!compiled.ok) return compiled;

  const program: CompiledExpressionProgram = compiled.value;
  const rules = options.rules.map((rule) => ({
    ...rule,
    targets: [...rule.targets],
    effects: [...rule.effects],
  }));

  return {
    ok: true,
    value: Object.freeze({
      engineVersion: EXPRESSION_ENGINE_VERSION,
      order: Object.freeze(rules.map((rule) => rule.id)),
      evaluate(values: ReadonlyMap<string, unknown>): RuleEvaluation {
        const evaluation = program.evaluate(values);
        const byTarget = new Map<string, ResolvedEffects>();
        const fired = new Map<string, boolean | null>();
        const issues: ExpressionIssue[] = [];

        for (const rule of rules) {
          const result = evaluation.results.get(ruleCalculationId(rule.id));
          if (!result || !result.ok) {
            fired.set(rule.id, null);
            if (result && !result.ok) issues.push(...result.issues);
            continue;
          }
          // A null condition means "not enough information yet". It must not
          // count as false, or a blank reading would hide a required field.
          if (result.value === null) {
            fired.set(rule.id, null);
            continue;
          }
          const didFire = result.value === true;
          fired.set(rule.id, didFire);
          if (!didFire) continue;

          for (const target of rule.targets) {
            const key = ruleTargetKey(target);
            const existing = byTarget.get(key) ?? { appliedBy: [] };
            for (const effect of rule.effects) {
              applyEffect(existing, effect, rule.id);
            }
            byTarget.set(key, existing);
          }
        }

        return { byTarget, fired, issues };
      },
    }),
  };
}

/** Merge several packs, keeping the order they were listed in. */
export function mergeRulePacks(packs: readonly RulePack[]): {
  rules: FormRule[];
  resources: ExpressionResources;
  unverified: string[];
} {
  const rules: FormRule[] = [];
  const lookups = new Map();
  const curves = new Map();
  const unverified: string[] = [];

  for (const pack of packs) {
    if (!pack.engineeringVerified) unverified.push(pack.id);
    for (const rule of pack.rules) {
      // Namespace so two packs cannot collide on a rule id.
      rules.push({ ...rule, id: `${pack.id}.${rule.id}` });
    }
    for (const [id, table] of pack.resources?.lookups ?? []) lookups.set(id, table);
    for (const [id, curve] of pack.resources?.curves ?? []) curves.set(id, curve);
  }

  return { rules, resources: { lookups, curves }, unverified };
}
