/**
 * Renders a single documentation page from its Markdown source.
 *
 * The slug comes from the `*` splat on the /docs/* route, so
 * /docs/jobs/creating-a-job resolves to content/jobs/creating-a-job.md.
 */

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, FileQuestion } from "lucide-react";
import { getDocsPage } from "../lib/content";
import { findGroupTitle, findSection, getAdjacentPages } from "../nav";
import { Markdown } from "../lib/markdown";
import { DocsToc } from "./DocsToc";

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <FileQuestion className="mx-auto h-10 w-10 text-neutral-300 dark:text-neutral-700" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        There is no documentation page at <code className="docs-code-inline">/docs/{slug}</code> yet.
      </p>
      <Link
        to="/docs"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the docs home
      </Link>
    </div>
  );
}

export function DocsPage() {
  // Derived from the URL rather than a route param: the docs are registered as
  // one route per section (see docsRoutePaths) so that a slug like
  // /docs/jobs/overview cannot be captured by the app's /:division/jobs/:id
  // route, which React Router ranks higher than a /docs/* splat.
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname)
    .replace(/^\/docs\/?/, "")
    .replace(/\/$/, "");
  const page = getDocsPage(slug);

  if (!page) return <NotFound slug={slug} />;

  const section = findSection(slug);
  const groupTitle = findGroupTitle(slug);
  const { previous, next } = getAdjacentPages(slug);

  return (
    <div className="flex gap-10">
      <article className="min-w-0 flex-1 py-10 pb-24">
        {/* Breadcrumbs */}
        <div className="docs-no-print mb-5 flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-500">
          <Link to="/docs" className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-200">
            Docs
          </Link>
          {section && (
            <>
              <ChevronRight className="h-3 w-3 text-neutral-400" />
              <Link
                to={`/docs/${section.groups[0]?.items[0]?.slug ?? ""}`}
                className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
              >
                {section.title}
              </Link>
            </>
          )}
          {groupTitle && (
            <>
              <ChevronRight className="h-3 w-3 text-neutral-400" />
              <span>{groupTitle}</span>
            </>
          )}
        </div>

        <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
          {page.title}
        </h1>
        {page.description && (
          <p className="mt-3 text-lg leading-relaxed text-neutral-500 dark:text-neutral-400">
            {page.description}
          </p>
        )}

        <div className="docs-prose mt-10">
          <Markdown content={page.body} />
        </div>

        {/* Prev / next pager */}
        {(previous || next) && (
          <div className="docs-no-print mt-16 grid gap-3 border-t border-neutral-200 pt-8 sm:grid-cols-2 dark:border-neutral-800">
            {previous ? (
              <Link
                to={`/docs/${previous.slug}`}
                className="group flex flex-col rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
              >
                <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <ArrowLeft className="h-3 w-3" />
                  Previous
                </span>
                <span className="mt-1 text-sm font-medium text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                  {previous.title}
                </span>
              </Link>
            ) : (
              <span />
            )}

            {next && (
              <Link
                to={`/docs/${next.slug}`}
                className="group flex flex-col rounded-xl border border-neutral-200 px-4 py-3 text-right transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
              >
                <span className="flex items-center justify-end gap-1.5 text-xs text-neutral-500">
                  Next
                  <ArrowRight className="h-3 w-3" />
                </span>
                <span className="mt-1 text-sm font-medium text-neutral-900 group-hover:text-brand dark:text-neutral-100">
                  {next.title}
                </span>
              </Link>
            )}
          </div>
        )}
      </article>

      {/* On this page */}
      <div className="docs-no-print sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 flex-shrink-0 overflow-y-auto py-10 xl:block docs-scroll">
        <DocsToc headings={page.headings.filter((heading) => heading.level <= 3)} />
      </div>
    </div>
  );
}
