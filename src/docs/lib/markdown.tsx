/**
 * Minimal, dependency-free Markdown renderer for the ampOS docs site.
 *
 * We deliberately avoid react-markdown/remark here: the docs ship inside the
 * app bundle, and the subset of Markdown we actually author is small enough
 * that a ~400 line parser beats a ~200kb dependency tree.
 *
 * Supported syntax:
 *   # .. ##### headings (auto-anchored, feed the "On this page" rail)
 *   paragraphs, **bold**, *italic*, `code`, ~~strike~~, [links](/docs/x)
 *   - bullet lists (one level of nesting via two-space indent)
 *   1. ordered lists -> rendered as numbered steps
 *   ```lang fenced code blocks (with copy button)
 *   | pipe | tables |
 *   > blockquotes
 *   ::: note | tip | warning | danger  ... :::   callouts
 *   --- horizontal rules
 *   ![alt](src) images
 */

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Info, Lightbulb, AlertTriangle, OctagonAlert } from "lucide-react";

/* ------------------------------------------------------------------ *
 * Slugs + heading extraction
 * ------------------------------------------------------------------ */

export interface DocsHeading {
  /** Anchor id, e.g. "creating-a-job". */
  id: string;
  /** Visible heading text with inline markup stripped. */
  text: string;
  /** 2 for `##`, 3 for `###`. Only these two show in the TOC rail. */
  level: number;
}

/** Strip inline markup so headings read cleanly in the TOC and search index. */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .trim();
}

