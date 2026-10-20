import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  Cpu,
  FileText,
  Loader2,
  MapPin,
  Receipt,
  Search,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  searchEverything,
  type GlobalSearchResult,
  type SearchResultType,
} from "@/lib/globalSearch";

const GROUPS: { type: SearchResultType; label: string; icon: LucideIcon }[] = [
  { type: "job", label: "Jobs", icon: Briefcase },
  { type: "report", label: "Reports", icon: FileText },
  { type: "equipment", label: "Equipment", icon: Cpu },
  { type: "site", label: "Sites", icon: MapPin },
  { type: "customer", label: "Customers", icon: Building2 },
  { type: "contact", label: "Contacts", icon: User },
  { type: "quote", label: "Quotes", icon: Receipt },
];

const DEBOUNCE_MS = 250;

/** Words the placeholder cycles through: "Search jobs...", "Search reports...", ... */
const WORDS = ["jobs", "reports", "everything", "equipment", "sites"];
const SALES_WORDS = [...WORDS, "customers", "quotes"];
const WORD_MS = 2200;

/**
 * Home page search across jobs, reports, equipment and sites, plus customers, contacts and
 * quotes for roles with the Sales portal. Pressing "/" jumps to it.
 */
export default function HomeSearch() {
  const navigate = useNavigate();
  const { checkPortalAccess } = usePermissions();
  const includeSales = checkPortalAccess("sales");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Typing fires overlapping searches; only the newest one may update the list.
  const latest = useRef(0);

  const term = query.trim();

  useEffect(() => {
    const id = ++latest.current;
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchEverything(term, { includeSales });
        if (id !== latest.current) return;
        setResults(found);
        setFailed(false);
        setActive(0);
      } catch (err) {
        if (id !== latest.current) return;
        console.error("Home search failed:", err);
        setResults([]);
        setFailed(true);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, includeSales]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      // "/" is a normal character while typing anywhere else, so leave it alone there.
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (!typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The placeholder only cycles while it's showing.
  useEffect(() => {
    if (query) return;
    const timer = window.setInterval(() => setWordIndex((i) => i + 1), WORD_MS);
    return () => window.clearInterval(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Results arrive unordered by type; the list and arrow keys follow GROUPS order.
  const ordered = useMemo(
    () => GROUPS.flatMap((g) => results.filter((r) => r.type === g.type)),
    [results],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && ordered[active]) {
      e.preventDefault();
      setOpen(false);
      navigate(ordered[active].href);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && term.length >= 2;
  const words = includeSales ? SALES_WORDS : WORDS;
  const word = words[wordIndex % words.length];
  const prevWord = words[(wordIndex - 1 + words.length) % words.length];

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-none border border-neutral-300 bg-white px-3 focus-within:border-brand dark:border-neutral-700 dark:bg-dark-150">
        <Search className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
        <div className="relative h-12 min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            aria-label="Search ampOS"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="home-search-results"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className="h-full w-full border-0 bg-transparent p-0 shadow-none focus:ring-0 text-base text-neutral-900 focus:outline-none dark:text-white"
          />
          {/* Stand-in placeholder: a native one can't animate. The old word drops out the
              bottom while the next drops in from the top. */}
          {!query && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center whitespace-nowrap text-base text-neutral-400"
            >
              <span>Search&nbsp;</span>
              <span className="relative inline-block h-6" style={{ overflowY: "clip" }}>
                {wordIndex > 0 && (
                  <span
                    key={`out-${wordIndex}`}
                    className="absolute left-0 top-0 animate-out fade-out slide-out-to-bottom-full fill-mode-forwards duration-500 motion-reduce:hidden"
                  >
                    {prevWord}...
                  </span>
                )}
                <span
                  key={`in-${wordIndex}`}
                  className="block animate-in fade-in slide-in-from-top-full duration-500 motion-reduce:animate-none"
                >
                  {word}...
                </span>
              </span>
            </div>
          )}
        </div>
        {loading && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" aria-hidden />
        )}
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="shrink-0 rounded-none p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-none border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-500 sm:inline-block dark:border-neutral-600 dark:text-neutral-400">
            /
          </kbd>
        )}
      </div>

      {showPanel && (
        <div
          id="home-search-results"
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-none border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-dark-150"
        >
          {failed ? (
            <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">
              Search failed. Try again.
            </p>
          ) : ordered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              {loading ? "Searching..." : "No matches."}
            </p>
          ) : (
            GROUPS.map(({ type, label, icon: Icon }) => {
              const items = ordered.filter((r) => r.type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="py-1">
                  <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {label}
                  </div>
                  {items.map((r) => {
                    const index = ordered.indexOf(r);
                    const isActive = index === active;
                    return (
                      <Link
                        key={`${r.type}-${r.id}`}
                        to={r.href}
                        data-index={index}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => setOpen(false)}
                        className={`flex items-start gap-3 rounded-none px-4 py-2 ${
                          isActive ? "bg-neutral-100 dark:bg-neutral-800" : ""
                        }`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">
                            {r.title}
                          </span>
                          {r.subtitle && (
                            <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
