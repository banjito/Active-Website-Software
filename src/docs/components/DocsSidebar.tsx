/**
 * Left navigation rail.
 *
 * Sections collapse; the one containing the current page is always open. Uses
 * plain <div>/<ul> rather than <nav> on purpose: a browser extension some of
 * our users run hides <nav> and <header> elements outright.
 */

import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { docsSections, type DocsSection } from "../nav";
import { docsPages } from "../lib/content";

function currentSlug(pathname: string): string {
  return pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "");
}

function SectionBlock({
  section,
  activeSlug,
  onNavigate,
}: {
  section: DocsSection;
  activeSlug: string;
  onNavigate?: () => void;
}) {
  const isCurrent = activeSlug.split("/")[0] === section.slug;
  const [open, setOpen] = useState(isCurrent);
  const Icon = section.icon;

  // Following a search hit into another section should reveal it.
  useEffect(() => {
    if (isCurrent) setOpen(true);
  }, [isCurrent]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800/60"
        aria-expanded={open}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${isCurrent ? "text-brand" : "text-neutral-400"}`} />
        <span className="flex-1 truncate">{section.title}</span>
        <ChevronRight
          className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-3 pb-2 pl-4">
          {section.groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                {group.title}
              </p>
              <ul className="space-y-px border-l border-neutral-200 pl-3 dark:border-neutral-800">
                {group.items.map((item) => {
                  const badge = docsPages[item.slug]?.badge;
                  return (
                    <li key={item.slug}>
                      <Link
                        to={`/docs/${item.slug}`}
                        onClick={onNavigate}
                        data-active={activeSlug === item.slug}
                        className="docs-sidebar-link"
                      >
                        <span className="truncate">{item.title}</span>
                        {badge && (
                          <span className="flex-shrink-0 rounded-full border border-neutral-200 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const activeSlug = currentSlug(pathname);

  return (
    <div className="pb-16 pr-2">
      <Link
        to="/docs"
        onClick={onNavigate}
        data-active={activeSlug === ""}
        className="docs-sidebar-link mb-2 !font-medium"
      >
        Overview
      </Link>

      {docsSections.map((section) => (
        <SectionBlock
          key={section.slug}
          section={section}
          activeSlug={activeSlug}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
