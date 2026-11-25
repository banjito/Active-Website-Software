import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Box,
  Camera,
  ClipboardCheck,
  DollarSign,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Menu,
  Send,
  ShieldCheck,
  StickyNote,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface JobSectionTab {
  key: string;
  label: string;
  disabled?: boolean;
  alert?: boolean;
  /** Opens another page instead of switching tabs */
  href?: string;
}

interface JobSection {
  id: string;
  label: string;
  count?: number;
  tabs: JobSectionTab[];
}

interface JobSectionTabsProps {
  sections: JobSection[];
  activeSection: JobSection;
  activeTab: string;
  onTabChange: (key: string) => void;
  /** Shown on sections and tabs that have an alert */
  flagBadge: React.ReactNode;
  jobNumber: string;
  title: string;
  status: string;
  onBack: () => void;
  /** The slim bar that replaces the top bar while scrolling (phone + iPad) */
  showSlimBar: boolean;
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  overview: LayoutDashboard,
  reports: ClipboardCheck,
  assets: Box,
  deliverables: Send,
  tracking: Activity,
  field: Camera,
  safety: ShieldCheck,
  financials: DollarSign,
  notes: StickyNote,
};

const hideScrollbar =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const appTopBarHeight = () =>
  document.querySelector("[data-app-header]")?.getBoundingClientRect()
    .height ?? 0;

