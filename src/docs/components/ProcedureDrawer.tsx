/**
 * The MOP library as a side panel.
 *
 * A tech opening a procedure is mid-task on a job: they have filters set, a
 * report half-filled, and a piece of gear in front of them. Navigating to
 * /docs and back loses all of that, so the procedures slide over the page
 * instead. The prose is rendered by the same Markdown renderer and the same
 * stylesheet as the docs site, so a MOP reads identically in both places.
 *
 * Keep this component behind a lazy import. It pulls in the MOP Markdown and
 * the docs stylesheet, neither of which belongs in the main bundle.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, LifeBuoy, Search, X } from "lucide-react";
import { Markdown } from "../lib/markdown";
import { procedureGroups, procedures, type Procedure } from "../procedures";
import "../docs.css";

interface ProcedureDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Procedure id to open directly, e.g. "transformer". Defaults to the list. */
  initialProcedureId?: string;
}

export function ProcedureDrawer({ open, onClose, initialProcedureId }: ProcedureDrawerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Procedure | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset to the requested entry point each time the panel is opened, so it
  // never reopens onto whatever was read last week.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(
      initialProcedureId
        ? (procedures.find((procedure) => procedure.id === initialProcedureId) ?? null)
        : null,
    );
  }, [open, initialProcedureId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Opening a procedure from halfway down the list should start at the top of
  // the procedure, not at the scroll offset the list happened to be at.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (!selected) searchRef.current?.focus();
  }, [selected]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const terms = needle.split(/\s+/);
    return procedures.filter((procedure) =>
      terms.every((term) => procedure.searchText.includes(term)),
    );
  }, [query]);

  if (!open) return null;

  return (
    <>
      {/* Above the app chrome: Layout's sidebar and header both sit at z-50, so
          a lower overlay dims the page but leaves the navigation bright. */}
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="docs-root fixed inset-y-0 right-0 z-[80] flex w-full max-w-2xl flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
        role="dialog"
        aria-modal="true"
        aria-label="Method of Procedure library"
      >
        {/* Title bar */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex min-w-0 items-start gap-3">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
                aria-label="Back to all procedures"
                title="All procedures"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {selected ? selected.title : "Methods of Procedure"}
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                {selected ? selected.group : "NETA ATS testing procedures for the field"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to={selected ? `/docs/${selected.slug}` : "/docs/procedures/overview"}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              title="Open in the documentation site"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open in docs</span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="docs-scroll min-h-0 flex-1 overflow-y-auto">
          {selected ? (
            <article className="px-5 py-6">
              {selected.description && (
                <p className="text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {selected.description}
                </p>
              )}
              <div className="docs-prose mt-6 max-w-none">
                <Markdown content={selected.body} />
              </div>
            </article>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search procedures, equipment, or NETA section..."
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="px-5 py-4">
                {matches ? (
                  matches.length > 0 ? (
                    <ProcedureList items={matches} onSelect={setSelected} />
                  ) : (
                    <p className="py-10 text-center text-sm text-neutral-500">
                      No procedure matches “{query}”.
                    </p>
                  )
                ) : (
                  procedureGroups.map((group) => (
                    <section key={group.title} className="mb-6 last:mb-0">
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        {group.title}
                      </h3>
                      <ProcedureList items={group.items} onSelect={setSelected} />
                    </section>
                  ))
                )}

                <p className="mt-6 border-t border-neutral-200 pt-4 text-[13px] leading-relaxed text-neutral-500 dark:border-neutral-800">
                  Every procedure assumes the equipment is de-energized, isolated, verified
                  dead, and locked out before anyone touches it.{" "}
                  <Link
                    to="/docs/procedures/overview"
                    onClick={onClose}
                    className="docs-link"
                  >
                    Read the rules that apply to all MOPs
                  </Link>
                  .
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function ProcedureList({
  items,
  onSelect,
}: {
  items: Procedure[];
  onSelect: (procedure: Procedure) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((procedure) => (
        <li key={procedure.id}>
          <button
            type="button"
            onClick={() => onSelect(procedure)}
            className="group w-full rounded-lg border border-neutral-200 px-4 py-3 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                {procedure.title}
              </span>
              {procedure.badge && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
                  {procedure.badge}
                </span>
              )}
            </span>
            {procedure.description && (
              <span className="mt-1 block text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                {procedure.description}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default ProcedureDrawer;
