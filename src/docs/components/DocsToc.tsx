/**
 * "On this page" rail with scroll spy.
 *
 * Uses IntersectionObserver with a top-weighted root margin so the highlighted
 * entry is the heading you are actually reading, not the one just entering the
 * bottom of the viewport.
 */

import React, { useEffect, useState } from "react";
import type { DocsHeading } from "../lib/markdown";

export function DocsToc({ headings }: { headings: DocsHeading[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
          return;
        }

        // Nothing in the band (long section): fall back to the last heading
        // scrolled past so the rail never goes blank.
        const passed = elements.filter((element) => element.getBoundingClientRect().top < 120);
        if (passed.length > 0) setActiveId(passed[passed.length - 1].id);
      },
      { rootMargin: "-88px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="docs-no-print">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        On this page
      </p>
      <div className="border-l border-neutral-200 dark:border-neutral-800">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            data-level={heading.level}
            data-active={activeId === heading.id}
            className="docs-toc-link"
            onClick={(event) => {
              // Native anchor jumps skip our sticky offset; scroll manually.
              event.preventDefault();
              const target = document.getElementById(heading.id);
              if (!target) return;
              window.history.replaceState(null, "", `#${heading.id}`);
              target.scrollIntoView({ behavior: "smooth", block: "start" });
              setActiveId(heading.id);
            }}
          >
            {heading.text}
          </a>
        ))}
      </div>
    </div>
  );
}
