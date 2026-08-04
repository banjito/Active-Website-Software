import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  /** What the user searches and reads first — an asset identifier, normally. */
  label: string;
  /** Secondary context shown after the label, also searchable. */
  hint?: string;
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** Shown when nothing is selected, and as the value of the clear entry. */
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A single-select that you type into.
 *
 * A native <select> is fine for ten options and useless for a thousand: picking the
 * parent of an asset on a real site means scrolling past every cable assembly at the
 * facility. Typing "MVG-C1" should put it at the top, which is what this does.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel = "— none —",
  placeholder = "Search…",
  disabled,
}: SearchableSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    const terms = term.split(/\s+/);
    return options
      .filter((o) => {
        const haystack = `${o.label} ${o.hint ?? ""}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .sort((a, b) => {
        // Anything starting with what was typed comes first — "MVG-C1" should land on
        // MVG-C1 itself, not on the cable assembly that merely mentions it.
        const aStarts = a.label.toLowerCase().startsWith(terms[0]) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(terms[0]) ? 0 : 1;
        return aStarts - bStarts;
      });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Focus after the panel paints, so typing goes straight into the filter.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Index 0 is the "none" entry; the options follow it.
      if (highlight === 0) commit("");
      else if (filtered[highlight - 1]) commit(filtered[highlight - 1].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const rowClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
      active
        ? "bg-brand/10 text-brand"
        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-dark-100"
    }`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={controlId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-none border border-neutral-300 bg-white px-3 text-left text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
      >
        <span className={selected ? "truncate" : "truncate text-neutral-500"}>
          {selected ? selected.label : emptyLabel}
          {selected?.hint && (
            <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
              {selected.hint}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-neutral-400 hover:text-brand"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-dark-150">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:text-white"
            />
          </div>

          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            <li
              data-index={0}
              role="option"
              aria-selected={!value}
              onMouseEnter={() => setHighlight(0)}
              onClick={() => commit("")}
              className={rowClass(highlight === 0)}
            >
              <span className="w-4 shrink-0">{!value && <Check className="h-4 w-4" />}</span>
              <span className="text-neutral-500 dark:text-neutral-400">{emptyLabel}</span>
            </li>

            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                Nothing matches “{query}”.
              </li>
            ) : (
              filtered.map((option, i) => (
                <li
                  key={option.value}
                  data-index={i + 1}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setHighlight(i + 1)}
                  onClick={() => commit(option.value)}
                  className={rowClass(highlight === i + 1)}
                >
                  <span className="w-4 shrink-0">
                    {option.value === value && <Check className="h-4 w-4" />}
                  </span>
                  <span className="truncate font-medium">{option.label}</span>
                  {option.hint && (
                    <span className="ml-auto truncate pl-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {option.hint}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
