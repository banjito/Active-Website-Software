import { parseExpression } from "@/lib/customForms/expressions/parser";
import { EXPRESSION_LIMITS } from "@/lib/customForms/expressions/types";

type Translation = { ok: true; source: string } | { ok: false; message: string };
type Token = { kind: "number" | "string" | "sheet" | "name" | "symbol" | "end"; text: string };
type Scalar = {
  type: "number" | "string" | "boolean";
  source: string;
  /** Only an actual cell reference, not an expression returning a number. */
  reference?: string;
  literalNumber?: number;
};
type Value = Scalar | { type: "range"; references: string[] };

const LIMITS = { depth: 32, rangeCells: 256, referenceVisits: 512, referenceIdLength: 512 } as const;
const FUNCTIONS = new Set(["SUM", "AVERAGE", "MIN", "MAX", "IF", "AND", "OR", "NOT", "ABS", "ROUND"]);
const AGGREGATES = new Set(["SUM", "AVERAGE", "MIN", "MAX"]);
// Excel gives all comparisons equal precedence, unlike typed-1. Emitted operators are parenthesized.
const PRECEDENCE: Readonly<Record<string, number>> = { "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 };

class UnsupportedFormula extends Error {}
function unsupported(message: string): never { throw new UnsupportedFormula(message); }

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index++; continue; }
    const ch = source[index];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let text = "";
      let closed = false;
      index++;
      while (index < source.length) {
        const next = source[index++];
        if (next !== quote) { text += next; continue; }
        if (source[index] === quote) { text += quote; index++; continue; }
        closed = true;
        break;
      }
      if (!closed) unsupported("Unclosed Excel string or quoted sheet name.");
      tokens.push({ kind: quote === '"' ? "string" : "sheet", text });
    } else {
      const rest = source.slice(index);
      // This must precede numbers: Excel allows sheet names such as 2025 and 2025_Data.
      const sheet = rest.match(/^[\p{L}\p{N}_][\p{L}\p{N}_.]*(?=\s*!)/u);
      const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const name = rest.match(/^[\p{L}_$][\p{L}\p{N}_.$]*/u);
      if (sheet) { tokens.push({ kind: "sheet", text: sheet[0] }); index += sheet[0].length; }
      else if (number) { tokens.push({ kind: "number", text: number[0] }); index += number[0].length; }
      else if (name) { tokens.push({ kind: "name", text: name[0] }); index += name[0].length; }
      else {
        if (ch === "#") unsupported("Excel error references/literals (including #REF!) and spill references are unsupported.");
        if (ch === "[" || ch === "]") unsupported("External workbook and structured table references are unsupported.");
        if (ch === "{" || ch === "}") unsupported("Excel array formulas and array constants are unsupported.");
        if (!"+-*/()=<>:,!".includes(ch)) unsupported(`Unsupported Excel syntax: ${JSON.stringify(ch)}. No script, percent, power, concatenation or implicit-intersection operators are supported.`);
        const pair = rest.slice(0, 2);
        const text = ["<=", ">=", "<>"].includes(pair) ? pair : ch;
        tokens.push({ kind: "symbol", text });
        index += text.length;
      }
    }
    if (tokens.length > EXPRESSION_LIMITS.tokens) unsupported(`Formula exceeds the ${EXPRESSION_LIMITS.tokens}-token limit.`);
  }
  tokens.push({ kind: "end", text: "" });
  return tokens;
}

function scalar(value: Value): Scalar {
  if (value.type === "range") unsupported("Rectangular ranges are supported only as direct SUM, AVERAGE, MIN or MAX arguments.");
  return value;
}
function numeric(value: Value, context: string): Scalar {
  const result = scalar(value);
  if (result.type !== "number") unsupported(`${context} requires numbers. Excel text/boolean coercion is unsupported; references must be declared numeric.`);
  return result;
}
function emitted(type: Scalar["type"], source: string): Scalar {
  if (source.length > EXPRESSION_LIMITS.sourceLength) unsupported(`Translated formula exceeds the ${EXPRESSION_LIMITS.sourceLength}-character engine limit.`);
  return { type, source };
}
function logical(value: Value, context: string): string {
  const result = scalar(value);
  if (result.type === "string") unsupported(`${context} cannot coerce text to a logical value.`);
  return result.type === "boolean" ? result.source : `(${result.source} != 0)`;
}

