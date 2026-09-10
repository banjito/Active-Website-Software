# Phase 3: typed expression core

**Status: core library implemented; not activated in report rendering or publication.**

This is the first Phase 3 slice. The existing V1 evaluator remains unchanged so
this work cannot silently change a historical report's calculations. Native V2
authoring, version-pinned activation, document-to-program compilation, error UI,
and server/PDF integration are still required. Do not mark Phase 3 complete.

## Files and entry points

- `src/lib/customForms/expressions/types.ts`: values, syntax tree, diagnostics,
  limits, and the `typed-1` engine identifier.
- `parser.ts`: `parseExpression(source)` returns a syntax tree or source errors.
- `semantics.ts`: type checking, input parsing, and evaluation of checked trees.
  These are engine internals; application callers should compile a program.
- `program.ts`: `compileExpressionProgram(definition)` checks references, cycles,
  functions, and types, then returns an immutable program with `evaluate(values)`.
- `v1-adapter.ts`: explicit positional-reference translation using supplied,
  persisted row IDs. It does not save or modify templates or instances.
- `expressions.regression.ts`: imported by the existing regression harness.

There are no new dependencies, database writes, network requests, or React
imports in the engine. The V1 translator reuses the existing section-code helper.

## Persisted contract

A program definition contains:

- `engineVersion: "typed-1"`;
- `inputs`: stable `id` and declared `type` for each supplied value;
- `calculations`: stable `id`, formula `source`, and optional expected output `type`.

A reference token addresses one input or calculation by its **exact, case-sensitive
ID**, not its title or position. Calculations may appear before their dependencies
in the definition. The compiler produces a deterministic dependency-first order.

`expressionReferenceId` encodes structured references as URI-escaped path segments:

```text
{field/sec-job/tcf}
{cell/sec-ir/reading-a/col-reading}
{binding/job.number}
```

Each cell reference identifies a table, a persisted row, and a column. There is
no positional variant in the stable-reference contract. Native document binding
must resolve row definitions/current-row contexts to identities before compiling
a runtime program; that integration is not implemented in this slice.

Compile a persisted definition again to execute it. Do not persist the compiled
closure. It privately owns parsed trees and copies input types, so subsequent
draft edits cannot mutate its behavior. Changing semantics requires a new engine
version and an explicit template upgrade; unknown engine versions are rejected.
The library does not yet add this engine identifier to the database version store.

## Grammar

From lowest to highest precedence:

```text
expression  = or
or          = and (("or" | "||") and)*
and         = equality (("and" | "&&") equality)*
equality    = comparison (("==" | "!=") comparison)*
comparison  = addition (("<" | "<=" | ">" | ">=") addition)*
addition    = product (("+" | "-") product)*
product     = unary (("*" | "/") unary)*
unary       = ("+" | "-" | "not" | "!") unary | primary
primary     = number | string | boolean | null | reference
            | "(" expression ")"
            | "[" (expression ("," expression)*)? "]"
            | function "(" (expression ("," expression)*)? ")"
```

Numbers are finite decimals, optionally with a decimal point or scientific
notation. Strings use JSON double-quote/escape syntax. Keywords and function
names are case-insensitive. Lists are homogeneous scalar lists, with optional
null elements; nested lists are rejected. Trailing commas are rejected.

No property access, assignment, JavaScript globals, custom callbacks, comments,
script statements, arbitrary function calls, `eval`, or `new Function` are allowed.
A reference-looking substring inside a string remains literal text.

## Types and functions

Inputs declare `number`, `string`, `boolean`, `number[]`, `string[]`, or `boolean[]`.
Every type can be missing (`null`). There is no implicit string concatenation or
truthiness conversion. Arithmetic and ordering comparisons require numbers.
Equality accepts matching scalar types. Mixed-type branches/lists are rejected.

| Function | Behavior |
|---|---|
| `if(condition, yes, no)` | Boolean condition; evaluates only the selected branch. Missing condition returns null. Branches must have compatible types. |
| `coalesce(a, b, ...)` | First non-null value; evaluates lazily. Does not catch errors. |
| `isNull(value)` | Explicit missing-value check. |
| `min`, `max`, `sum`, `avg` | One or more numeric arguments and/or numeric lists. Empty input data or any null element returns null. |
| `abs(value)`, `sqrt(value)` | Numeric result; negative square roots report an error. |
| `round(value, decimals?)` | No precision: `Math.round`. Explicit precision: `Number(value.toFixed(decimals))`, integer precision 0–12. |
| `concat(a, ...)` | String-only concatenation. Any missing argument returns null. |

