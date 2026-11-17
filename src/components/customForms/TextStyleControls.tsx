/**
 * Text size + alignment pickers, used for a table's headings, its cells, and
 * one column. Leaving either on "Auto" keeps the report's own look.
 */

import React from "react";
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus } from "lucide-react";
import type { TableTextStyle, TextAlign } from "@/lib/types/customForms";
import { FONT_SIZE_CHOICES } from "@/lib/customForms/textStyle";

const ALIGN_ICONS: { value: TextAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: "left", label: "Left", Icon: AlignLeft },
  { value: "center", label: "Center", Icon: AlignCenter },
  { value: "right", label: "Right", Icon: AlignRight },
];

const BOX = "border border-neutral-300 dark:border-neutral-600 rounded-none";
const STEP =
  "h-7 w-7 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-brand hover:bg-brand/5 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-600";

export const TextStyleControls: React.FC<{
  value: TableTextStyle | undefined;
  onChange: (next: TableTextStyle | undefined) => void;
  /** What "Auto" falls back to, shown in the tooltips, e.g. "the table's setting". */
  autoMeans?: string;
}> = ({ value, onChange, autoMeans = "the report's own look" }) => {
  const set = (patch: TableTextStyle) => {
    const next = { ...value, ...patch };
    if (!next.fontSize) delete next.fontSize;
    if (!next.align) delete next.align;
    onChange(next.fontSize || next.align ? next : undefined);
  };
  const size = value?.fontSize;
  const at = size ? FONT_SIZE_CHOICES.indexOf(size) : -1;
  // Steps start from 10 px, the report's own cell size.
  const step = (dir: 1 | -1) => {
    const from = at >= 0 ? at : FONT_SIZE_CHOICES.indexOf(10);
    const next = FONT_SIZE_CHOICES[Math.min(FONT_SIZE_CHOICES.length - 1, Math.max(0, from + dir))];
    set({ fontSize: next });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Size: − 10 px + ; the middle resets to Auto. */}
      <div className={`flex items-center ${BOX} bg-white dark:bg-dark-150`} title={`Text size. Auto = ${autoMeans}.`}>
        <button type="button" className={STEP} onClick={() => step(-1)} disabled={at === 0} aria-label="Smaller text">
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => set({ fontSize: undefined })}
          className={`h-7 min-w-[3.25rem] px-1 text-[11px] tabular-nums border-x border-neutral-300 dark:border-neutral-600 ${
            size ? "text-neutral-900 dark:text-white font-semibold" : "text-neutral-400"
          }`}
          title={size ? "Back to Auto" : `Auto = ${autoMeans}`}
        >
          {size ? `${size} px` : "Auto"}
        </button>
        <button
          type="button"
          className={STEP}
          onClick={() => step(1)}
          disabled={at === FONT_SIZE_CHOICES.length - 1}
          aria-label="Larger text"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Alignment: click the chosen one again to go back to Auto. */}
      <div className={`flex items-center ${BOX} bg-white dark:bg-dark-150`} role="group" aria-label="Text alignment">
        {ALIGN_ICONS.map(({ value: a, label, Icon }, i) => {
          const on = value?.align === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => set({ align: on ? undefined : a })}
              aria-pressed={on}
              title={on ? `${label} (click again for Auto = ${autoMeans})` : label}
              className={`h-7 w-7 flex items-center justify-center ${i > 0 ? "border-l border-neutral-300 dark:border-neutral-600" : ""} ${
                on ? "bg-brand text-white" : "text-neutral-600 dark:text-neutral-300 hover:text-brand hover:bg-brand/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