function validSheet(sheet: string): void {
  if (!sheet || sheet.length > 31 || /[\[\]:*?/\\\u0000-\u001f]/.test(sheet)) {
    unsupported("Invalid sheet name. External workbook and 3-D sheet references are unsupported.");
  }
}
function cellAddress(text: string): { address: string; column: number; row: number } {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(text);
  if (!match) unsupported("Expected a bounded A1 cell address. Named references, whole-row/column ranges and 3-D references are unsupported.");
  const letters = match[1].toUpperCase();
  const column = [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  if (column > 16384 || row > 1048576) unsupported("Cell address exceeds Excel's XFD1048576 boundary.");
  return { address: `${letters}${row}`, column, row };
}
function columnName(column: number): string {
  let result = "";
  while (column > 0) {
    column--;
    result = String.fromCharCode(65 + column % 26) + result;
    column = Math.floor(column / 26);
  }
  return result;
}

function aggregate(name: string, args: Value[]): Scalar {
  const items: Scalar[] = args.flatMap((arg) => arg.type === "range"
    ? arg.references.map((reference): Scalar => ({ type: "number", source: `coalesce(${reference}, 0)`, reference }))
    : [numeric(arg, name)]);
  if (items.length > LIMITS.referenceVisits) unsupported(`Aggregate exceeds the ${LIMITS.referenceVisits}-value limit.`);
  const list = (values: string[]) => `[${values.join(", ")}]`;
  const sum = `sum(${list(items.map((item) => item.source))})`;
  if (name === "SUM") return emitted("number", sum);
  const hasReferences = items.some((item) => item.reference !== undefined);
  if (!hasReferences) return emitted("number", `${name === "AVERAGE" ? "avg" : name.toLowerCase()}(${list(items.map((item) => item.source))})`);

  // Excel ignores blank referenced cells, but counts literal/expression zeroes. typed-1 does neither.
  const count = `sum(${list(items.map((item) => item.reference ? `if(isnull(${item.reference}), 0, 1)` : "1"))})`;
  if (name === "AVERAGE") return emitted("number", `(${sum} / ${count})`);
  // Finite neutral values avoid inventing a zero minimum/maximum for partially blank ranges.
  // The count guard restores Excel's zero result when every referenced cell is blank.
  const neutral = name === "MIN" ? "1.7976931348623157e308" : "-1.7976931348623157e308";
  const values = items.map((item) => item.reference ? `coalesce(${item.reference}, ${neutral})` : item.source);
  return emitted("number", `if((${count} == 0), 0, ${name.toLowerCase()}(${list(values)}))`);
}

function call(name: string, args: Value[]): Scalar {
  const arity = name === "IF" ? 3 : name === "ROUND" ? 2 : ["NOT", "ABS"].includes(name) ? 1 : undefined;
  if (arity === undefined ? args.length < 1 : args.length !== arity) {
    unsupported(`${name} requires ${arity ?? "at least one"} argument${arity === 1 ? "" : "s"}; omitted arguments are unsupported.`);
  }
  if (AGGREGATES.has(name)) return aggregate(name, args);
  if (name === "IF") {
    const condition = logical(args[0], name);
    const yes = scalar(args[1]);
    const no = scalar(args[2]);
    if (yes.type !== no.type) unsupported("IF branches must have the same type. Mixed text/number/boolean results are unsupported by typed-1.");
    return emitted(yes.type, `if(${condition}, ${yes.source}, ${no.source})`);
  }
  if (name === "AND" || name === "OR") {
    const values = args.map((arg) => {
      if (scalar(arg).reference) unsupported(`${name} needs explicit comparisons instead of bare cell references: Excel ignores referenced blanks/text and typed-1 cannot safely reproduce that logical coercion.`);
      return `if(${logical(arg, name)}, 1, 0)`;
    });
    // Excel AND/OR evaluate every argument; engine and/or short-circuit and can hide errors.
    return emitted("boolean", `(sum([${values.join(", ")}]) ${name === "AND" ? `== ${values.length}` : "> 0"})`);
  }
  if (name === "NOT") return emitted("boolean", `(!${logical(args[0], name)})`);
  const value = numeric(args[0], name);
  if (name === "ABS") return emitted("number", `abs(${value.source})`);
  const digits = numeric(args[1], name);
  if (digits.literalNumber !== 0) unsupported("Only ROUND(number, 0) is supported. Decimal, negative or computed precision cannot be faithfully translated: typed-1 uses binary toFixed rounding (for example 1.005 at 2 digits differs from Excel).");
  // Supplying zero selects toFixed(0), which rounds half away from zero for both signs.
  // round(x) instead uses Math.round and incorrectly maps -1.5 to -1. Normalize negative zero.
  return emitted("number", `(round(${value.source}, 0) + 0)`);
}

/**
 * Translate only this bounded, scalar Excel subset to typed-1; never execute workbook code.
 *
 * Numeric references are intentional: the resolver supplies ids, NOT type/value metadata.
 * Callers MUST compile using the real slot declarations (do not relabel text/boolean slots
 * as numbers), compare workbook caches and retain their publish-review gate. `ok` means
 * translation, not workbook verification. Numeric-input UI strings follow typed-1's boundary
 * parser; this is NOT support for Excel cells containing numeric text. Those must stay text.
 *
 * All references (including unused IF branches) must map. Blank numeric cells become zero
 * in scalar contexts and are ignored as direct aggregate arguments. Text comparisons,
 * mixed-type IF results, implicit text/boolean arithmetic, bare AND/OR references, nonzero
 * ROUND precision and every function outside FUNCTIONS are deliberately unsupported.
 * Text/boolean literals and same-type IF outputs are supported, not text/boolean cell refs.
 * Standard finite floating-point arithmetic is used, not Excel's display/precision settings.
 * Limits: 8192 input/output characters, 2048 input/output tokens, 32 input nesting levels,
 * 256 cells per rectangle, 512 reference visits; generated trees also obey engine limits.
 */
export function translateExcelFormula(
  formula: string,
  sheet: string,
  resolveReference: (sheet: string, address: string) => string | undefined,
): Translation {
  try {
    if (typeof formula !== "string" || typeof sheet !== "string" || typeof resolveReference !== "function") unsupported("Expected formula text, a sheet name and a reference resolver.");
    if (formula.length > EXPRESSION_LIMITS.sourceLength) unsupported(`Formula exceeds the ${EXPRESSION_LIMITS.sourceLength}-character input limit.`);
    validSheet(sheet);
    let input = formula.trim();
    if (input.startsWith("=")) input = input.slice(1);
    const tokens = tokenize(input);
    let index = 0;
    let visits = 0;
    const resolved = new Map<string, string>();
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    const expect = (text: string) => {
      if (peek().kind !== "symbol" || peek().text !== text) unsupported(`Expected '${text}' in Excel formula; omitted arguments and malformed expressions are unsupported.`);
      take();
    };
    const reference = (sheetName: string, address: string): string => {
      if (++visits > LIMITS.referenceVisits) unsupported(`Formula exceeds the ${LIMITS.referenceVisits}-reference limit.`);
      const key = JSON.stringify([sheetName, address]);
      const cached = resolved.get(key);
      if (cached !== undefined) return cached;
      let id: string | undefined;
      try { id = resolveReference(sheetName, address); }
      catch { unsupported(`Reference resolver failed for ${sheetName}!${address}; cached values cannot replace a missing mapping.`); }
      if (id === undefined) unsupported(`Missing mapped reference ${sheetName}!${address}; cached values cannot replace a missing mapping.`);
      if (typeof id !== "string" || !id || id.length > LIMITS.referenceIdLength || /[{}\s\u0000-\u001f\u007f]/.test(id)) unsupported(`Invalid stable reference id for ${sheetName}!${address}.`);
      const source = `{${id}}`;
      resolved.set(key, source);
      return source;
    };
    const location = (defaultSheet: string) => {
      let sheetName = defaultSheet;
      if (peek().kind === "sheet") {
        sheetName = take().text;
        validSheet(sheetName);
        expect("!");
      }
      const token = take();
      if (token.kind !== "name") unsupported("Expected an A1 reference. Named references and whole-row/column or 3-D ranges are unsupported.");
      return { sheetName, ...cellAddress(token.text) };
    };
    const parseReference = (): Value => {
      const first = location(sheet);
      if (peek().kind !== "symbol" || peek().text !== ":") {
        const raw = reference(first.sheetName, first.address);
        return { ...emitted("number", `coalesce(${raw}, 0)`), reference: raw };
      }
      take();
      const last = location(first.sheetName);
      if (first.sheetName.toLowerCase() !== last.sheetName.toLowerCase()) unsupported("3-D ranges spanning different sheets are unsupported.");
      const left = Math.min(first.column, last.column);
      const right = Math.max(first.column, last.column);
      const top = Math.min(first.row, last.row);
      const bottom = Math.max(first.row, last.row);
      const cells = (right - left + 1) * (bottom - top + 1);
      if (cells > LIMITS.rangeCells) unsupported(`Range exceeds the ${LIMITS.rangeCells}-cell limit.`);
      if (visits + cells > LIMITS.referenceVisits) unsupported(`Formula exceeds the ${LIMITS.referenceVisits}-reference limit.`);
      const references: string[] = [];
      for (let row = top; row <= bottom; row++) {
        for (let column = left; column <= right; column++) references.push(reference(first.sheetName, `${columnName(column)}${row}`));
      }
      return { type: "range", references };
    };
    const parse = (minimum = 0, depth = 0): Value => {
      if (depth > LIMITS.depth) unsupported(`Formula exceeds the ${LIMITS.depth}-level nesting limit.`);
      const token = peek();
      let left: Value;
      if (token.kind === "number") {
        take();
        const value = Number(token.text);
        if (!Number.isFinite(value)) unsupported("Excel numeric literals must be finite.");
        left = { ...emitted("number", String(value)), literalNumber: value };
      } else if (token.kind === "string") {
        take();
        left = emitted("string", JSON.stringify(token.text));
      } else if (token.kind === "symbol" && ["+", "-"].includes(token.text)) {
        take();
        const operand = numeric(parse(4, depth + 1), "Unary arithmetic");
        left = emitted("number", `(${token.text}${operand.source})`);
        if (operand.literalNumber !== undefined) left.literalNumber = token.text === "-" ? -operand.literalNumber : operand.literalNumber;
      } else if (token.kind === "symbol" && token.text === "(") {
        take();
        left = parse(0, depth + 1);
        expect(")");
      } else if (token.kind === "name" && tokens[index + 1].text === "(" && tokens[index + 1].kind === "symbol") {
        const name = take().text.toUpperCase();
        if (!FUNCTIONS.has(name)) unsupported(`Unsupported Excel function ${name.slice(0, 80)}. Supported: SUM, AVERAGE, MIN, MAX, IF, AND, OR, NOT, ABS, ROUND(number, 0).`);
        expect("(");
        const args: Value[] = [];
        if (peek().text !== ")" || peek().kind !== "symbol") {
          args.push(parse(0, depth + 1));
          while (peek().kind === "symbol" && peek().text === ",") { take(); args.push(parse(0, depth + 1)); }
        }
        expect(")");
        left = call(name, args);
      } else if (token.kind === "name" && ["TRUE", "FALSE"].includes(token.text.toUpperCase())) {
        take();
        left = emitted("boolean", token.text.toLowerCase());
      } else if (token.kind === "name" || token.kind === "sheet") {
        left = parseReference();
      } else {
        unsupported("Expected an Excel value, A1 reference or supported function; empty arguments and malformed expressions are unsupported.");
      }
      while (peek().kind === "symbol") {
        const operator = peek().text;
        const precedence = PRECEDENCE[operator];
        if (precedence === undefined || precedence < minimum) break;
        take();
        const right = scalar(parse(precedence + 1, depth + 1));
        const a = scalar(left);
        if (["=", "<>"].includes(operator) && a.type === "boolean" && right.type === "boolean") {
          left = emitted("boolean", `(${a.source} ${operator === "=" ? "==" : "!="} ${right.source})`);
        } else {
          if (precedence === 1 && (a.type !== "number" || right.type !== "number")) unsupported("Only numeric comparisons and boolean equality are supported. Excel text comparisons are case-insensitive and mixed-type comparisons differ from typed-1.");
          numeric(a, "Arithmetic");
          numeric(right, "Arithmetic");
          const target = operator === "=" ? "==" : operator === "<>" ? "!=" : operator;
          left = emitted(precedence === 1 ? "boolean" : "number", `(${a.source} ${target} ${right.source})`);
        }
      }
      return left;
    };
    const source = scalar(parse()).source;
    if (peek().kind !== "end") unsupported("Unexpected trailing Excel syntax. Unions, intersections, named references and whole-row/column ranges are unsupported.");
    const parsed = parseExpression(source);
    if (!parsed.ok) unsupported(`Translated formula exceeds the target parser's syntax or resource limits: ${parsed.issues[0].message}`);
    return { ok: true, source };
  } catch (error) {
    if (error instanceof UnsupportedFormula) return { ok: false, message: error.message };
    throw error;
  }
}
