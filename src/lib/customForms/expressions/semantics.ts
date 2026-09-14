import {
  EXPRESSION_LIMITS,
  ExpressionFailure,
  RESULT_VALUES,
  type ExpressionNode,
  type ExpressionValue,
  type InferredType,
  type SourceSpan,
  type ValueType,
} from "@/lib/customForms/expressions/types";
import {
  convertUnits,
  interpolateCurve,
  knownUnit,
  lookupValue,
  unitDimension,
  EMPTY_RESOURCES,
  type ExpressionResources,
} from "@/lib/customForms/expressions/resources";

const NUMERIC = new Set(["min", "max", "abs", "avg", "sum", "sqrt", "round", "exp"]);
const isNullType = (type: InferredType) => type === "null" || type === "null[]";

function requireType(actual: InferredType, expected: InferredType[], node: SourceSpan): void {
  if (actual !== "null" && !expected.includes(actual)) {
    throw new ExpressionFailure("type.mismatch", `Expected ${expected.join(" or ")}, received ${actual}.`, node);
  }
}

function commonType(types: InferredType[], node: SourceSpan): InferredType {
  const concrete = [...new Set(types.filter((type) => !isNullType(type)))];
  if (concrete.length > 1) throw new ExpressionFailure("type.mismatch", `Values must share a type, received ${concrete.join(" and ")}.`, node);
  const result: InferredType = concrete.length ? concrete[0] : (types.includes("null[]") ? "null[]" : "null");
  if (types.includes("null[]") && result !== "null[]" && !result.endsWith("[]")) {
    throw new ExpressionFailure("type.mismatch", "Cannot mix a list and a scalar value.", node);
  }
  return result;
}

export function isAssignable(actual: InferredType, expected: ValueType): boolean {
  return actual === "null" || actual === expected || (actual === "null[]" && expected.endsWith("[]"));
}

