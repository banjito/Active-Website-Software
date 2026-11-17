/**
 * Decimal places for a formula column (field.decimals / field.decimalMode).
 *
 * Applied to the result itself (getCellValue), so what is shown and printed
 * is also what pass/fail rules, charts, trends and, on new reports, other
 * formulas use: every number on the page can be worked out by hand from the
 * numbers beside it.
 */

export type DecimalMode = 'round' | 'cut';

export const DECIMAL_CHOICES = [0, 1, 2, 3, 4, 5, 6];

/** "12.3456" with 2 → "12.35" (round) or "12.34" (cut). Text that isn't a number is left alone. */
export function formatDecimals(value: unknown, decimals: number | undefined, mode: DecimalMode = 'round'): unknown {
  if (decimals == null || decimals < 0 || value == null || value === '') return value;
  // Formulas may carry a "<" / ">" from the reading they came from.
  const match = String(value).trim().match(/^([<>≤≥]?)\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)$/i);
  if (!match) return value;
  const n = Number(match[2]);
  if (!Number.isFinite(n)) return value;
  const factor = 10 ** decimals;
  // toPrecision clears float noise first (0.29 * 100 = 28.999999999999996).
  const scaled = Number((n * factor).toPrecision(15));
  const whole = mode === 'cut' ? Math.trunc(scaled) : Math.sign(scaled) * Math.round(Math.abs(scaled));
  const fixed = (whole / factor).toFixed(decimals);
  // No "-0.00".
  return match[1] + (Number(fixed) === 0 ? fixed.replace(/^-/, '') : fixed);
}
