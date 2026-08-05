/**
 * Docs shell: top bar, left nav rail, content column, right "on this page" rail.
 *
 * The docs deliberately do NOT use the app's <Layout>. They are a reading
 * surface, not a work surface: full width, their own chrome, and a single
 * "Back to ampOS" exit.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, Menu, Search, X } from "lucide-react";
import { companyConfig } from "@/lib/companyConfig";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { DocsSidebar } from "./DocsSidebar";
import { DocsSearch, DocsSearchProvider, useDocsSearch } from "./DocsSearch";
import "../docs.css";

/**
 * Mac users expect ⌘K; everyone else sees Ctrl K.
 *
 * navigator.platform is deprecated, so prefer userAgentData and keep the old
 * property only as a fallback for browsers that lack it.
 */
function useShortcutLabel(): string {
  const [label, setLabel] = useState("Ctrl K");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform =
      (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "";
    if (/mac|iphone|ipad/i.test(platform)) setLabel("⌘K");
  }, []);

  return label;
}

export function DocsLayout() {
  const { pathname, hash } = useLocation();
  const { open: searchOpen, setOpen: setSearchOpen } = useDocsSearch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shortcutLabel = useShortcutLabel();

  // New page: start at the top, unless the URL points at an anchor.
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        window.requestAnimationFrame(() =>
          target.scrollIntoView({ behavior: "auto", block: "start" }),
        );
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  useEffect(() => setMobileNavOpen(false), [pathname]);

  // Escape closes the mobile drawer. It is an overlay, so it should dismiss the
  // same way the search dialog does.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const openSearch = useCallback(() => setSearchOpen(true), [setSearchOpen]);

  return (
    <DocsSearchProvider value={openSearch}>
    <div className="docs-root min-h-screen">
      {/* Top bar. A <div>, not <header>: see DocsSidebar note. */}
      <div className="docs-no-print sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="mx-auto flex h-14 max-w-[100rem] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 lg:hidden dark:hover:bg-neutral-800"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* The wordmark already reads "<product> docs", so it stands alone
              rather than sitting next to a separate "Docs" label. */}
          <Link to="/docs" className="flex items-center">
            <img
              src={companyConfig.docsLogoPath}
              alt={`${companyConfig.name} documentation`}
              className="h-6 w-auto dark:invert sm:h-8 translate-y-1"
            />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-2.5 pr-2 text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 sm:w-56 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:text-neutral-300"
            >
              <Search className="h-4 w-4" />
              <span className="hidden flex-1 text-left sm:inline">Search docs…</span>
              <kbd className="ml-auto hidden rounded border border-neutral-300 px-1.5 py-px text-[10px] font-medium sm:inline dark:border-neutral-700">
                {shortcutLabel}
              </kbd>
            </button>

            <ThemeToggle />

            <Link
              to="/portal"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to {companyConfig.name}</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[100rem] gap-8 px-4 sm:px-6">
        {/* Desktop nav rail */}
        <div className="docs-no-print docs-scroll sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 flex-shrink-0 overflow-y-auto py-8 lg:block">
          <DocsSidebar />
        </div>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="docs-root docs-scroll absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Documentation</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DocsSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <DocsSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </DocsSearchProvider>
  );
}