/** Desktop wraps. Below lg it is one row to swipe, with an All sections button. */
const SectionRow = ({
  sections,
  activeId,
  flagBadge,
  allOpen,
  onPick,
  onOpenAll,
}: {
  sections: JobSection[];
  activeId: string;
  flagBadge: React.ReactNode;
  allOpen: boolean;
  onPick: (section: JobSection) => void;
  onOpenAll: () => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Bring the open section into view without moving the page itself.
  useEffect(() => {
    const row = scrollRef.current;
    const button = activeRef.current;
    if (!row || !button) return;
    row.scrollLeft =
      button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
  }, [activeId]);

  return (
    <div className="flex border-b border-neutral-200 dark:border-neutral-700">
      <div
        ref={scrollRef}
        className={cn(
          "relative flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden lg:flex-wrap lg:overflow-visible lg:px-2",
          hideScrollbar,
        )}
      >
        {sections.map((section) => {
          const on = section.id === activeId;
          return (
            <button
              key={section.id}
              ref={on ? activeRef : undefined}
              type="button"
              onClick={() => onPick(section)}
              className={cn(
                "-mb-px inline-flex h-12 items-center gap-2 border-b-[3px] px-4 text-[15px] max-lg:mb-0 max-lg:shrink-0 max-lg:whitespace-nowrap max-sm:px-3",
                on
                  ? "border-brand font-bold text-neutral-900 dark:text-white"
                  : "border-transparent font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white",
              )}
            >
              {section.label}
              {section.count != null && (
                <span className="rounded-none border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs font-bold text-neutral-700 dark:border-neutral-600 dark:bg-dark-200 dark:text-neutral-200">
                  {section.count}
                </span>
              )}
              {!on && section.tabs.some((tab) => tab.alert) && flagBadge}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="All sections"
        aria-haspopup="dialog"
        aria-expanded={allOpen}
        onClick={onOpenAll}
        className="flex h-12 w-[52px] shrink-0 items-center justify-center border-l border-neutral-200 text-neutral-700 hover:text-brand dark:border-neutral-700 dark:text-neutral-200 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
    </div>
  );
};

/**
 * Job page navigation: sections on the top row, the open section's tabs below.
 * Below lg (phone + iPad) both rows swipe sideways, All sections opens a bottom
 * panel of tiles, and a slim job bar stays on screen while scrolling.
 */
export default function JobSectionTabs({
  sections,
  activeSection,
  activeTab,
  onTabChange,
  flagBadge,
  jobNumber,
  title,
  status,
  onBack,
  showSlimBar,
}: JobSectionTabsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isAllOpen, setIsAllOpen] = useState(false);
  const [isScrolledPast, setIsScrolledPast] = useState(false);

  // The page itself scrolls, not <main>, so CSS sticky has nothing to stick to
  // in here. Watch the row instead and show a fixed copy once it is gone.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !showSlimBar) {
      setIsScrolledPast(false);
      return;
    }
    const top = Math.round(appTopBarHeight());
    const observer = new IntersectionObserver(
      ([entry]) =>
        setIsScrolledPast(
          !entry.isIntersecting && entry.boundingClientRect.top < top,
        ),
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [showSlimBar]);

  useEffect(() => {
    if (!isAllOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsAllOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAllOpen]);

  const pickSection = (section: JobSection) => {
    setIsAllOpen(false);
    onTabChange(
      (section.tabs.find((tab) => !tab.disabled) ?? section.tabs[0]).key,
    );
    // Picked from the slim bar: start the new section at its top.
    const row = rowRef.current;
    if (isScrolledPast && row) {
      window.scrollTo({
        top:
          window.scrollY + row.getBoundingClientRect().top - appTopBarHeight(),
      });
    }
  };

  const sectionRow = (
    <SectionRow
      sections={sections}
      activeId={activeSection.id}
      flagBadge={flagBadge}
      allOpen={isAllOpen}
      onPick={pickSection}
      onOpenAll={() => setIsAllOpen(true)}
    />
  );

  return (
    <>
      <div ref={rowRef}>{sectionRow}</div>

      {activeSection.tabs.length > 1 && (
        <div
          className={cn(
            "flex gap-1 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-5 py-1.5 max-sm:px-2 dark:border-neutral-700 dark:bg-dark-200 lg:flex-wrap lg:overflow-visible",
            hideScrollbar,
          )}
        >
          {activeSection.tabs.map((tab) => {
            const on = tab.key === activeTab;
            if (tab.href) {
              return (
                <Link
                  key={tab.key}
                  to={tab.href}
                  title="Opens this job in the PM Dashboard"
                  className="inline-flex h-11 items-center gap-2 rounded-none border border-transparent px-3.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 max-lg:shrink-0 max-lg:whitespace-nowrap dark:text-neutral-300 dark:hover:text-white"
                >
                  {tab.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              );
            }
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                disabled={tab.disabled}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-none border px-3.5 text-sm max-lg:shrink-0 max-lg:whitespace-nowrap",
                  on
                    ? "border-neutral-400 bg-white font-bold text-neutral-900 dark:border-neutral-500 dark:bg-dark-150 dark:text-white"
                    : "border-transparent font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white",
                  tab.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {tab.label}
                {tab.alert && flagBadge}
              </button>
            );
          })}
        </div>
      )}

      {/* Above the app top bar (z-30), below the sidebar drawer and popups. */}
      {showSlimBar &&
        isScrolledPast &&
        createPortal(
          <div className="fixed inset-x-0 top-0 z-[35] bg-white pt-[env(safe-area-inset-top)] shadow-md print:hidden dark:bg-neutral-900 lg:hidden">
            <div className="flex h-14 items-center gap-1 border-b border-neutral-200 pl-1 pr-4 dark:border-neutral-700">
              <button
                type="button"
                aria-label="Back to Jobs"
                onClick={onBack}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-neutral-600 hover:text-brand dark:text-neutral-300"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="Back to top"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="flex min-w-0 flex-1 flex-col text-left"
              >
                <span className="text-[13px] font-bold leading-tight text-brand">
                  {jobNumber}
                </span>
                <span className="w-full truncate text-[15px] font-semibold leading-tight text-neutral-900 dark:text-white">
                  {title}
                </span>
              </button>
              {status && (
                <span className="ml-2 shrink-0 text-[13px] font-semibold capitalize text-neutral-700 dark:text-neutral-200">
                  {status}
                </span>
              )}
            </div>
            {sectionRow}
          </div>,
          document.body,
        )}

      {isAllOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] print:hidden lg:hidden">
            <button
              type="button"
              aria-label="Close sections"
              onClick={() => setIsAllOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-black/40 animate-in fade-in duration-150"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Job sections"
              className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[0px] border-t border-neutral-200 bg-white px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom duration-200 dark:border-dark-200 dark:bg-dark-150"
            >
              <div
                className="mx-auto mb-1 h-1 w-10 rounded-none bg-neutral-300 dark:bg-neutral-600"
                aria-hidden="true"
              />
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Job sections
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setIsAllOpen(false)}
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-none text-neutral-600 hover:text-brand dark:text-neutral-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {sections.map((section) => {
                  const Icon = SECTION_ICONS[section.id] ?? FileText;
                  const on = section.id === activeSection.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => pickSection(section)}
                      className={cn(
                        "relative flex h-24 flex-col items-center justify-center gap-2 rounded-none border px-1 text-center text-[13px] font-medium leading-tight",
                        on
                          ? "border-brand bg-white text-brand dark:bg-dark-200"
                          : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-brand dark:border-neutral-700 dark:bg-dark-200 dark:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-6 w-6",
                          on
                            ? "text-brand"
                            : "text-neutral-600 dark:text-neutral-300",
                        )}
                      />
                      {section.label}
                      {section.count != null && (
                        <span className="absolute right-2 top-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                          {section.count}
                        </span>
                      )}
                      {section.tabs.some((tab) => tab.alert) && (
                        <span className="absolute left-2 top-2">
                          {flagBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