export function slugify(text: string): string {
  return stripInline(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Pull `##`/`###` headings out of raw Markdown, skipping fenced code. */
export function extractHeadings(markdown: string): DocsHeading[] {
  const headings: DocsHeading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!match) continue;

    const text = stripInline(match[2]);
    let id = slugify(text);
    // Duplicate headings ("Notes" appearing twice) still need unique anchors.
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count}`;

    headings.push({ id, text, level: match[1].length });
  }

  return headings;
}

/** Plain-text version of a doc, used to build the search index. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^:::.*$/gm, " ")
    .replace(/^[|>\-#*\d.\s]+/gm, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Inline parsing
 * ------------------------------------------------------------------ */

// Order matters: code spans win over everything so `**foo**` inside backticks
// stays literal.
const INLINE_SOURCE = [
  "`([^`]+)`", // 1 code
  "!\\[([^\\]]*)\\]\\(([^)]+)\\)", // 2 alt, 3 src
  "\\[([^\\]]+)\\]\\(([^)]+)\\)", // 4 text, 5 href
  "\\*\\*([^*]+)\\*\\*", // 6 bold
  "~~([^~]+)~~", // 7 strike
  "\\*([^*]+)\\*", // 8 italic
  "_([^_]+)_", // 9 italic
].join("|");

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith("/");
  if (isInternal) {
    return (
      <Link to={href} className="docs-link">
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="docs-link">
      {children}
    </a>
  );
}

export function parseInline(text: string, keyPrefix = "i"): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // A fresh regex per call: parseInline recurses (bold containing a link, for
  // example), and a shared /g/ regex would have its lastIndex clobbered by the
  // inner call, restarting the outer scan forever.
  const pattern = new RegExp(INLINE_SOURCE, "g");

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const k = `${keyPrefix}-${key++}`;

    if (match[1] !== undefined) {
      nodes.push(
        <code key={k} className="docs-code-inline">
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined || match[3] !== undefined) {
      nodes.push(<img key={k} src={match[3]} alt={match[2]} className="docs-inline-img" />);
    } else if (match[4] !== undefined) {
      nodes.push(
        <InlineLink key={k} href={match[5]}>
          {parseInline(match[4], k)}
        </InlineLink>,
      );
    } else if (match[6] !== undefined) {
      nodes.push(<strong key={k}>{parseInline(match[6], k)}</strong>);
    } else if (match[7] !== undefined) {
      nodes.push(<del key={k}>{parseInline(match[7], k)}</del>);
    } else if (match[8] !== undefined) {
      nodes.push(<em key={k}>{parseInline(match[8], k)}</em>);
    } else if (match[9] !== undefined) {
      nodes.push(<em key={k}>{parseInline(match[9], k)}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/* ------------------------------------------------------------------ *
 * Code block with copy button
 * ------------------------------------------------------------------ */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="docs-codeblock">
      <div className="docs-codeblock-bar">
        <span className="docs-codeblock-lang">{lang || "text"}</span>
        <button type="button" onClick={copy} className="docs-copy-btn" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Callouts
 * ------------------------------------------------------------------ */

const CALLOUT_META: Record<string, { icon: React.ElementType; label: string }> = {
  note: { icon: Info, label: "Note" },
  tip: { icon: Lightbulb, label: "Tip" },
  warning: { icon: AlertTriangle, label: "Warning" },
  danger: { icon: OctagonAlert, label: "Careful" },
};

function Callout({ kind, children }: { kind: string; children: React.ReactNode }) {
  const meta = CALLOUT_META[kind] ?? CALLOUT_META.note;
  const Icon = meta.icon;
  return (
    <div className={`docs-callout docs-callout-${kind}`}>
      <Icon className="docs-callout-icon h-4 w-4" />
      <div className="docs-callout-body">
        <p className="docs-callout-label">{meta.label}</p>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Block parsing
 * ------------------------------------------------------------------ */

interface RenderState {
  /** Mirrors extractHeadings() so anchor ids stay in sync with the TOC. */
  seenSlugs: Map<string, number>;
  key: number;
}

/**
 * Mirrors the de-duplication in extractHeadings() so a page's anchors and its
 * TOC agree. Only h2/h3 participate in the counter, because only those are
 * collected by extractHeadings.
 */
function headingId(text: string, level: number, state: RenderState): string {
  const base = slugify(text);
  if (level < 2 || level > 3) return base;

  const count = state.seenSlugs.get(base) ?? 0;
  state.seenSlugs.set(base, count + 1);
  return count > 0 ? `${base}-${count}` : base;
}

/** A list item may itself contain nested bullets. */
interface ListItem {
  content: string;
  children: string[];
}

function renderListItems(items: ListItem[], keyPrefix: string): React.ReactNode[] {
  return items.map((item, index) => (
    <li key={`${keyPrefix}-li-${index}`}>
      <span>{parseInline(item.content, `${keyPrefix}-${index}`)}</span>
      {item.children.length > 0 && (
        <ul className="docs-list docs-list-nested">
          {item.children.map((child, childIndex) => (
            <li key={`${keyPrefix}-li-${index}-${childIndex}`}>
              {parseInline(child, `${keyPrefix}-${index}-${childIndex}`)}
            </li>
          ))}
        </ul>
      )}
    </li>
  ));
}

function renderTable(rows: string[][], keyPrefix: string): React.ReactNode {
  const [head, ...body] = rows;
  return (
    <div className="docs-table-wrap" key={keyPrefix}>
      <table className="docs-table">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={`${keyPrefix}-th-${index}`}>{parseInline(cell, `${keyPrefix}-th-${index}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`${keyPrefix}-tr-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}>
                  {parseInline(cell, `${keyPrefix}-td-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Render a Markdown string to React elements.
 *
 * Exported separately from the component so callouts can recursively render
 * their own body content.
 */
export function renderMarkdown(markdown: string, state?: RenderState): React.ReactNode[] {
  const localState: RenderState = state ?? { seenSlugs: new Map(), key: 0 };
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  const nextKey = () => `b-${localState.key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    const fence = /^\s*```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buffer.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(<CodeBlock key={nextKey()} code={buffer.join("\n")} lang={lang} />);
      continue;
    }

    // Callout: ::: note
    const calloutOpen = /^:::\s*(note|tip|warning|danger)\s*$/.exec(line.trim());
    if (calloutOpen) {
      const buffer: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        buffer.push(lines[i]);
        i++;
      }
      i++; // closing :::
      out.push(
        <Callout key={nextKey()} kind={calloutOpen[1]}>
          {renderMarkdown(buffer.join("\n"), localState)}
        </Callout>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={nextKey()} className="docs-hr" />);
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,5})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const raw = heading[2].trim();
      const text = stripInline(raw);
      // h1 is rendered by the page shell from frontmatter, so treat any inline
      // h1 as an h2 to keep a single top-level title per page.
      const effectiveLevel = Math.max(2, level);
      const id = headingId(text, effectiveLevel, localState);
      const Tag = `h${Math.min(effectiveLevel, 6)}` as keyof JSX.IntrinsicElements;
      out.push(
        <Tag key={nextKey()} id={id} className={`docs-h${effectiveLevel}`}>
          <a href={`#${id}`} className="docs-anchor" aria-label={`Link to ${text}`}>
            #
          </a>
          {parseInline(raw, id)}
        </Tag>,
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows: string[][] = [splitTableRow(line)];
      i += 2; // header + separator
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      out.push(renderTable(rows, nextKey()));
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buffer: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={nextKey()} className="docs-quote">
          {renderMarkdown(buffer.join("\n"), localState)}
        </blockquote>,
      );
      continue;
    }

    // Ordered list -> numbered steps
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && (/^\s*\d+\.\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(lines[i]);
        if (ordered) {
          items.push({ content: ordered[2], children: [] });
        } else if (items.length > 0) {
          const nested = /^\s{2,}[-*]\s+(.*)$/.exec(lines[i]);
          if (nested) items[items.length - 1].children.push(nested[1]);
          else items[items.length - 1].content += ` ${lines[i].trim()}`;
        }
        i++;
      }
      const k = nextKey();
      out.push(
        <ol key={k} className="docs-steps">
          {renderListItems(items, k)}
        </ol>,
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const indent = lines[i].search(/\S/);
        const content = lines[i].replace(/^\s*[-*]\s+/, "");
        if (indent >= 2 && items.length > 0) items[items.length - 1].children.push(content);
        else items.push({ content, children: [] });
        i++;
      }
      const k = nextKey();
      out.push(
        <ul key={k} className="docs-list">
          {renderListItems(items, k)}
        </ul>,
      );
      continue;
    }

    // Standalone image
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (image) {
      out.push(
        <figure key={nextKey()} className="docs-figure">
          <img src={image[2]} alt={image[1]} />
          {image[1] && <figcaption>{image[1]}</figcaption>}
        </figure>,
      );
      i++;
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|:::|#{1,5}\s|>|[-*]\s|\d+\.\s)/.test(lines[i]) &&
      !lines[i].trim().startsWith("|")
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length > 0) {
      const k = nextKey();
      out.push(
        <p key={k} className="docs-p">
          {parseInline(paragraph.join(" "), k)}
        </p>,
      );
    } else {
      // Defensive: never let an unmatched line spin the loop forever.
      i++;
    }
  }

  return out;
}

/** Convenience component wrapper. */
export function Markdown({ content }: { content: string }) {
  return <>{renderMarkdown(content)}</>;
}
