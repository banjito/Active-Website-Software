/**
 * Docs search index.
 *
 * Every page is split into "records": one for the page itself plus one per
 * `##`/`###` heading, so a hit can deep-link straight to the right anchor
 * instead of dumping you at the top of a long page.
 *
 * fuse.js is already a dependency (used elsewhere in the app), so this adds
 * no new install.
 */

import Fuse from "fuse.js";
import { allDocsPages } from "./content";
import { stripInline } from "./markdown";
import { docsFlatNav, docsSections } from "../nav";

export interface DocsSearchRecord {
  /** "jobs/creating-a-job" or "jobs/creating-a-job#pick-a-customer" */
  id: string;
  slug: string;
  anchor?: string;
  /** Page title. */
  title: string;
  /** Heading text when this record is a section of a page. */
  heading?: string;
  sectionTitle: string;
  description: string;
  /** Prose used for matching and for the result snippet. */
  content: string;
}

/** Only index pages that are actually reachable from the sidebar. */
const navigableSlugs = new Set(docsFlatNav.map((item) => item.slug));

const sectionTitleBySlug = new Map(
  docsSections.map((section) => [section.slug, section.title]),
);

/**
 * Split a page's plain text at heading boundaries so each record carries the
 * prose that belongs to it. Falls back to the whole body when a page has no
 * subheadings.
 */
function buildRecords(): DocsSearchRecord[] {
  const records: DocsSearchRecord[] = [];

  for (const page of allDocsPages) {
    if (!navigableSlugs.has(page.slug)) continue;

    const sectionTitle = sectionTitleBySlug.get(page.section) ?? page.section;

    records.push({
      id: page.slug,
      slug: page.slug,
      title: page.title,
      sectionTitle,
      description: page.description,
      content: [page.description, ...(page.keywords ?? []), page.plainText.slice(0, 600)].join(" "),
    });

    // Cut the raw body at each heading so snippets stay local to the section.
    const chunks = page.body.split(/^(#{2,3})\s+(.*)$/m);
    // split() with two capture groups yields [pre, hashes, text, body, ...].
    for (let i = 1; i + 2 <= chunks.length; i += 3) {
      const chunkBody = chunks[i + 2] ?? "";
      // extractHeadings() stores stripped text, so strip here too or headings
      // containing `code` or **bold** would never match and would drop out of
      // the index.
      const headingText = stripInline(chunks[i + 1] ?? "");
      if (!headingText) continue;

      const heading = page.headings.find((entry) => entry.text === headingText);
      if (!heading) continue;

      records.push({
        id: `${page.slug}#${heading.id}`,
        slug: page.slug,
        anchor: heading.id,
        title: page.title,
        heading: heading.text,
        sectionTitle,
        description: page.description,
        content: chunkBody.replace(/\s+/g, " ").trim().slice(0, 600),
      });
    }
  }

  return records;
}

/**
 * Built on first search rather than at module load. Splitting ~90 pages into
 * ~700 records is not free, and doing it eagerly would tax opening any docs
 * page for the sake of a feature most readers never touch.
 */
let cachedIndex: Fuse<DocsSearchRecord> | null = null;

function getIndex(): Fuse<DocsSearchRecord> {
  if (!cachedIndex) {
    cachedIndex = new Fuse(buildRecords(), {
      includeMatches: true,
      threshold: 0.34,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: "title", weight: 0.4 },
        { name: "heading", weight: 0.3 },
        { name: "description", weight: 0.2 },
        { name: "content", weight: 0.1 },
      ],
    });
  }
  return cachedIndex;
}

/**
 * Warm the index ahead of the first keystroke. Called when the search dialog
 * opens, so building it overlaps with the user typing rather than blocking it.
 */
export function prepareDocsSearch(): void {
  getIndex();
}

export interface DocsSearchHit extends DocsSearchRecord {
  /** Short excerpt around the first match, for the results list. */
  snippet: string;
}

/** Pull ~140 characters of context around the first match. */
function makeSnippet(content: string, query: string): string {
  if (!content) return "";
  const index = content.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0] ?? "");
  if (index < 0) return content.slice(0, 140);
  const start = Math.max(0, index - 45);
  const excerpt = content.slice(start, start + 150).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + 150 < content.length ? "…" : ""}`;
}

export function searchDocs(query: string, limit = 12): DocsSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  return getIndex()
    .search(trimmed, { limit })
    .map(({ item }) => ({ ...item, snippet: makeSnippet(item.content, trimmed) }));
}