/** Checks every branch, including branches that are lazy at evaluation time. */
export function inferNode(node: ExpressionNode, referenceType: (id: string) => InferredType, resources: ExpressionResources = EMPTY_RESOURCES): InferredType {
  switch (node.kind) {
    case "literal": return node.value === null ? "null" : typeof node.value as "number" | "string" | "boolean";
    case "reference": return referenceType(node.id);
    case "list": {
      const itemType = commonType(node.items.map((item) => inferNode(item, referenceType, resources)), node);
      if (itemType.endsWith("[]")) throw new ExpressionFailure("type.list", "Nested lists are not supported.", node);
      return `${itemType}[]` as InferredType;
    }
    case "unary": {
      const expected = node.operator === "not" ? "boolean" : "number";
      requireType(inferNode(node.operand, referenceType, resources), [expected], node.operand);
      return expected;
    }
    case "binary": {
      const left = inferNode(node.left, referenceType, resources);
      const right = inferNode(node.right, referenceType, resources);
      if (["and", "or"].includes(node.operator)) {
        requireType(left, ["boolean"], node.left);
        requireType(right, ["boolean"], node.right);
        return "boolean";
      }
      if (["==", "!="].includes(node.operator)) {
        const type = commonType([left, right], node);
        // Results compare to results, which is how a rule tests a verdict.
        requireType(type, ["number", "string", "boolean", "result"], node);
        return "boolean";
      }
      requireType(left, ["number"], node.left);
      requireType(right, ["number"], node.right);
      return ["+", "-", "*", "/"].includes(node.operator) ? "number" : "boolean";
    }
    case "call": {
      const name = node.name;
      const arity: Record<string, [number, number]> = {
        if: [3, 3], coalesce: [2, Infinity], isnull: [1, 1], isnumber: [1, 1], textmatches: [3, 3],
        min: [1, Infinity], max: [1, Infinity], avg: [1, Infinity], sum: [1, Infinity],
        abs: [1, 1], sqrt: [1, 1], exp: [1, 1], round: [1, 2], concat: [1, Infinity],
        verdict: [1, 1], lookup: [2, 2], interpolate: [2, 2], convert: [3, 3],
      };
      const signature = Object.prototype.hasOwnProperty.call(arity, name) ? arity[name] : undefined;
      if (!signature) throw new ExpressionFailure("function.unknown", `Unknown function "${name}".`, node);
      if (node.args.length < signature[0] || node.args.length > signature[1]) {
        throw new ExpressionFailure("function.arity", `Wrong number of arguments for ${name}.`, node);
      }
      const types = node.args.map((arg) => inferNode(arg, referenceType, resources));
      if (name === "if") {
        requireType(types[0], ["boolean"], node.args[0]);
        return commonType(types.slice(1), node);
      }
      if (name === "coalesce") return commonType(types, node);
      if (name === "isnull") return "boolean";
      if (name === "isnumber" || name === "textmatches") {
        requireType(types[0], ["number", "string", "boolean", "result"], node.args[0]);
        if (name === "textmatches") {
          for (const [index, expected] of [[1, "string"], [2, "boolean"]] as const) {
            if (types[index] !== expected) {
              throw new ExpressionFailure("type.mismatch", `Expected ${expected}, received ${types[index]}.`, node.args[index]);
            }
          }
        }
        return "boolean";
      }
      if (name === "concat") {
        types.forEach((type, index) => requireType(type, ["string"], node.args[index]));
        return "string";
      }
      if (name === "verdict") {
        requireType(types[0], ["string", "result"], node.args[0]);
        return "result";
      }
      if (name === "lookup") {
        const tableId = literalName(node.args[0], "lookup table");
        const table = resources.lookups.get(tableId);
        if (!table) throw new ExpressionFailure("lookup.unknown", `Unknown lookup table "${tableId}".`, node.args[0]);
        requireType(types[1], [table.keyType], node.args[1]);
        return table.valueType;
      }
      if (name === "interpolate") {
        const curveId = literalName(node.args[0], "interpolation curve");
        if (!resources.curves.has(curveId)) throw new ExpressionFailure("curve.unknown", `Unknown interpolation curve "${curveId}".`, node.args[0]);
        requireType(types[1], ["number"], node.args[1]);
        return "number";
      }
      if (name === "convert") {
        requireType(types[0], ["number"], node.args[0]);
        const from = literalName(node.args[1], "unit");
        const to = literalName(node.args[2], "unit");
        for (const [unit, span] of [[from, node.args[1]], [to, node.args[2]]] as const) {
          if (!knownUnit(unit)) throw new ExpressionFailure("unit.unknown", `Unknown unit "${unit}".`, span);
        }
        if (unitDimension(from) !== unitDimension(to)) {
          throw new ExpressionFailure("unit.dimension", `Cannot convert ${unitDimension(from)} (${from}) to ${unitDimension(to)} (${to}).`, node);
        }
        return "number";
      }
      const allowed: InferredType[] = ["number"];
      if (["min", "max", "avg", "sum"].includes(name)) allowed.push("number[]", "null[]");
      types.forEach((type, index) => requireType(type, allowed, node.args[index]));
      return "number";
    }
  }
}

/**
 * Resource ids and unit names must be literal text, never a computed value, so
 * the compiler can prove the table exists before anyone fills the form in.
 */
function literalName(node: ExpressionNode, what: string): string {
  if (node.kind !== "literal" || typeof node.value !== "string") {
    throw new ExpressionFailure("argument.literal", `The ${what} must be written as literal text.`, node);
  }
  return node.value;
}

function finite(value: number, span: SourceSpan): number {
  if (!Number.isFinite(value)) throw new ExpressionFailure("number.nonFinite", "Calculation produced a non-finite number.", span);
  return value;
}

