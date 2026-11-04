/**
 * Docs landing page: a hero, the section grid, and a few high-traffic links.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Rocket, Search, Sparkles } from "lucide-react";
import { companyConfig } from "@/lib/companyConfig";
import { docsSections } from "../nav";
import { useOpenDocsSearch } from "./DocsSearch";
import { LetterGlitch, type RGB } from "./LetterGlitch";

/**
 * The live brand colour as RGB, read from the --brand variable so each ampOS
 * instance glitches in its own colour. Neutral grey until it resolves.
 */
function useBrandRgb(): RGB {
  const [rgb, setRgb] = useState<RGB>([160, 160, 160]);
  useEffect(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--brand)";
    probe.style.display = "none";
    document.body.appendChild(probe);
    const parts = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
    probe.remove();
    if (parts && parts.length >= 3) setRgb([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
  }, []);
  return rgb;
}

/** Hand-picked shortcuts for the tasks people land here to do. */
const POPULAR = [
  { title: "Create your first job", slug: "jobs/creating-a-job" },
  { title: "Start a test report", slug: "reports/creating-a-report" },
  { title: "Build a deliverable", slug: "deliverables/building-a-deliverable" },
  { title: "Roles and permissions", slug: "admin/roles-and-permissions" },
  { title: "Connect QuickBooks", slug: "integrations/quickbooks" },
  { title: "Report catalog", slug: "reports/catalog" },
];

export function DocsHome() {
  const openSearch = useOpenDocsSearch();
  const brand = useBrandRgb();
  const [heroActive, setHeroActive] = useState(false);

  // Two palettes, one per theme. Each keeps the original's three-tone mix.
  const glitch = useMemo(() => {
    const mix = (to: RGB, amount: number): RGB => [
      Math.round(brand[0] + (to[0] - brand[0]) * amount),
      Math.round(brand[1] + (to[1] - brand[1]) * amount),
      Math.round(brand[2] + (to[2] - brand[2]) * amount),
    ];
    return {
      // Pale brand tints and light grey on the near-white card.
      light: [mix([255, 255, 255], 0.75), mix([255, 255, 255], 0.4), [212, 212, 212]] as RGB[],
      // Dim brand, full brand and dark grey on the near-black card.
      dark: [mix([0, 0, 0], 0.65), brand, [82, 82, 82]] as RGB[],
    };
  }, [brand]);

  return (
    <div className="pb-24 pt-12">
      {/* Hero. A plain card at rest; on hover or keyboard focus a Letter Glitch
          field (React Bits) fades in behind the text, with a palette per theme.
          Same hover-only rule as the portal card animations. */}
      <div
        className="relative overflow-hidden rounded-none border border-neutral-200 bg-neutral-50 px-6 py-12 sm:px-12 sm:py-16 dark:border-neutral-800 dark:bg-neutral-900"
        onMouseEnter={() => setHeroActive(true)}
        onMouseLeave={() => setHeroActive(false)}
        onFocus={() => setHeroActive(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroActive(false);
        }}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
            heroActive ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Light theme. The hidden copy measures 0x0 and does no work. */}
          <div className="absolute inset-0 dark:hidden">
            <LetterGlitch
              colors={glitch.light}
              background="#fafafa"
              vignette="rgba(250, 250, 250, 1)"
              active={heroActive}
              glitchSpeed={50}
              smooth
              outerVignette
            />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-50/95 via-neutral-50/70 to-transparent" />
          </div>
          {/* Dark theme. */}
          <div className="absolute inset-0 hidden dark:block">
            <LetterGlitch
              colors={glitch.dark}
              background="#171717"
              vignette="rgba(23, 23, 23, 1)"
              active={heroActive}
              glitchSpeed={50}
              smooth
              outerVignette
            />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/95 via-neutral-900/65 to-transparent" />
          </div>
        </div>

        <div className="relative max-w-2xl">
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl dark:text-neutral-100">
            All things ampOS.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
            Everything from creating a job to shipping a signed deliverable.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/docs/getting-started/introduction"
              className="inline-flex items-center gap-2 rounded-none bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Rocket className="h-4 w-4" />
              Get started
            </Link>
            <button
              type="button"
              onClick={openSearch}
              className="inline-flex items-center gap-2 rounded-none border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Search className="h-4 w-4" />
              Search the docs
            </button>
          </div>
        </div>
      </div>

      {/* Popular */}
      <div className="mt-10">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Popular
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map((item) => (
            <Link
              key={item.slug}
              to={`/docs/${item.slug}`}
              className="rounded-none border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-600 transition-colors hover:border-brand hover:text-brand dark:border-neutral-800 dark:text-neutral-400"
            >
              {item.title}
            </Link>
          ))}
        </div>
      </div>

      {/* Section grid */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docsSections.map((section) => {
          const Icon = section.icon;
          const firstSlug = section.groups[0]?.items[0]?.slug;
          return (
            <Link
              key={section.slug}
              to={`/docs/${firstSlug ?? ""}`}
              className="group flex flex-col rounded-none border border-neutral-200 p-5 transition-all hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-none border border-neutral-200 bg-neutral-50 text-neutral-500 transition-colors group-hover:border-brand group-hover:text-brand dark:border-neutral-800 dark:bg-neutral-900">
                <Icon className="h-4 w-4" />
              </span>

              <span className="mt-4 flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                {section.title}
                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                {section.description}
              </span>

              <span className="mt-4 text-[11px] uppercase tracking-wide text-neutral-400">
                {section.groups.reduce((total, group) => total + group.items.length, 0)} pages
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
