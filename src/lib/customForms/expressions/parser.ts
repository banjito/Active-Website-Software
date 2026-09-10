import {
  EXPRESSION_LIMITS,
  ExpressionFailure,
  failureResult,
  type BinaryOperator,
  type ExpressionNode,
  type Result,
  type SourceSpan,
} from "@/lib/customForms/expressions/types";

type Token = SourceSpan & { kind: "number" | "string" | "reference" | "name" | "symbol" | "end"; text: string };

function tokenize(source: string): Token[] {
  if (source.length > EXPRESSION_LIMITS.sourceLength) {
    throw new ExpressionFailure("limit.source", "Formula is too long.", { start: 0, end: source.length });
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const start = i;
    const ch = source[i];
    let kind: Token["kind"] = "symbol";
    let text = ch;
    if (ch === '"') {
      i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i++] === '"') { closed = true; break; }
      }
      if (!closed) throw new ExpressionFailure("syntax.string", "Unclosed string literal.", { start, end: source.length });
      try { text = JSON.parse(source.slice(start, i)); }
      catch { throw new ExpressionFailure("syntax.string", "Use a valid double-quoted string.", { start, end: i }); }
      kind = "string";
    } else if (ch === "{") {
      const end = source.indexOf("}", i + 1);
      if (end < 0) throw new ExpressionFailure("syntax.reference", "Unclosed reference.", { start, end: source.length });
      text = source.slice(i + 1, end).trim();
      i = end + 1;
      if (!text || /[{}\s]/.test(text)) throw new ExpressionFailure("syntax.reference", "Reference ids must be nonempty and contain no whitespace or braces.", { start, end: i });
      kind = "reference";
    } else {
      const number = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const name = source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
      if (number) { text = number[0]; kind = "number"; }
      else if (name) { text = name[0]; kind = "name"; }
      else {
        const pair = source.slice(i, i + 2);
        if (["<=", ">=", "==", "!=", "&&", "||"].includes(pair)) text = pair;
        else if (!"+-*/()<>,![]".includes(ch)) {
          throw new ExpressionFailure("syntax.character", `Unexpected character "${ch}".`, { start, end: i + 1 });
        }
      }
      i += text.length;
    }
    tokens.push({ kind, text, start, end: i });
    if (tokens.length > EXPRESSION_LIMITS.tokens) throw new ExpressionFailure("limit.tokens", "Formula has too many tokens.", { start, end: i });
  }
  tokens.push({ kind: "end", text: "", start: i, end: i });
  return tokens;
}

const PRECEDENCE: Record<string, number> = { or: 1, and: 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
const operatorOf = (text: string) => text === "&&" ? "and" : text === "||" ? "or" : text.toLowerCase();

/** A bounded, recursive-descent parser. There is no JavaScript execution path. */
export function parseExpression(source: string): Result<ExpressionNode> {
  try {
    const tokens = tokenize(source);
    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    const expect = (text: string) => {
      if (peek().text !== text) throw new ExpressionFailure("syntax.expected", `Expected "${text}".`, peek());
      return take();
    };
    const parse = (minimum = 0, depth = 0): ExpressionNode => {
      if (depth > EXPRESSION_LIMITS.depth) throw new ExpressionFailure("limit.depth", "Formula is nested too deeply.", peek());
      const token = take();
      let left: ExpressionNode;
      if (token.kind === "number") {
        const value = Number(token.text);
        if (!Number.isFinite(value)) throw new ExpressionFailure("number.nonFinite", "Number must be finite.", token);
        left = { kind: "literal", value, start: token.start, end: token.end };
      } else if (token.kind === "string") {
        left = { kind: "literal", value: token.text, start: token.start, end: token.end };
      } else if (token.kind === "reference") {
        left = { kind: "reference", id: token.text, start: token.start, end: token.end };
      } else if (token.text === "+" || token.text === "-" || token.text === "!" || (token.kind === "name" && token.text.toLowerCase() === "not")) {
        const operand = parse(7, depth + 1);
        left = { kind: "unary", operator: token.text === "+" ? "+" : token.text === "-" ? "-" : "not", operand, start: token.start, end: operand.end };
      } else if (token.text === "(") {
        left = parse(0, depth + 1);
        expect(")");
      } else if (token.text === "[") {
        const items: ExpressionNode[] = [];
        if (peek().text !== "]") {
          items.push(parse(0, depth + 1));
          while (peek().text === ",") {
            take();
            items.push(parse(0, depth + 1));
          }
        }
        const end = expect("]").end;
        left = { kind: "list", items, start: token.start, end };
      } else if (token.kind === "name") {
        const name = token.text.toLowerCase();
        if (["true", "false", "null"].includes(name)) {
          left = { kind: "literal", value: name === "null" ? null : name === "true", start: token.start, end: token.end };
        } else {
          expect("(");
          const args: ExpressionNode[] = [];
          if (peek().text !== ")") {
            args.push(parse(0, depth + 1));
            while (peek().text === ",") {
              take();
              args.push(parse(0, depth + 1));
            }
          }
          left = { kind: "call", name, args, start: token.start, end: expect(")").end };
        }
      } else {
        throw new ExpressionFailure("syntax.expression", "Expected a value, reference or function call.", token);
      }
      while (peek().kind === "symbol" || peek().kind === "name") {
        const operator = operatorOf(peek().text);
        const precedence = Object.prototype.hasOwnProperty.call(PRECEDENCE, operator) ? PRECEDENCE[operator] : undefined;
        if (precedence === undefined || precedence < minimum) break;
        take();
        const right = parse(precedence + 1, depth + 1);
        left = { kind: "binary", operator: operator as BinaryOperator, left, right, start: left.start, end: right.end };
      }
      return left;
    };
    const ast = parse();
    if (peek().kind !== "end") throw new ExpressionFailure("syntax.trailing", "Unexpected text after the expression.", peek());
    // Left-associative chains can be deep without deeply nesting the parser.
    const pending = [{ node: ast, depth: 0 }];
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (depth > EXPRESSION_LIMITS.depth) throw new ExpressionFailure("limit.depth", "Formula tree is too deep.", node);
      pending.push(...childrenOf(node).map((child) => ({ node: child, depth: depth + 1 })));
    }
    return { ok: true, value: ast };
  } catch (error) { return failureResult(error); }
}

export function childrenOf(node: ExpressionNode): ExpressionNode[] {
  switch (node.kind) {
    case "unary": return [node.operand];
    case "binary": return [node.left, node.right];
    case "call": return node.args;
    case "list": return node.items;
    default: return [];
  }
}

export function expressionReferences(node: ExpressionNode): Array<Extract<ExpressionNode, { kind: "reference" }>> {
  if (node.kind === "reference") return [node];
  return childrenOf(node).flatMap(expressionReferences);
}
