/**
 * Loads every Markdown file under src/docs/content at build time and turns it
 * into a lookup table keyed by slug ("jobs/creating-a-job").
 *
 * Vite inlines these with `?raw`, so there is no runtime fetch and no loading
 * state. A docs page renders on first paint.
 */

import { extractHeadings, toPlainText, type DocsHeading } from "./markdown";
import { parseFrontmatter, type DocsFrontmatter } from "./frontmatter";

export type { DocsFrontmatter };

export interface DocsPage extends DocsFrontmatter {
  /** "jobs/creating-a-job" */
  slug: string;
  /** "jobs" */
  section: string;
  /** Raw Markdown body with the frontmatter block removed. */
  body: string;
  headings: DocsHeading[];
  /** Flattened prose, used by the search index. */
  plainText: string;
}

const modules = import.meta.glob<string>("../content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function slugFromPath(path: string): string {
  return path
    .replace(/^\.\.\/content\//, "")
    .replace(/\.md$/, "")
    .replace(/\/index$/, "");
}

export const docsPages: Record<string, DocsPage> = Object.fromEntries(
  Object.entries(modules).map(([path, raw]) => {
    const slug = slugFromPath(path);
    const { data, body } = parseFrontmatter(raw);
    const page: DocsPage = {
      slug,
      section: slug.split("/")[0],
      title: data.title ?? slug,
      description: data.description ?? "",
      badge: data.badge,
      keywords: Array.isArray(data.keywords) ? data.keywords : undefined,
      body,
      headings: extractHeadings(body),
      plainText: toPlainText(body),
    };
    return [slug, page];
  }),
);

export function getDocsPage(slug: string): DocsPage | undefined {
  return docsPages[slug];
}

export const allDocsPages: DocsPage[] = Object.values(docsPages);