Numbers use finite JavaScript floating-point arithmetic, not decimal arithmetic.
Formatting (such as always printing one decimal place) belongs to the renderer,
not the numeric result. These are generic mathematical functions, not certified
electrical rules.

## Missing values and errors

At the input boundary, undefined, null, and whitespace-only strings become null.
Declared numeric inputs accept complete decimal strings, including scientific
notation. They do **not** accept booleans, `1,000`, `10A`, `N/A`, or `<2200` as a
number. Such values must be explicitly modeled or normalized during an upgrade;
stripping their meaning automatically would be unsafe. Boolean inputs require
actual booleans. Numeric zero and boolean false are not missing.

Arithmetic and comparisons propagate null, including `null == null`. Use
`isNull` to test missing values. Boolean logic is three-valued:

- `false and null` is false; `true and null` is null;
- `true or null` is true; `false or null` is null.

Compilation errors include unknown references/functions, invalid types, cycles,
syntax errors, and unsupported versions. Evaluation errors include invalid
inputs, division by zero, invalid numeric domains/precision, and non-finite
results. Each error includes a code and character span; program errors also
identify the calculation or referenced input.

Evaluation returns a result map and an issue list. An error never becomes a blank
string, a default value, or a previously saved calculated value. A dependent
calculation reports its failed reference. Unrelated calculations still evaluate.
Every declared calculation runs in dependency order, even if another formula
uses it only in an unselected branch; lazy evaluation applies within a formula,
not to pruning whole calculation nodes from the program.

Applications must display these diagnostics and use the same compiler at
publication/review boundaries. **That UI and server wiring is still outstanding.**

## Resource limits

- 8,192 source characters and 2,048 tokens per formula;
- syntax-tree depth 64;
- 2,048 inputs plus calculations per program;
- 1,024 items per input list and per aggregate calculation;
- 8,192 characters per input or concatenated output string.

Dependency traversal is iterative, so long chains do not consume the JavaScript
call stack. Limits return diagnostics rather than falling back to another engine.

## V1 compatibility and acceptance coverage

`translateV1Expression` supports existing friendly codes, exact section IDs,
`C1.R2`, `C1` (same row), and `sameRow`/`row0`/`rowN` field references. It requires
the pinned section definitions and persisted row IDs in V1 data-slot order.
Ambiguous sections, missing columns/rows, and duplicate row IDs block translation.
Translation binds positions once; reordering a table cannot retarget the already
translated source. It never generates IDs and never rewrites values.

Passing translation does not imply an engineering-approved upgrade. For example,
V1 treated missing numeric data as zero and retained comparison-prefix strings;
`typed-1` deliberately does not. The legacy evaluator is still the application's
active path, including for existing published versions.

Regression coverage includes the existing insulation-resistance/TCF fixture and
an electronic-trip breaker calculation slice based on
`LowVoltageCircuitBreakerElectronicTripATSReport.tsx`:

- rated current × percentage multiplier;
- test current × (1 + percentage tolerance);
- calculated-to-calculated bounds;
- synthetic inclusive-window PASS/FAIL checks at and around both bounds;
- missing measured current remains null, not FAIL or PASS.

This is **not** full breaker certification. No live `3-LowVoltageCableATS` payload,
VLF interpolation, domain rule pack, rendered DOM, approval artifact, or production
PDF was exercised by these engine tests.

## Validation

Run the existing combined harness (the expression checks run before V1/V2 checks):

```sh
node --import ./scripts/ts-alias-loader.mjs scripts/custom-forms-regression.ts
```

The next Phase 3 slice is version-pinned, explicit engine selection and a shared
document-to-program adapter, followed by runtime/compiler/UI integration. Keep
V1 behavior separate until a template is intentionally upgraded. Lookups,
interpolation, units, structured rule results, rule packs, and the expression
editor remain open work.
