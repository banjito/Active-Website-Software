/**
 * Frontmatter parsing for docs Markdown files.
 *
 * Lives in its own module because two consumers need it and only one of them
 * wants the whole content glob: `content.ts` eagerly inlines every docs page,
 * while `procedures.ts` inlines only the MOP folder so the in-app MOP drawer
 * can be opened without downloading the entire docs site.
 */

export interface DocsFrontmatter {
  title: string;
  description: string;
  /** Optional "Draft" / "Beta" style pill shown next to the sidebar entry. */
  badge?: string;
  /** Extra search terms that don't appear in the prose. */
  keywords?: string[];
}

/**
 * Parse a `---` delimited YAML-ish frontmatter block.
 * Only the handful of scalar/list keys we actually use are supported.
 */
export function parseFrontmatter(raw: string): {
  data: Partial<DocsFrontmatter>;
  body: string;
} {
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
