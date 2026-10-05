import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/components/theme/theme-provider";
import logoUrl from "./assets/ampOSOFFLINE.svg";

/**
 * Shared chrome for the offline shell screens (saved reports, report picker). Plain <div>s throughout: a browser extension some techs run hides
 * <header>/<nav> elements.
 */

export const inputClass =
  "w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export const primaryButtonClass =
  "flex items-center gap-1.5 rounded-none bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";

export const secondaryButtonClass =
  "flex items-center gap-1.5 rounded-none border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200";

export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  back: "m15 6-6 6 6 6",
  chevron: "m9 6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-3-3",
  check: "m5 12 5 5L20 7",
  export: "M12 15V3m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-none border border-neutral-300 text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-300"
    >
      {isDark ? (
        <Icon
          className="h-5 w-5"
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
      ) : (
        <Icon className="h-5 w-5" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      )}
    </button>
  );
}

/** Sticky top bar: logo (or a back link), a subtitle line, and right-side actions. */
export function TopBar({
  back,
  subtitle,
  actions,
  children,
}: {
  back?: { label: string; to: string };
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/85 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/85">
      <div className="mx-auto max-w-6xl px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="sr-only">ampOS Offline</h1>
            {back ? (
              <button
                onClick={() => navigate(back.to)}
                className="-ml-2 flex items-center gap-1 rounded-none px-2 py-1 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <Icon d={ICONS.back} />
                {back.label}
              </button>
            ) : (
              <img src={logoUrl} alt="ampOS Offline" className="h-8 w-auto dark:invert" />
            )}
            {subtitle && (
              <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <ThemeToggle />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
        <Icon d={ICONS.search} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}

export function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-4 w-1 rounded-none bg-brand" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
        {title}
      </h2>
      {count !== undefined && (
        <span className="rounded-none bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {count}
        </span>
      )}
    </div>
  );
}

/** Report display name without its NETA section number ("7.1.2 ", "3-"). */
export function cleanReportName(name: string): string {
  return name.replace(/^[0-9.\-\s]+/, "").trim() || name;
}

/** A short initialism for a report, shown in its accent tile. */
export function initials(name: string): string {
  const words = cleanReportName(name).split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "R").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
