import { parseExpression } from "@/lib/customForms/expressions/parser";
import { EXPRESSION_LIMITS } from "@/lib/customForms/expressions/types";

type Translation =
  | { ok: true; source: string; blankText?: boolean; notes?: string[] }
  | { ok: false; message: string };
type Token = { kind: "number" | "string" | "sheet" | "name" | "symbol" | "end"; text: string };
type Scalar = {
  type: "number" | "string" | "boolean" | "null" | "reference";
  source: string;
  /** Only an actual cell reference, not an expression returning a number. */
  reference?: string;
  literalNumber?: number;
  literalString?: string;
  /** Excel empty text represented by a typed missing value, not a genuinely empty cell. */
  blankText?: boolean;
};
type Value = Scalar | { type: "range"; references: string[]; blankText?: boolean } | { type: "find"; matched: string };

const LIMITS = { depth: 32, rangeCells: 256, referenceVisits: 512, referenceIdLength: 512 } as const;
const FUNCTIONS = new Set(["SUM", "AVERAGE", "MIN", "MAX", "IF", "AND", "OR", "NOT", "ABS", "ROUND", "TRUE", "FALSE", "ISNUMBER", "COUNTIF", "FIND", "EXP"]);
const AGGREGATES = new Set(["SUM", "AVERAGE", "MIN", "MAX"]);
// Excel gives all comparisons equal precedence, unlike typed-1. Emitted operators are parenthesized.
const PRECEDENCE: Readonly<Record<string, number>> = { "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 };

class UnsupportedFormula extends Error {}

/**
 * Caveats raised while translating the formula in hand.
 *
 * A translation that is faithful in every case needs no note; these are the
 * places where it is close but not identical, and saying so is the difference
 * between a translation and a claim. Collected per call, which is safe because
 * translation is synchronous and translates one formula at a time.
 */
let translationNotes: string[] = [];
function note(text: string): void {
  if (!translationNotes.includes(text)) translationNotes.push(text);
}
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
  if (value.type === "find") unsupported("FIND is supported only directly inside ISNUMBER, with literal search text and an omitted or 1 start position.");
  return value;
}
function numeric(value: Value, context: string): Scalar {
  const result = scalar(value);
  if (result.blankText) unsupported(`${context} uses a value that may return empty text. Excel empty-text arithmetic/comparison cannot be replaced with numeric zero or a missing value.`);
  if (result.type === "reference") return { ...result, type: "number", source: result.reference ? `coalesce(${result.source}, 0)` : result.source };
  if (result.type !== "number") unsupported(`${context} requires numbers. Excel text/boolean coercion is unsupported; references must be declared numeric.`);
  return result;
}
function emitted(type: Scalar["type"], source: string): Scalar {
  if (source.length > EXPRESSION_LIMITS.sourceLength) unsupported(`Translated formula exceeds the ${EXPRESSION_LIMITS.sourceLength}-character engine limit.`);
  return { type, source };
}
function logical(value: Value, context: string): string {
  const result = scalar(value);
  if (result.blankText) unsupported(`${context} uses a value that may return empty text; it cannot be used as a logical condition.`);
  if (result.type === "boolean") return result.source;
  return `(${numeric(result, context).source} != 0)`;
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
  if (args.some((arg) => arg.type === "range" && arg.blankText)) unsupported(`${name} includes a formula returning empty text; it cannot be treated as a blank numeric cell.`);
  const items: Scalar[] = args.flatMap((arg) => arg.type === "range"
    ? arg.references.map((reference): Scalar => ({ type: "number", source: `coalesce(${reference}, 0)`, reference }))
    : [numeric(scalar(arg), name)]);
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

function escapedPattern(text: string): string {
  return text.replace(/[~*?]/g, "~$&");
}

/**
 * Literals a spreadsheet uses to mean "there is no number here".
 *
 * A form cannot hold "N/A" in a numeric cell: the type checker refuses it, and
 * refusing was costing eleven of the MCCB sheet's formulas. They become blank
 * instead, which is what the cell shows, and each one is reported so the person
 * reviewing the draft can see the marker did not survive.
 */
const NO_RESULT_MARKERS = ["", "n/a", "na", "-", "--", "\u2013", "\u2014"];
function noResultMarker(value: Scalar): boolean {
  return value.literalString !== undefined && NO_RESULT_MARKERS.includes(value.literalString.trim().toLowerCase());
}

function isBlank(value: Scalar): string {
  return `(isnull(${value.source}) or textmatches(${value.source}, "", true))`;
}

function call(name: string, args: Value[]): Value {
  if (name === "FIND") {
    if (args.length !== 2 && args.length !== 3) unsupported("FIND requires two or three arguments.");
    const needle = scalar(args[0]);
    const text = scalar(args[1]);
    if (!needle.literalString || !["string", "reference"].includes(text.type)) unsupported("FIND inside ISNUMBER requires nonempty literal search text and a text cell or text value.");
    if (args.length === 3 && scalar(args[2]).literalNumber !== 1) unsupported("FIND supports only an omitted or literal 1 start position.");
    // Only this predicate is translated: no match is false here, but an error for standalone FIND.
    // coalesce with text also makes the real slot declarations reject numeric/boolean haystacks.
    return { type: "find", matched: `textmatches(coalesce(${text.source}, ""), ${JSON.stringify(`*${escapedPattern(needle.literalString)}*`)}, true)` };
  }
  const arity = ["TRUE", "FALSE"].includes(name) ? 0 : name === "IF" ? 3 : ["ROUND", "COUNTIF"].includes(name) ? 2 : ["NOT", "ABS", "ISNUMBER", "EXP"].includes(name) ? 1 : undefined;
  if (arity === undefined ? args.length < 1 : args.length !== arity) {
    unsupported(`${name} requires ${arity ?? "at least one"} argument${arity === 1 ? "" : "s"}; omitted arguments are unsupported.`);
  }
  if (AGGREGATES.has(name)) return aggregate(name, args);
  if (name === "TRUE" || name === "FALSE") return emitted("boolean", name.toLowerCase());
  if (name === "ISNUMBER") return emitted("boolean", args[0].type === "find" ? args[0].matched : `isnumber(${scalar(args[0]).source})`);
  if (name === "COUNTIF") {
    const value = scalar(args[0]);
    const criteria = scalar(args[1]).literalString;
    if (!value.reference) unsupported("COUNTIF currently requires a single mapped cell, not a range or expression.");
    if (criteria === undefined || !criteria || /^[<>=]/.test(criteria) || criteria.trim() === "" || /^(?:true|false)$/i.test(criteria.trim()) || Number.isFinite(Number(criteria)) || /[\d%$€£¥]/.test(criteria) || /^\*+$/.test(criteria)) {
      unsupported("COUNTIF supports only literal nonnumeric text criteria and text wildcards that do not match blanks; numeric, comparison and blank criteria are unsupported.");
    }
    return emitted("number", `if(textmatches(${value.source}, ${JSON.stringify(criteria)}, false), 1, 0)`);
  }
  if (name === "IF") {
    const condition = logical(args[0], name);
    let yes = scalar(args[1]);
    let no = scalar(args[2]);
    // A blank numeric result is missing, never zero. Keep ordinary text branches as text.
    if (noResultMarker(yes) && no.type !== "string") {
      if (yes.literalString) note(`"${yes.literalString}" shows as an empty cell: a number field cannot hold text.`);
      yes = emitted("null", "null");
    }
    if (noResultMarker(no) && yes.type !== "string") {
      if (no.literalString) note(`"${no.literalString}" shows as an empty cell: a number field cannot hold text.`);
      no = emitted("null", "null");
    }
    const concrete = [yes, no].filter((value) => !["null", "reference"].includes(value.type));
    if (concrete.length === 2 && concrete[0].type !== concrete[1].type) unsupported("IF branches must have the same type, apart from a blank result. Mixed text/number/boolean results are unsupported by typed-1.");
    const type = concrete[0]?.type ?? (yes.type === "null" ? no.type : yes.type);
    // A direct blank reference returns zero in Excel. Only the exact blank guard proves
    // that a raw reference branch will not be selected while the cell is empty.
    const guarded = (value: Scalar, other: Scalar) => value.reference && other.type === "null"
      && condition === isBlank(value) && value === no;
    const branch = (value: Scalar, other: Scalar) => value.reference && !value.blankText && !guarded(value, other)
      ? `coalesce(${value.source}, 0)` : value.source;
    const blankText = yes.type === "null" || no.type === "null" || yes.blankText || no.blankText;
    return { ...emitted(type, `if(${condition}, ${branch(yes, no)}, ${branch(no, yes)})`), ...(blankText ? { blankText: true } : {}) };
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
  if (name === "EXP") return emitted("number", `exp(${value.source})`);
  const digits = numeric(args[1], name);
  const places = digits.literalNumber;
  if (places === undefined || !Number.isInteger(places) || places < 0 || places > 6) {
    unsupported("ROUND supports a literal whole number of decimals from 0 to 6. Negative or computed precision cannot be faithfully translated.");
  }
  if (places > 0) {
    // Both engines round a binary double, so a value sitting exactly on a half
    // can differ from Excel in the last digit. Said plainly rather than
    // refused: refusing cost ordinary conversions such as ROUND(x, 1).
    note(`rounded to ${places} decimal${places === 1 ? "" : "s"}; a value exactly on a half may differ from Excel in the last digit.`);
  }
  // Supplying zero selects toFixed(0), which rounds half away from zero for both signs.
  // round(x) instead uses Math.round and incorrectly maps -1.5 to -1. Normalize negative zero.
  return emitted("number", `(round(${value.source}, ${places}) + 0)`);
}

/**
 * Translate only this bounded, scalar Excel subset to typed-1; never execute workbook code.
 *
 * The resolver supplies ids, NOT type/value metadata. References stay raw for blank/type/text
 * tests and IF branches; numeric contexts coalesce blank references to zero.
 * Callers MUST compile using the real slot declarations (do not relabel text/boolean slots
 * as numbers), compare workbook caches and retain their publish-review gate. `ok` means
 * translation, not workbook verification. Numeric-input UI strings follow typed-1's boundary
 * parser; this is NOT support for Excel cells containing numeric text. Those must stay text.
 *
 * All references (including unused IF branches) must map. Blank numeric cells become zero
 * in numeric contexts and are ignored as direct aggregate arguments. Literal text equality
 * is case-insensitive; blank tests recognize null and empty text. Blank IF branches may be
 * missing values, but other mixed-type IF results still require incompatible types and fail.
 * COUNTIF supports single-cell nonnumeric text criteria. FIND is only supported as the
 * direct argument of ISNUMBER, with nonempty literal search text and start omitted or 1.
 * Implicit text/boolean arithmetic, bare AND/OR references, nonzero ROUND precision and
 * every function outside FUNCTIONS remain deliberately unsupported.
 * Standard finite floating-point arithmetic is used, not Excel's display/precision settings.
 * Limits: 8192 input/output characters, 2048 input/output tokens, 32 input nesting levels,
 * 256 cells per rectangle, 512 reference visits; generated trees also obey engine limits.
 */
export function translateExcelFormula(
  formula: string,
  sheet: string,
  resolveReference: (sheet: string, address: string) => string | undefined,
  blankTextReferences: ReadonlySet<string> = new Set(),
): Translation {
  translationNotes = [];
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
        return { ...emitted("reference", raw), reference: raw, ...(blankTextReferences.has(raw.slice(1, -1)) ? { blankText: true } : {}) };
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
      return { type: "range", references, blankText: references.some((raw) => blankTextReferences.has(raw.slice(1, -1))) };
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
        left = { ...emitted("string", JSON.stringify(token.text)), literalString: token.text };
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
        if (!FUNCTIONS.has(name)) unsupported(`Unsupported Excel function ${name.slice(0, 80)}. Supported: SUM, AVERAGE, MIN, MAX, IF, AND, OR, NOT, ABS, ROUND(number, 0 to 6), EXP, TRUE, FALSE, ISNUMBER, single-cell text COUNTIF and ISNUMBER(FIND(literal, text)).`);
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
        if (["=", "<>"].includes(operator) && (a.literalString !== undefined || right.literalString !== undefined)) {
          const literal = a.literalString !== undefined ? a : right;
          const value = literal === a ? right : a;
          const matches = literal.literalString === "" ? isBlank(value)
            : `textmatches(${value.source}, ${JSON.stringify(escapedPattern(literal.literalString!))}, false)`;
          left = emitted("boolean", operator === "=" ? matches : `(!${matches})`);
        } else if (["=", "<>"].includes(operator) && a.type === "boolean" && right.type === "boolean") {
          if (a.blankText || right.blankText) unsupported("Boolean comparison uses a value that may return empty text; missing values cannot reproduce Excel text/boolean equality.");
          left = emitted("boolean", `(${a.source} ${operator === "=" ? "==" : "!="} ${right.source})`);
        } else {
          const x = numeric(a, "Arithmetic/comparison");
          const y = numeric(right, "Arithmetic/comparison");
          const target = operator === "=" ? "==" : operator === "<>" ? "!=" : operator;
          left = emitted(precedence === 1 ? "boolean" : "number", `(${x.source} ${target} ${y.source})`);
        }
      }
      return left;
    };
    const result = scalar(parse());
    const source = result.reference && !result.blankText ? `coalesce(${result.source}, 0)` : result.source;
    if (peek().kind !== "end") unsupported("Unexpected trailing Excel syntax. Unions, intersections, named references and whole-row/column ranges are unsupported.");
    const parsed = parseExpression(source);
    if (!parsed.ok) unsupported(`Translated formula exceeds the target parser's syntax or resource limits: ${parsed.issues[0].message}`);
    return {
      ok: true,
      source,
      ...(result.blankText ? { blankText: true } : {}),
      ...(translationNotes.length ? { notes: [...translationNotes] } : {}),
    };
  } catch (error) {
    if (error instanceof UnsupportedFormula) return { ok: false, message: error.message };
    throw error;
  }
}
