/** Version this contract before changing calculation semantics in published reports. */
export const EXPRESSION_ENGINE_VERSION = "typed-1" as const;

export type ScalarValue = number | string | boolean;
export type ExpressionValue = ScalarValue | null | readonly (ScalarValue | null)[];
/**
 * `result` is a rule outcome: one of the four permitted verdicts, kept
 * distinct from `string` so a typo cannot become a report status. Build one
 * with `verdict("PASS")`.
 */
export type ValueType = "number" | "string" | "boolean" | "result" | "number[]" | "string[]" | "boolean[]" | "result[]";

/** The only values a `result` may hold. */
export const RESULT_VALUES = ["PASS", "FAIL", "LIMITED SERVICE", "N/A"] as const;
export type ResultValue = (typeof RESULT_VALUES)[number];
export type InferredType = ValueType | "null" | "null[]";

export interface SourceSpan {
  /** Zero-based character offsets, end exclusive. */
  start: number;
  end: number;
}

export interface ExpressionIssue extends SourceSpan {
  code: string;
  message: string;
  /** Stable calculation id, never its display label or array position. */
  calculationId?: string;
  referenceId?: string;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ExpressionIssue[] };

export type UnaryOperator = "+" | "-" | "not";
export type BinaryOperator = "+" | "-" | "*" | "/" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "and" | "or";

export type ExpressionNode = SourceSpan & (
  | { kind: "literal"; value: ScalarValue | null }
  | { kind: "reference"; id: string }
  | { kind: "list"; items: ExpressionNode[] }
  | { kind: "unary"; operator: UnaryOperator; operand: ExpressionNode }
  | { kind: "binary"; operator: BinaryOperator; left: ExpressionNode; right: ExpressionNode }
  | { kind: "call"; name: string; args: ExpressionNode[] }
);

export const EXPRESSION_LIMITS = {
  sourceLength: 8192,
  tokens: 2048,
  depth: 64,
  programNodes: 2048,
  listLength: 1024,
} as const;

/** Internal control flow only. Public entry points return Result, never swallow errors. */
export class ExpressionFailure extends Error {
  readonly issue: ExpressionIssue;
  constructor(code: string, message: string, span: SourceSpan, referenceId?: string) {
    super(message);
    this.issue = { code, message, start: span.start, end: span.end, ...(referenceId ? { referenceId } : {}) };
  }
}

export function failureResult(error: unknown): Result<never> {
  if (error instanceof ExpressionFailure) return { ok: false, issues: [error.issue] };
  throw error;
}
