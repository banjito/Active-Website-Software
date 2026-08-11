/**
 * The MOP (Method of Procedure) library, loaded on its own.
 *
 * `lib/content.ts` eagerly inlines every docs page, which is fine for the docs
 * site but far too much to download just to read one procedure on a job site.
 * This module globs only `content/procedures/*.md`, so the in-app MOP panel
 * pulls a few pages instead of the whole handbook. Vite resolves both globs to
 * the same `?raw` module ids, so nothing is duplicated in the build.
 *
 * Order and grouping come from `nav.ts` so the panel and the docs sidebar can
 * never drift apart.
 */

import { parseFrontmatter } from "./lib/frontmatter";
import { docsSections } from "./nav";

export interface Procedure {
  /** Full docs slug, e.g. "procedures/transformer". */
  slug: string;
  /** Path segment on its own, e.g. "transformer". */
  id: string;
  title: string;
  description: string;
  badge?: string;
  /** Sidebar group the procedure belongs to, e.g. "Power equipment". */
  group: string;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Lowercased haystack for the panel's filter box. */
  searchText: string;
}

const modules = import.meta.glob<string>("./content/procedures/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** "./content/procedures/transformer.md" -> "transformer" */
function idFromPath(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

const byId = new Map<string, { raw: string }>(
  Object.entries(modules).map(([path, raw]) => [idFromPath(path), { raw }]),
);

const section = docsSections.find((entry) => entry.slug === "procedures");

/**
 * Every procedure except the library overview, in sidebar order.
 *
 * The overview is the landing page for the docs section; the panel opens
 * straight to the list, so repeating it as a list entry would be noise.
 */
export const procedures: Procedure[] = (section?.groups ?? []).flatMap((group) =>
  group.items.flatMap((item) => {
    const id = item.slug.split("/")[1];
    const entry = byId.get(id);
    if (!entry || id === "overview") return [];

    const { data, body } = parseFrontmatter(entry.raw);
    const title = data.title ?? item.title;
    const description = data.description ?? "";
    return [
      {
        slug: item.slug,
        id,
        title,
        description,
        badge: data.badge,
        group: group.title,
        body,
        searchText: [title, description, group.title, ...(data.keywords ?? []), body]
          .join(" ")
          .toLowerCase(),
      },
    ];
  }),
);

/** Group titles in sidebar order, each with the procedures under it. */
export const procedureGroups: { title: string; items: Procedure[] }[] = procedures.reduce(
  (groups, procedure) => {
    const last = groups[groups.length - 1];
    if (last && last.title === procedure.group) last.items.push(procedure);
    else groups.push({ title: procedure.group, items: [procedure] });
    return groups;
  },
  [] as { title: string; items: Procedure[] }[],
);

export function findProcedure(id: string): Procedure | undefined {
  return procedures.find((procedure) => procedure.id === id);
}
