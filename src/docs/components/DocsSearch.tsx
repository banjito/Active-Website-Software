/**
 * ⌘K search dialog for the docs.
 *
 * Keyboard-first: ⌘K / Ctrl+K or "/" opens it, arrows move, Enter navigates,
 * Escape closes.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, FileText, Hash, X } from "lucide-react";
import { prepareDocsSearch, searchDocs, type DocsSearchHit } from "../lib/search";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap query terms in <mark> so the eye lands on the match. */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .map(escapeRegExp);

  if (terms.length === 0) return <>{text}</>;

  // String.split with a capture group interleaves the delimiters, so every odd
  // index is a match. Testing with the /g/ regex here would be wrong, since .test()
  // advances lastIndex and would flip results on alternating calls.
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}

interface DocsSearchProps {
  open: boolean;
  onClose: () => void;
}

export function DocsSearch({ open, onClose }: DocsSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const hits = useMemo(() => searchDocs(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Build the index now so it is ready by the first keystroke.
      prepareDocsSearch();
      // Wait for the dialog to mount before stealing focus.
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const go = useCallback(
    (hit: DocsSearchHit) => {
      onClose();
      navigate(`/docs/${hit.slug}${hit.anchor ? `#${hit.anchor}` : ""}`);
    },
    [navigate, onClose],
  );

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (hits.length === 0 ? 0 : (index + 1) % hits.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (hits.length === 0 ? 0 : (index - 1 + hits.length) % hits.length));
      return;
    }
    if (event.key === "Enter" && hits[activeIndex]) {
      event.preventDefault();
      go(hits[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search documentation"
    >
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="docs-root relative w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 dark:border-neutral-800">
          <Search className="h-4 w-4 flex-shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the docs…"
            className="h-12 w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="docs-scroll max-h-[55vh] overflow-y-auto p-2">
          {query.trim().length < 2 && (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">
              Type to search every page of the ampOS documentation.
            </p>
          )}

          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">
              No results for &ldquo;{query}&rdquo;.
            </p>
          )}

          {hits.map((hit, index) => (
            <button
              key={hit.id}
              type="button"
              data-active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => go(hit)}
              className="docs-search-hit flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
            >
              {hit.anchor ? (
                <Hash className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" />
              ) : (
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" />
              )}

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    <Highlight text={hit.heading ?? hit.title} query={query} />
                  </span>
                  <span className="flex-shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">
                    {hit.sectionTitle}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {hit.heading ? `${hit.title} · ` : ""}
                  <Highlight text={hit.snippet || hit.description} query={query} />
                </span>
              </span>

              {index === activeIndex && (
                <CornerDownLeft className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-neutral-200 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">↑</kbd>
            <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">↵</kbd>
            to open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Lets any descendant of the docs shell open the one shared search dialog.
 * Without this, a page that called useDocsSearch() itself would register a
 * second ⌘K listener and open a second copy of the dialog.
 */
const DocsSearchContext = createContext<() => void>(() => {});

export const DocsSearchProvider = DocsSearchContext.Provider;

export function useOpenDocsSearch(): () => void {
  return useContext(DocsSearchContext);
}

/**
 * Registers the global ⌘K / Ctrl+K / "/" shortcut and owns the dialog's open
 * state. Called once, by DocsLayout.
 */
export function useDocsSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isShortcut) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