function textMatches(value: ExpressionValue, pattern: string, caseSensitive: boolean, span: SourceSpan): boolean {
  if (pattern.length > EXPRESSION_LIMITS.sourceLength || (typeof value === "string" && value.length > EXPRESSION_LIMITS.sourceLength)) {
    throw new ExpressionFailure("limit.string", "Text matching arguments are too long.", span);
  }
  if (typeof value !== "string") return false;

  type Token = { kind: "star" | "any" } | { kind: "literal"; value: string };
  const fold = (character: string) => caseSensitive ? character : character.toLowerCase();
  const characters = Array.from(value, fold);
  const patternCharacters = Array.from(pattern);
  const tokens: Token[] = [];
  for (let index = 0; index < patternCharacters.length; index++) {
    const character = patternCharacters[index];
    const next = patternCharacters[index + 1];
    if (character === "~" && (next === "*" || next === "?" || next === "~")) {
      tokens.push({ kind: "literal", value: fold(next) });
      index++;
    } else if (character === "*") {
      if (tokens[tokens.length - 1]?.kind !== "star") tokens.push({ kind: "star" });
    } else if (character === "?") {
      tokens.push({ kind: "any" });
    } else {
      tokens.push({ kind: "literal", value: fold(character) });
    }
  }

  // Retry only the latest star, never recursively or through regex. Worst-case
  // work is O(text length * pattern length), bounded by the engine string limit.
  let textIndex = 0;
  let tokenIndex = 0;
  let starIndex = -1;
  let starEnd = 0;
  while (textIndex < characters.length) {
    const token = tokens[tokenIndex];
    if (token?.kind === "any" || (token?.kind === "literal" && token.value === characters[textIndex])) {
      textIndex++;
      tokenIndex++;
    } else if (token?.kind === "star") {
      starIndex = tokenIndex++;
      starEnd = textIndex;
    } else if (starIndex >= 0) {
      tokenIndex = starIndex + 1;
      textIndex = ++starEnd;
    } else {
      return false;
    }
  }
  while (tokens[tokenIndex]?.kind === "star") tokenIndex++;
  return tokenIndex === tokens.length;
}

/** Browser input strings are parsed only at the typed input boundary, not by operators. */
export function readTypedInput(value: unknown, type: ValueType, span: SourceSpan): ExpressionValue {
  if (typeof value === "string" && value.length > EXPRESSION_LIMITS.sourceLength) throw new ExpressionFailure("limit.string", "Input text is too long.", span);
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (type.endsWith("[]")) {
    if (!Array.isArray(value)) throw new ExpressionFailure("input.type", `Expected ${type}.`, span);
    if (value.length > EXPRESSION_LIMITS.listLength) throw new ExpressionFailure("limit.list", "Input list is too long.", span);
    const scalar = type.slice(0, -2) as "number" | "string" | "boolean";
    return Array.from(value, (item) => readTypedInput(item, scalar, span)) as readonly (number | string | boolean | null)[];
  }
  if (type === "result") {
    if (typeof value === "string" && (RESULT_VALUES as readonly string[]).includes(value)) return value;
    throw new ExpressionFailure("input.result", `Expected one of ${RESULT_VALUES.join(", ")}.`, span);
  }
  if (type === "number") {
    if (typeof value === "number") return finite(value, span);
    if (typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
      return finite(Number(value.trim()), span);
    }
  } else if (typeof value === type) return value as string | boolean;
  throw new ExpressionFailure("input.type", `Expected ${type}; input is not a valid ${type}.`, span);
}

