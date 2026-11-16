/**
 * The report's overall result choices (the coloured box at the top).
 *
 * PASS / FAIL / LIMITED SERVICE are always there, in the same colours as the
 * hard-coded reports. A template may add its own choices, each with a colour,
 * stored in settings.customResultOptions.
 */

export interface ResultOption {
  label: string;
  /** Background colour, "#rrggbb". */
  color: string;
}

export const DEFAULT_RESULT_OPTIONS: readonly ResultOption[] = [
  { label: "PASS", color: "#22c55e" },
  { label: "FAIL", color: "#ef4444" },
  { label: "LIMITED SERVICE", color: "#eab308" },
];

/** Grey for a saved result whose option was later removed from the template. */
const UNKNOWN_COLOR = "#6b7280";

const HEX = /^#[0-9a-f]{6}$/i;

/** Tidy a label the way it will be stored and printed. */
export function cleanResultLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 40);
}

/** Added choices, cleaned: no blanks, no repeats of the defaults or each other. */
export function cleanCustomResultOptions(options: unknown): ResultOption[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set(DEFAULT_RESULT_OPTIONS.map((o) => o.label));
  const out: ResultOption[] = [];
  for (const raw of options) {
    const label = cleanResultLabel(String((raw as any)?.label ?? ""));
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const color = String((raw as any)?.color ?? "");
    out.push({ label, color: HEX.test(color) ? color.toLowerCase() : UNKNOWN_COLOR });
  }
  return out;
}

/** Every choice for a template: the three defaults, then its own. */
export function resolveResultOptions(
  settings: { customResultOptions?: unknown } | undefined | null,
): ResultOption[] {
  return [...DEFAULT_RESULT_OPTIONS, ...cleanCustomResultOptions(settings?.customResultOptions)];
}

/** The colour for a result; grey when the template no longer offers it. */
export function resultColor(status: string, options: readonly ResultOption[]): string {
  return options.find((o) => o.label === status)?.color ?? UNKNOWN_COLOR;
}

/** Black or white text, whichever reads better on `hex`. */
export function resultTextColor(hex: string): string {
  if (!HEX.test(hex)) return "white";
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived brightness (ITU-R BT.601).
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#111827" : "white";
}

/** The next choice when the toggle is clicked; wraps to the first. */
export function nextResult(status: string, options: readonly ResultOption[]): string {
  const i = options.findIndex((o) => o.label === status);
  return options[(i + 1) % options.length]?.label ?? "PASS";
}
