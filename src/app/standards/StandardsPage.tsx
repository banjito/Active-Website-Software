/**
 * Standards reader (/standards). Docs-style pages for the company's licensed
 * NETA ATS / MTS text. Linked from the portal, and from "Table 100.x" /
 * "Section N" references in reports (src/components/standards/StandardRefText).
 *
 * The text comes from common.standard_sections (employees only, behind
 * login). Never move it into src/: app bundles download without login and
 * ship to every ampOS buyer.
 *
 * "Table 100.x" and "Section N" mentions inside a page become links when that
 * table or section is loaded, which is the report hotlink idea in miniature.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Menu, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { companyConfig } from "@/lib/companyConfig";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Markdown, extractHeadings } from "@/docs/lib/markdown";
import { DocsToc } from "@/docs/components/DocsToc";
import "@/docs/docs.css";
import "./standards.css";

interface SectionRow {
  standard: string;
  section_number: string;
  kind: "section" | "table";
  title: string;
  group_title: string | null;
  sort_order: number;
  book_page: number | null;
  pdf_page: number | null;
}

interface SearchHit {
  standard: string;
  section_number: string;
  kind: "section" | "table";
  title: string;
  snippet: string;
}

interface StandardMeta {
  label: string; // "ANSI/NETA ATS-2025"
  short: string; // "ATS-2025"
  fullTitle: string;
  cover?: string; // public/img artwork
  // Same artwork clipped just below the bar's top edge (letters only), for the
  // home hero, where CSS draws the bar itself so its bottom edge is one line.
  heroArt?: string;
  logo?: string;
  // Pages pinned on the home page. Numbers only; titles come from the data.
  quick: string[];
  // Listed (library, sidebar, home page) before its text is loaded.
  comingSoon?: boolean;
  // Extra classes for the cover and logo <img>s, e.g. lifting navy art in
  // dark mode.
  coverClass?: string;
  logoClass?: string;
  // Hero artwork geometry and colour, measured from the SVG's viewBox:
  // lettersFrac = right edge of the last letter / width,
  // barFrac = bar height / height.
  art?: { lettersFrac: number; barFrac: number; bg: string; bgDark?: string };
}

// Labels and artwork only. The standards' text never lives in code.
const STANDARDS: Record<string, StandardMeta> = {
  "ats-2025": {
    label: "ANSI/NETA ATS-2025",
    short: "ATS-2025",
    fullTitle: "Standard for Acceptance Testing Specifications for Electrical Power Equipment & Systems",
    cover: "/img/2025-ats.svg",
    heroArt: "/img/2025-ats-letters.svg",
    logo: "/img/ansi-neta.svg",
    art: {
      lettersFrac: 0.6043,
      barFrac: 0.2785,
      bg: "linear-gradient(to top right, rgb(0 52 104) 0%, rgb(102 173 68) 56%, rgb(108 179 63) 100%)",
    },
    quick: [
      "7.6.1.1.1",
      "7.6.1.1.2",
      "7.6.1.2",
      "7.1.1",
      "7.2.1.1",
      "7.3.3",
      "7.22.3",
      "100.1",
      "100.5",
      "100.12.1",
      "100.14.1",
      "100.18",
    ],
  },
  "mts-2023": {
    label: "ANSI/NETA MTS-2023",
    short: "MTS-2023",
    fullTitle: "Standard for Maintenance Testing Specifications for Electrical Power Equipment & Systems",
    cover: "/img/2023-mts.svg",
    heroArt: "/img/2023-mts-letters.svg",
    // The ANSI/NETA logo recoloured to the MTS navy.
    logo: "/img/ansi-neta-blue.svg",
    quick: [],
    comingSoon: true,
    // Solid navy art; lifted to a lighter blue on dark backgrounds. The bar's
    // dark colour is the same lift (navy x 2.2), so all three match.
    coverClass: "dark:brightness-[2.2]",
    logoClass: "dark:brightness-[2.2]",
    art: { lettersFrac: 0.6657, barFrac: 0.278, bg: "rgb(0 52 104)", bgDark: "rgb(0 114 229)" },
  },
};

/**
 * Standards to list: those with loaded pages, plus "coming soon" ones, in
 * STANDARDS order; any loaded standard without settings goes last.
 */
