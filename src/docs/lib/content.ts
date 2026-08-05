/**
 * Loads every Markdown file under src/docs/content at build time and turns it
 * into a lookup table keyed by slug ("jobs/creating-a-job").
 *
 * Vite inlines these with `?raw`, so there is no runtime fetch and no loading
 * state. A docs page renders on first paint.
 */

import { extractHeadings, toPlainText, type DocsHeading } from "./markdown";

export interface DocsFrontmatter {
  title: string;
  description: string;
  /** Optional "Draft" / "Beta" style pill shown next to the sidebar entry. */
  badge?: string;
  /** Extra search terms that don't appear in the prose. */
  keywords?: string[];
}

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

/**
 * Parse a `---` delimited YAML-ish frontmatter block.
 * Only the handful of scalar/list keys we actually use are supported.
 */
function parseFrontmatter(raw: string): { data: Partial<DocsFrontmatter>; body: string } {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const pair = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!pair) continue;

    const key = pair[1];
    let value: string | string[] = pair[2].trim();

    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Inline list: keywords: [a, b, c]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    data[key] = value;
  }

  return { data: data as Partial<DocsFrontmatter>, body: raw.slice(match[0].length) };
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
