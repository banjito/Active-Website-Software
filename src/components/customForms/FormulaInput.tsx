/**
 * Formula input with a reference picker.
 *
 * The builder used to be a bare text box: an author had to know that the
 * corrected column of the insulation table is `{IR.C3}`, and a typo produced a
 * blank cell rather than a complaint. This offers the references that actually
 * exist, inserts them at the cursor, and says what is wrong while you type.
 */

import React from "react";
import { Search, X, FunctionSquare } from "lucide-react";
import type { SectionConfig } from "@/lib/types/customForms";
import {
  checkFormula,
  filterReferences,
  groupReferences,
  listReferences,
} from "@/lib/customForms/referenceCatalog";

const FUNCTION_HELP: Array<{ name: string; hint: string }> = [
  { name: "if(test, then, else)", hint: "Choose between two values." },
  { name: "min(…)", hint: "Smallest of the values." },
  { name: "max(…)", hint: "Largest of the values." },
  { name: "avg(…)", hint: "Average of the values." },
  { name: "sum(…)", hint: "Total of the values." },
  { name: "abs(x)", hint: "Distance from zero." },
  { name: "round(x, places)", hint: "Round to a number of decimals." },
  { name: "sqrt(x)", hint: "Square root." },
];

export interface FormulaInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Every section in the template, so the picker knows what exists. */
  sections: readonly SectionConfig[];
  placeholder?: string;
  className?: string;
}

export const FormulaInput: React.FC<FormulaInputProps> = ({
  value,
  onChange,
  sections,
  placeholder = "e.g. {IR.C2} * {JD.tcf}",
  className = "",
}) => {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);

  const references = React.useMemo(() => listReferences(sections), [sections]);
  const problems = React.useMemo(
    () => checkFormula(value, references),
    [value, references],
  );
  const groups = React.useMemo(
    () => groupReferences(filterReferences(references, query)),
    [references, query],
  );

  /** Insert at the caret, or append when the box has not been focused. */
  const insert = (text: string) => {
    const caret = caretRef.current ?? value.length;
    const next = value.slice(0, caret) + text + value.slice(caret);
    onChange(next);
    caretRef.current = caret + text.length;
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caretRef.current!, caretRef.current!);
    });
  };

  const rememberCaret = () => {
    caretRef.current = inputRef.current?.selectionStart ?? null;
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            caretRef.current = e.target.selectionStart;
            onChange(e.target.value);
          }}
          onSelect={rememberCaret}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          placeholder={placeholder}
          spellCheck={false}
          className={`flex-1 px-2 py-1 text-xs font-mono border rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 ${
            problems.length
              ? "border-red-400 focus:ring-red-400"
              : "border-neutral-300 dark:border-neutral-600 focus:ring-brand"
          }`}
        />
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          title="Insert a reference"
          aria-label="Insert a reference"
          className={`shrink-0 px-2 py-1 text-xs rounded border ${
            pickerOpen
              ? "border-brand text-brand bg-orange-50 dark:bg-orange-900/20"
              : "border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-brand hover:text-brand"
          }`}
        >
          <FunctionSquare className="w-3.5 h-3.5" />
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="text-[11px] text-red-700 dark:text-red-300 space-y-0.5">
          {problems.slice(0, 3).map((problem, index) => (
            <li key={index}>{problem.message}</li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-dark-150">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-700">
            <Search className="w-3 h-3 text-neutral-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields and columns…"
              className="flex-1 text-xs bg-transparent text-neutral-900 dark:text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {groups.length === 0 && (
              <p className="px-2 py-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                Nothing matches "{query}".
              </p>
            )}
            {groups.map((group) => (
              <div key={group.sectionId}>
                <div className="sticky top-0 px-2 py-1 bg-neutral-50 dark:bg-dark-200 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {group.sectionTitle}
                </div>
                {group.entries.map((entry) => (
                  <button
                    key={entry.insert}
                    type="button"
                    onClick={() => insert(entry.insert)}
                    title={entry.description}
                    className="w-full text-left px-2 py-1 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-baseline gap-2"
                  >
                    <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                      {entry.insert}
                    </span>
                    <span className="text-[11px] text-neutral-700 dark:text-neutral-300 truncate">
                      {entry.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-700 px-2 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
              Functions
            </div>
            <div className="flex flex-wrap gap-1">
              {FUNCTION_HELP.map((fn) => (
                <button
                  key={fn.name}
                  type="button"
                  title={fn.hint}
                  onClick={() => insert(fn.name.split("(")[0] + "(")}
                  className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-brand hover:text-brand"
                >
                  {fn.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