function listedStandards(rows: SectionRow[]): string[] {
  const loaded = new Set(rows.map((row) => row.standard));
  const known = Object.keys(STANDARDS).filter((slug) => loaded.has(slug) || STANDARDS[slug].comingSoon);
  return [...known, ...Array.from(loaded).filter((slug) => !STANDARDS[slug])];
}

function ComingSoonBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-none border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300 ${className}`}
    >
      Coming soon
    </span>
  );
}

function standardLabel(slug: string): string {
  return STANDARDS[slug]?.label ?? slug.toUpperCase();
}

function displayNumber(row: { kind: string; section_number: string }): string {
  return row.kind === "table" ? `Table ${row.section_number}` : row.section_number;
}

function sectionPath(standard: string, sectionNumber: string): string {
  return `/standards/${standard}/${sectionNumber}`;
}

function groupRows(rows: SectionRow[]): { title: string; rows: SectionRow[] }[] {
  const groups: { title: string; rows: SectionRow[] }[] = [];
  for (const row of rows) {
    const title = row.group_title ?? "Other";
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.rows.push(row);
    else groups.push({ title, rows: [row] });
  }
  return groups;
}

/**
 * Turns "Table 100.12" / "Section 9" into links when that page is loaded.
 * "Table 100.12" has no page of its own, so it falls through to its first
 * part (100.12.1). Unloaded references stay plain text.
 */
function linkReferences(body: string, standard: string, numbers: string[], current: string): string {
  const resolve = (num: string) =>
    numbers.includes(num) ? num : numbers.find((n) => n.startsWith(`${num}.`)) ?? null;
  const link = (label: string, num: string) => {
    const target = resolve(num);
    if (!target || target === current) return label;
    return `[${label}](${sectionPath(standard, target)})`;
  };
  return body
    .replace(/\bTable (100(?:\.\d+)+)/g, (match, num) => link(match, num))
    .replace(/\bSection (\d+(?:\.\d+)*)/g, (match, num) => link(match, num));
}

/** Search snippet: strip markdown noise, highlight <mark> spans without injecting HTML. */
function Snippet({ text }: { text: string }) {
  const clean = text
    .replace(/:::\s*\w*/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/[|#*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = clean.split(/(<mark>.*?<\/mark>)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("<mark>") ? (
          <mark key={index} className="std-mark">
            {part.slice(6, -7)}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function StandardsSearch({ inputRef }: { inputRef: React.RefObject<HTMLInputElement> }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase
          .schema("common")
          .rpc("search_standard_sections", { p_query: q, p_standard: null, p_limit: 20 });
        if (rpcError) throw rpcError;
        if (!cancelled) {
          setHits((data ?? []) as SearchHit[]);
          setActive(0);
          setError(null);
        }
      } catch (err) {
        console.error("Standards search failed", err);
        if (!cancelled) setError("Search failed. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // Click outside closes the results.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Cmd/Ctrl+K focuses search, like the docs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: SearchHit) => {
    navigate(sectionPath(hit.standard, hit.section_number));
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      go(hits[active]);
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder='Search, e.g. "insulation resistance" or "100.1"'
        className="w-full rounded-none border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        aria-label="Search standards"
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-none border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
          {loading && hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-neutral-500">Searching…</p>
          )}
          {error && <p className="px-3 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-neutral-500">No matches.</p>
          )}
          {hits.map((hit, index) => (
            <button
              key={`${hit.standard}/${hit.section_number}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(hit)}
              className={`block w-full rounded-none border-b border-neutral-100 px-3 py-2.5 text-left last:border-b-0 dark:border-neutral-900 ${
                index === active ? "bg-neutral-100 dark:bg-neutral-900" : ""
              }`}
            >
              <span className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-brand">{displayNumber(hit)}</span>
                <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{hit.title}</span>
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-neutral-400">
                {standardLabel(hit.standard)}
              </span>
              {hit.snippet && (
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  <Snippet text={hit.snippet} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar label: drop the family name the group already shows, so
 * "Circuit Breakers, Low-Voltage, Molded-Case" under "7.6 Circuit Breakers"
 * reads "Low-Voltage, Molded-Case".
 */
function shortTitle(row: SectionRow): string {
  const family = (row.group_title ?? "").replace(/^[\d.]+\s+/, "");
  if (family && row.title.startsWith(`${family}, `)) return row.title.slice(family.length + 2);
  return row.title;
}

function SidebarRow({
  row,
  activeKey,
  onNavigate,
  label,
}: {
  row: SectionRow;
  activeKey: string | null;
  onNavigate?: () => void;
  label: string;
}) {
  return (
    <Link
      to={sectionPath(row.standard, row.section_number)}
      onClick={onNavigate}
      data-active={activeKey === `${row.standard}/${row.section_number}`}
      className="docs-sidebar-link std-sidebar-link"
    >
      <span>
        <span className="std-num">{displayNumber(row)}</span> {label}
      </span>
    </Link>
  );
}

function SidebarGroup({
  title,
  rows,
  activeKey,
  onNavigate,
}: {
  title: string;
  rows: SectionRow[];
  activeKey: string | null;
  onNavigate?: () => void;
}) {
  const isCurrent = rows.some((row) => activeKey === `${row.standard}/${row.section_number}`);
  const [open, setOpen] = useState(isCurrent);

  // Following a search hit or a table link into this group should reveal it.
  useEffect(() => {
    if (isCurrent) setOpen(true);
  }, [isCurrent]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/60"
        aria-expanded={open}
      >
        <span className={`flex-1 ${isCurrent ? "text-brand" : ""}`}>{title}</span>
        <ChevronRight
          className={`h-3.5 w-3.5 flex-shrink-0 text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <ul className="mb-2 ml-2 mt-1 space-y-px border-l border-neutral-200 pl-3 dark:border-neutral-800">
          {rows.map((row) => (
            <li key={row.section_number}>
              <SidebarRow row={row} activeKey={activeKey} onNavigate={onNavigate} label={shortTitle(row)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StandardsSidebar({
  rows,
  activeKey,
  activeHome,
  onNavigate,
}: {
  rows: SectionRow[];
  activeKey: string | null;
  activeHome: string | null;
  onNavigate?: () => void;
}) {
  const standards = listedStandards(rows);
  return (
    <div className="pb-16 pr-2">
      <Link
        to="/standards"
        onClick={onNavigate}
        data-active={activeKey === null && activeHome === null}
        className="docs-sidebar-link mb-3 !font-medium"
      >
        All standards
      </Link>
      {standards.map((slug) => (
        <SidebarStandard
          key={slug}
          slug={slug}
          rows={rows.filter((row) => row.standard === slug)}
          activeKey={activeKey}
          activeHome={activeHome}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

/**
 * One book in the sidebar. The title opens its home page; the chevron folds
 * its contents. Starts open when you're inside that book, folded otherwise.
 */
function SidebarStandard({
  slug,
  rows,
  activeKey,
  activeHome,
  onNavigate,
}: {
  slug: string;
  rows: SectionRow[];
  activeKey: string | null;
  activeHome: string | null;
  onNavigate?: () => void;
}) {
  const isCurrent = activeHome === slug || Boolean(activeKey?.startsWith(`${slug}/`));
  const [open, setOpen] = useState(isCurrent);
  const hasPages = rows.length > 0;

  // Following a link or search hit into this book should unfold it.
  useEffect(() => {
    if (isCurrent) setOpen(true);
  }, [isCurrent]);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1">
        <Link
          to={`/standards/${slug}`}
          onClick={onNavigate}
          data-active={activeHome === slug}
          className="docs-sidebar-link min-w-0 flex-1 !justify-start gap-2 !font-semibold !text-neutral-900 dark:!text-neutral-100"
        >
          <BookOpen className="h-4 w-4 flex-shrink-0 text-brand" />
          <span className="flex-1">{standardLabel(slug)}</span>
          {!hasPages && <ComingSoonBadge className="!px-1.5 !text-[9px]" />}
        </Link>
        {hasPages && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex-shrink-0 rounded-none p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${standardLabel(slug)}`}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>

      {hasPages && open && (
        <div className="mt-1 space-y-px">
          {groupRows(rows).map((group) =>
            // A one-page group (e.g. "7.4 Metal-Enclosed Busways") is just a link.
            group.rows.length === 1 ? (
              <div key={group.title} className="px-2">
                <SidebarRow
                  row={group.rows[0]}
                  activeKey={activeKey}
                  onNavigate={onNavigate}
                  label={group.rows[0].title}
                />
              </div>
            ) : (
              <SidebarGroup
                key={group.title}
                title={group.title}
                rows={group.rows}
                activeKey={activeKey}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

const tileClass =
  "group flex flex-col rounded-none border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900";

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-neutral-200 pb-2 dark:border-neutral-800">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-neutral-500">{title}</h2>
      {note && <span className="text-xs text-neutral-400">{note}</span>}
    </div>
  );
}

/** /standards: one cover card per standard (ATS today, MTS next). */
function Library({ rows }: { rows: SectionRow[] }) {
  const standards = listedStandards(rows);
  return (
    <article className="min-w-0 max-w-6xl flex-1 py-10">
      <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
        Standards
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-neutral-500 dark:text-neutral-400">
        NETA test procedures and tables from the company's licensed copies. Staff only.
      </p>

      {standards.length === 0 && (
        <p className="mt-10 rounded-none border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          Nothing loaded yet.
        </p>
      )}

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {standards.map((slug) => {
          const meta = STANDARDS[slug];
          const count = rows.filter((row) => row.standard === slug).length;
          return (
            <Link
              key={slug}
              to={`/standards/${slug}`}
              className="group flex flex-col"
            >
              {/* Artwork has a clear background: no frame needed. */}
              <div className="flex aspect-[16/9] items-center justify-center transition-opacity group-hover:opacity-90">
                {meta?.cover ? (
                  <img
                    src={meta.cover}
                    alt={`${meta.label} cover`}
                    className={`h-full w-full object-contain ${meta.coverClass ?? ""}`}
                  />
                ) : (
                  <BookOpen className="h-12 w-12 text-neutral-300" />
                )}
              </div>
              <div className="pt-4">
                <p className="font-semibold text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                  {standardLabel(slug)}
                </p>
                {meta?.fullTitle && (
                  <p className="mt-1 text-sm leading-snug text-neutral-500 dark:text-neutral-400">{meta.fullTitle}</p>
                )}
                {count > 0 ? (
                  <p className="mt-3 text-xs text-neutral-400">{count} pages</p>
                ) : (
                  <ComingSoonBadge className="mt-3" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

/** /standards/:standard: cover, quick access, then the whole book by family. */
function StandardHome({
  slug,
  rows,
  onSearch,
}: {
  slug: string;
  rows: SectionRow[];
  onSearch: () => void;
}) {
  const meta = STANDARDS[slug];
  const own = rows.filter((row) => row.standard === slug);
  const groups = groupRows(own);
  const families = groups.filter((group) => /^7\.\d/.test(group.title));
  const general = groups.filter(
    (group) => !/^7\.\d/.test(group.title) && group.title !== "Tables" && group.title !== "Appendices",
  );
  const tables = own.filter((row) => row.kind === "table");
  const appendices = groups.find((group) => group.title === "Appendices")?.rows ?? [];
  const procedures = own.filter((row) => row.kind === "section" && row.section_number.startsWith("7."));
  const quick = (meta?.quick ?? [])
    .map((num) => own.find((row) => row.section_number === num))
    .filter((row): row is SectionRow => Boolean(row));
  const firstProcedure = procedures[0];

  const loaded = own.length > 0;

  if (!loaded && !meta) {
    return (
      <p className="py-10 text-sm text-neutral-500">
        {standardLabel(slug)} isn't loaded yet.{" "}
        <Link to="/standards" className="docs-link">
          All standards
        </Link>
      </p>
    );
  }

  return (
    <article className="min-w-0 max-w-6xl flex-1 py-10">
      {/* Hero. The cover's bar runs the full width under the buttons; on wide
          screens the cover's letters ("2025 ATS") sit on it at the right. One
          fill, masked to letters + bar, so the colours stay continuous.
          Geometry and colour come from STANDARDS[slug].art. */}
      <div
        className={`std-hero relative ${meta?.heroArt ? "std-hero-letters" : ""}`}
        style={
          meta?.heroArt
            ? ({
                "--art-url": `url("${meta.heroArt}")`,
                ...(meta.art && {
                  "--letters-frac": String(meta.art.lettersFrac),
                  "--bar-frac": String(meta.art.barFrac),
                  "--art-bg": meta.art.bg,
                  "--art-bg-dark": meta.art.bgDark ?? meta.art.bg,
                }),
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className="std-hero-text relative z-10 min-w-0">
          {meta?.logo && (
            <img
              src={meta.logo}
              alt="ANSI accredited standards developer, NETA"
              className={`h-11 w-auto sm:h-14 ${meta.logoClass ?? ""}`}
            />
          )}
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            American National Standard
          </p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight text-neutral-900 xl:text-5xl dark:text-neutral-100">
            {standardLabel(slug)}
          </h1>
          {meta?.fullTitle && (
            <p className="mt-3 max-w-xl text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
              {meta.fullTitle}
            </p>
          )}

          {!loaded ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ComingSoonBadge className="!px-3 !py-1.5 !text-xs" />
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Test procedures and tables are on the way.
              </span>
            </div>
          ) : (
          <>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span>
              <strong className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{procedures.length}</strong>{" "}
              test procedures
            </span>
            <span>
              <strong className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{tables.length}</strong>{" "}
              tables
            </span>
            <span>
              <strong className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{own.length}</strong>{" "}
              pages
            </span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSearch}
              className="flex items-center gap-2 rounded-none bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Search className="h-4 w-4" />
              Search {meta?.short ?? standardLabel(slug)}
            </button>
            {firstProcedure && (
              <Link
                to={sectionPath(slug, firstProcedure.section_number)}
                className="flex items-center gap-2 rounded-none border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Test procedures
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          </>
          )}
        </div>

        <div aria-hidden="true" className="std-hero-art" />
      </div>

      {quick.length > 0 && (
        <div className="mt-12">
          <SectionHeading title="Quick access" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quick.map((row) => (
              <Link key={row.section_number} to={sectionPath(slug, row.section_number)} className={tileClass}>
                <span className="text-xs font-semibold text-brand">{displayNumber(row)}</span>
                <span className="mt-1 text-sm font-medium leading-snug text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                  {row.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {families.length > 0 && (
        <div className="mt-12">
          <SectionHeading title="Inspection and test procedures" note={`Section 7 · ${procedures.length} procedures`} />
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {families.map((group) => {
              const number = group.title.match(/^[\d.]+/)?.[0] ?? "";
              const name = group.title.replace(/^[\d.]+\s+/, "");
              return (
                <div
                  key={group.title}
                  className="mb-4 break-inside-avoid rounded-none border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <p className="flex items-baseline gap-2">
                    <span className="std-num text-xs text-neutral-400">{number}</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{name}</span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {group.rows.map((row) => (
                      <li key={row.section_number}>
                        <Link
                          to={sectionPath(slug, row.section_number)}
                          className="flex gap-2 text-sm text-neutral-600 transition-colors hover:text-brand dark:text-neutral-400"
                        >
                          <span className="w-16 flex-shrink-0 tabular-nums text-neutral-400">{row.section_number}</span>
                          <span>{group.rows.length === 1 ? "Full procedure" : shortTitle(row)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tables.length > 0 && (
        <div className="mt-12">
          <SectionHeading title="Tables" note={`${tables.length} tables`} />
          <ul className="columns-1 gap-8 lg:columns-2">
            {tables.map((row) => (
              <li key={row.section_number} className="mb-1.5 break-inside-avoid">
                <Link
                  to={sectionPath(slug, row.section_number)}
                  className="flex gap-3 text-sm text-neutral-600 transition-colors hover:text-brand dark:text-neutral-400"
                >
                  <span className="w-20 flex-shrink-0 font-medium tabular-nums text-neutral-900 dark:text-neutral-200">
                    {row.section_number}
                  </span>
                  <span>{row.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(general.length > 0 || appendices.length > 0) && (
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          {general.length > 0 && (
            <div>
              <SectionHeading title="General requirements" />
              <div className="space-y-4">
                {general.map((group) => (
                  <div key={group.title}>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{group.title}</p>
                    <ul className="mt-1 space-y-1">
                      {group.rows.map((row) => (
                        <li key={row.section_number}>
                          <Link
                            to={sectionPath(slug, row.section_number)}
                            className="flex gap-2 text-sm text-neutral-600 transition-colors hover:text-brand dark:text-neutral-400"
                          >
                            <span className="w-10 flex-shrink-0 tabular-nums text-neutral-400">{row.section_number}</span>
                            <span>{row.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {appendices.length > 0 && (
            <div>
              <SectionHeading title="Appendices" />
              <ul className="space-y-1">
                {appendices.map((row) => (
                  <li key={row.section_number}>
                    <Link
                      to={sectionPath(slug, row.section_number)}
                      className="flex gap-2 text-sm text-neutral-600 transition-colors hover:text-brand dark:text-neutral-400"
                    >
                      <span className="w-10 flex-shrink-0 font-medium text-neutral-400">{row.section_number}</span>
                      <span>{row.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {loaded && (
        <p className="mt-14 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
          From the company's licensed copy, for staff use only. Check the PDF before relying on a value.
        </p>
      )}
    </article>
  );
}

export default function StandardsPage() {
  const { standard, section } = useParams();
  const { pathname, hash } = useLocation();
  const [rows, setRows] = useState<SectionRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // Sidebar list: everything except the text itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("common")
          .from("standard_sections")
          .select("standard, section_number, kind, title, group_title, sort_order, book_page, pdf_page")
          .order("standard")
          .order("sort_order");
        if (error) throw error;
        if (!cancelled) setRows((data ?? []) as SectionRow[]);
      } catch (err: any) {
        console.error("Failed to load standards list", err);
        if (!cancelled) setListError(err?.message ?? "Could not load standards.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeKey = standard && section ? `${standard}/${section}` : null;
  const activeHome = standard && !section ? standard : null;

  // Page text, fetched on open and kept for back/forward.
  useEffect(() => {
    if (!activeKey || bodies[activeKey] !== undefined) return;
    let cancelled = false;
    setBodyError(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("common")
          .from("standard_sections")
          .select("body")
          .eq("standard", standard as string)
          .eq("section_number", section as string)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setBodies((prev) => ({ ...prev, [activeKey]: data?.body ?? "" }));
      } catch (err: any) {
        console.error("Failed to load standard section", err);
        if (!cancelled) setBodyError(err?.message ?? "Could not load this page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeKey, bodies, standard, section]);

  // New page: start at the top unless the URL points at an anchor.
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const standardRows = useMemo(
    () => (rows ?? []).filter((row) => row.standard === standard),
    [rows, standard],
  );
  const current = standardRows.find((row) => row.section_number === section) ?? null;
  // Report links can name a parent ("Table 100.12", "Section 7.6") that has
  // no page of its own; open its first part instead.
  const fallback =
    !current && section
      ? standardRows.find((row) => row.section_number.startsWith(`${section}.`)) ?? null
      : null;
  const index = current ? standardRows.indexOf(current) : -1;
  const previous = index > 0 ? standardRows[index - 1] : null;
  const next = index >= 0 && index < standardRows.length - 1 ? standardRows[index + 1] : null;

  const rawBody = activeKey ? bodies[activeKey] : undefined;
  const body = useMemo(() => {
    if (rawBody === undefined || !standard || !section) return undefined;
    return linkReferences(
      rawBody,
      standard,
      standardRows.map((row) => row.section_number),
      section,
    );
  }, [rawBody, standard, section, standardRows]);
  // Report links end in "#A.9": part A, step 9. Scroll to that step once the
  // text is on screen and flash it so the eye lands on it.
  useEffect(() => {
    if (!body || !hash) return;
    const match = /^#([A-Z])(?:\.(\d+))?/.exec(decodeURIComponent(hash));
    const root = proseRef.current;
    if (!match || !root) return;
    const [, part, step] = match;
    const heading = Array.from(root.querySelectorAll("h2")).find((el) =>
      (el.textContent ?? "").replace(/^[^A-Za-z0-9]+/, "").startsWith(`${part}.`),
    );
    if (!heading) return;
    let target: HTMLElement = heading;
    if (step) {
      const n = Number(step);
      for (let el = heading.nextElementSibling; el && el.tagName !== "H2"; el = el.nextElementSibling) {
        if (el.tagName !== "OL") continue;
        const start = Number(el.getAttribute("start") ?? 1);
        const item = el.children[n - start] as HTMLElement | undefined;
        if (n >= start && item) {
          target = item;
          break;
        }
      }
    }
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center" });
      target.classList.add("std-flash");
    });
    const timer = window.setTimeout(() => target.classList.remove("std-flash"), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      target.classList.remove("std-flash");
    };
  }, [body, hash]);

  const headings = useMemo(
    () => (body ? extractHeadings(body).filter((heading) => heading.level <= 3) : []),
    [body],
  );

  let main: React.ReactNode;
  if (listError) {
    main = (
      <p className="py-10 text-sm text-red-600 dark:text-red-400">{listError}</p>
    );
  } else if (!rows) {
    main = <p className="py-10 text-sm text-neutral-500">Loading…</p>;
  } else if (!standard) {
    main = <Library rows={rows} />;
  } else if (!section) {
    main = (
      <StandardHome
        slug={standard}
        rows={rows}
        onSearch={() => searchInputRef.current?.focus()}
      />
    );
  } else if (!current && fallback) {
    main = <Navigate to={`${sectionPath(fallback.standard, fallback.section_number)}${hash}`} replace />;
  } else if (!current) {
    main = (
      <div className="py-10">
        <p className="text-sm text-neutral-500">
          {section} isn't loaded yet.{" "}
          <Link to={`/standards/${standard}`} className="docs-link">
            Back to {standardLabel(standard)}
          </Link>
        </p>
      </div>
    );
  } else {
    main = (
      <div className="flex min-w-0 flex-1 gap-10">
        <article className="min-w-0 max-w-3xl flex-1 py-10">
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-500">
            <Link
              to={`/standards/${current.standard}`}
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
            >
              {standardLabel(current.standard)}
            </Link>
            {current.group_title && (
              <>
                <ChevronRight className="h-3 w-3 text-neutral-400" />
                <span>{current.group_title}</span>
              </>
            )}
          </div>

          <p className="text-sm font-semibold text-brand">{displayNumber(current)}</p>
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
            {current.title}
          </h1>
          {(current.book_page || current.pdf_page) && (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              {current.book_page ? `Book page ${current.book_page}` : ""}
              {current.book_page && current.pdf_page ? " · " : ""}
              {current.pdf_page ? `PDF page ${current.pdf_page}` : ""}
            </p>
          )}

          <div ref={proseRef} className="docs-prose mt-8">
            {bodyError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{bodyError}</p>
            ) : body === undefined ? (
              <p className="text-sm text-neutral-500">Loading…</p>
            ) : (
              <Markdown content={body} />
            )}
          </div>

          <p className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
            Source: {standardLabel(current.standard)}, licensed copy. Typed in from the PDF; check the
            PDF before relying on a value.
          </p>

          {(previous || next) && (
            <div className="docs-no-print mt-10 grid gap-3 sm:grid-cols-2">
              {previous ? (
                <Link
                  to={sectionPath(previous.standard, previous.section_number)}
                  className="group flex flex-col rounded-none border border-neutral-200 px-4 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <ArrowLeft className="h-3 w-3" />
                    Previous
                  </span>
                  <span className="mt-1 text-sm font-medium text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                    {displayNumber(previous)} {previous.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  to={sectionPath(next.standard, next.section_number)}
                  className="group flex flex-col rounded-none border border-neutral-200 px-4 py-3 text-right transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  <span className="flex items-center justify-end gap-1.5 text-xs text-neutral-500">
                    Next
                    <ArrowRight className="h-3 w-3" />
                  </span>
                  <span className="mt-1 text-sm font-medium text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                    {displayNumber(next)} {next.title}
                  </span>
                </Link>
              )}
            </div>
          )}
        </article>

        <div className="docs-no-print docs-scroll sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 flex-shrink-0 overflow-y-auto py-10 xl:block">
          <DocsToc headings={headings} />
        </div>
      </div>
    );
  }

  return (
    <div className="docs-root std-root min-h-screen">
      {/* Top bar. A <div>, not <header>: a browser extension hides <header>. */}
      <div className="docs-no-print sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="mx-auto flex h-14 max-w-[100rem] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-none p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 lg:hidden dark:hover:bg-neutral-800"
            aria-label="Open sections"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/standards"
            className="flex flex-shrink-0 items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100"
          >
            <BookOpen className="h-5 w-5 text-brand" />
            <span className="hidden sm:inline">Standards</span>
          </Link>

          <div className="flex flex-1 justify-center">
            <StandardsSearch inputRef={searchInputRef} />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/portal"
              className="flex items-center gap-1.5 rounded-none border border-neutral-200 px-2.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to {companyConfig.name}</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[100rem] gap-8 px-4 sm:px-6">
        <div className="docs-no-print docs-scroll sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 flex-shrink-0 overflow-y-auto py-8 lg:block">
          {rows && <StandardsSidebar rows={rows} activeKey={activeKey} activeHome={activeHome} />}
        </div>
        {main}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="docs-root std-root docs-scroll absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Sections</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-none p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close sections"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {rows && (
              <StandardsSidebar
                rows={rows}
                activeKey={activeKey}
                activeHome={activeHome}
                onNavigate={() => setDrawerOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
