/**
 * Shared field kit for the estimate builder.
 *
 * Single source of truth for the estimate's field styling, first established by the
 * Travel Expenses section. Palette semantics:
 *   - white  (INPUT_CLS)  = user input
 *   - blue   (CALC_CLS)   = auto-calculated value   (blue-50/200/800, dark blue-950/900/200)
 *   - orange (TOTAL_CLS)  = section / grand total    (orange-50/300/800, dark orange-950/800/200)
 *
 * Inline-`styles` <table> sections (e.g. the financial summaries) mirror this palette via the
 * `--calc-*` / `--total-*` CSS variables set in EstimateSheet's updateThemeVariables(). Keep the
 * two in sync if the palette changes here.
 */
import type { ReactNode } from "react";

export const INPUT_CLS =
  "w-full text-sm rounded border px-2 py-1 bg-white dark:bg-dark-100 border-neutral-300 dark:border-dark-200 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#f26722]";
export const CALC_CLS =
  "text-sm rounded border px-2 py-1 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 font-medium";
export const TOTAL_CLS =
  "text-sm rounded border px-2 py-1 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-200 font-semibold";
export const FIELD_LABEL_CLS =
  "text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1";

export const fmtMoney = (n: number) =>
  "$" +
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const fmtMoney0 = (n: number) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
export const fmtNum = (n: number) =>
  Math.round(Number(n) || 0).toLocaleString("en-US");

/** White input field with an uppercase label. */
export const numField = (
  label: string,
  value: number,
  onChange: (v: string) => void,
  step?: number,
) => (
  <label className="flex flex-col min-w-0">
    <span className={FIELD_LABEL_CLS}>{label}</span>
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
    />
  </label>
);

/** Blue read-only "calculated" field. */
export const calcField = (label: string, text: string) => (
  <div className="flex flex-col min-w-0">
    <span className={FIELD_LABEL_CLS}>{label}</span>
    <span className={CALC_CLS}>{text}</span>
  </div>
);

/** Orange read-only "total" field. */
export const totalField = (label: string, text: string) => (
  <div className="flex flex-col min-w-0">
    <span className={FIELD_LABEL_CLS}>{label}</span>
    <span className={TOTAL_CLS}>{text}</span>
  </div>
);

/** Section heading with an optional subtitle. */
export const sectionTitle = (title: string, sub?: string) => (
  <div className="text-sm font-medium mb-3 pb-2 border-b border-neutral-200 dark:border-dark-200 text-neutral-800 dark:text-neutral-100">
    {title}
    {sub && (
      <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
        {sub}
      </span>
    )}
  </div>
);

/** Small uppercase divider label inside a section. */
export const subLabel = (text: string) => (
  <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mt-3 mb-1">
    {text}
  </div>
);

export type SectionNavItem<K extends string> = {
  key: K;
  label: string;
  badge?: string;
};

/**
 * Left-nav + single-panel shell, first built for Travel Expenses. The caller renders the active
 * panel as `children` (gated on `active`); this component owns the nav column, active styling
 * (brand `#f26722` accent + orange badge) and the panel column.
 */
export function SectionNav<K extends string>({
  items,
  active,
  onChange,
  children,
}: {
  items: SectionNavItem<K>[];
  active: K;
  onChange: (key: K) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex border border-neutral-200 dark:border-dark-200 rounded-none overflow-hidden">
      <div className="w-48 shrink-0 bg-neutral-50 dark:bg-dark-100 border-r border-neutral-200 dark:border-dark-200 py-2">
        {items.map((n) => {
          const isActive = active === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => onChange(n.key)}
              className={`w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5 ${
                isActive
                  ? "bg-white dark:bg-dark-200 text-neutral-900 dark:text-white font-medium border-r-2 border-[#f26722]"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-white/60 dark:hover:bg-dark-200/60"
              }`}
            >
              <span className="truncate">{n.label}</span>
              {n.badge != null && (
                <span
                  className={`text-[11px] truncate ${
                    isActive
                      ? "text-[#854F0B] dark:text-orange-300"
                      : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {n.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 p-4 min-w-0">{children}</div>
    </div>
  );
}