/** Receives only parsed, type-checked trees and typed reference values. */
export function evaluateNode(node: ExpressionNode, read: (id: string, span: SourceSpan) => ExpressionValue, resources: ExpressionResources = EMPTY_RESOURCES): ExpressionValue {
  switch (node.kind) {
    case "literal": return node.value;
    case "reference": return read(node.id, node);
    case "list": return node.items.map((item) => evaluateNode(item, read, resources)) as readonly (number | string | boolean | null)[];
    case "unary": {
      const value = evaluateNode(node.operand, read, resources);
      if (value === null) return null;
      return node.operator === "not" ? !value : node.operator === "-" ? -(value as number) : value;
    }
    case "binary": {
      const left = evaluateNode(node.left, read, resources);
      if (node.operator === "and" && left === false) return false;
      if (node.operator === "or" && left === true) return true;
      const right = evaluateNode(node.right, read, resources);
      if (node.operator === "and" && right === false) return false;
      if (node.operator === "or" && right === true) return true;
      if (left === null || right === null) return null;
      const a = left as number;
      const b = right as number;
      switch (node.operator) {
        case "+": return finite(a + b, node);
        case "-": return finite(a - b, node);
        case "*": return finite(a * b, node);
        case "/":
          if (b === 0) throw new ExpressionFailure("number.divisionByZero", "Cannot divide by zero.", node);
          return finite(a / b, node);
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
        case "==": return left === right;
        case "!=": return left !== right;
        case "and": return true;
        case "or": return false;
        default: throw new ExpressionFailure("operator.unknown", "Unknown operator.", node);
      }
    }
    case "call": {
      const name = node.name;
      if (name === "if") {
        const condition = evaluateNode(node.args[0], read, resources);
        return condition === null ? null : evaluateNode(node.args[condition ? 1 : 2], read, resources);
      }
      if (name === "coalesce") {
        for (const arg of node.args) {
          const value = evaluateNode(arg, read, resources);
          if (value !== null) return value;
        }
        return null;
      }
      const values = node.args.map((arg) => evaluateNode(arg, read, resources));
      if (name === "isnull") return values[0] === null;
      if (name === "isnumber") return typeof values[0] === "number";
      if (name === "textmatches") {
        if (typeof values[1] !== "string") throw new ExpressionFailure("type.mismatch", "Text matching requires a string pattern.", node.args[1]);
        if (typeof values[2] !== "boolean") throw new ExpressionFailure("type.mismatch", "Text matching requires a boolean caseSensitive flag.", node.args[2]);
        return textMatches(values[0], values[1], values[2], node);
      }
      if (values.includes(null)) return null;
      if (name === "verdict") {
        const text = values[0] as string;
        if (!(RESULT_VALUES as readonly string[]).includes(text)) {
          throw new ExpressionFailure("result.unknown", `"${text}" is not one of ${RESULT_VALUES.join(", ")}.`, node.args[0]);
        }
        return text;
      }
      if (name === "lookup") {
        const table = resources.lookups.get((node.args[0] as { value: string }).value)!;
        return lookupValue(table, values[1] as string | number);
      }
      if (name === "interpolate") {
        const curve = resources.curves.get((node.args[0] as { value: string }).value)!;
        return interpolateCurve(curve, values[1] as number, node);
      }
      if (name === "convert") {
        return convertUnits(
          values[0] as number,
          (node.args[1] as { value: string }).value,
          (node.args[2] as { value: string }).value,
          node,
        );
      }
      if (name === "concat") {
        if ((values as string[]).reduce((length, value) => length + value.length, 0) > EXPRESSION_LIMITS.sourceLength) throw new ExpressionFailure("limit.string", "Concatenated text is too long.", node);
        return (values as string[]).join("");
      }
      if (NUMERIC.has(name)) {
        const itemCount = values.reduce<number>((count, value) => count + (Array.isArray(value) ? value.length : 1), 0);
        if (itemCount > EXPRESSION_LIMITS.listLength) throw new ExpressionFailure("limit.list", "Calculation consumes too many list values.", node);
        const flattened = values.flat() as (number | null)[];
        if (flattened.includes(null) || flattened.length === 0) return null;
        const numbers = flattened as number[];
        let result: number;
        switch (name) {
          case "abs": result = Math.abs(numbers[0]); break;
          case "sqrt":
            if (numbers[0] < 0) throw new ExpressionFailure("number.domain", "Square root requires a nonnegative number.", node);
            result = Math.sqrt(numbers[0]); break;
          // Temperature correction factors are exponential; `finite` below
          // turns an overflow into an error rather than Infinity.
          case "exp": result = Math.exp(numbers[0]); break;
          case "round": {
            const decimals = numbers[1];
            if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 12)) {
              throw new ExpressionFailure("number.decimals", "Round precision must be an integer from 0 to 12.", node);
            }
            result = decimals === undefined ? Math.round(numbers[0]) : Number(numbers[0].toFixed(decimals));
            break;
          }
          case "min": result = numbers.reduce((a, b) => Math.min(a, b)); break;
          case "max": result = numbers.reduce((a, b) => Math.max(a, b)); break;
          case "avg": result = numbers.reduce((sum, value) => sum + value / numbers.length, 0); break;
          default: result = numbers.reduce((sum, value) => sum + value, 0);
        }
        return finite(result, node);
      }
      throw new ExpressionFailure("function.unknown", `Unknown function "${name}".`, node);
    }
  }
}
