/**
 * NETA references in report text ("Table 100.12", "Section 9") become links
 * to the standards reader (/standards), opening in a new tab.
 *
 * Screen only: in print the link is plain text, so printed and PDF reports
 * look unchanged. Links point at a section number; the reader forwards a
 * parent number ("Table 100.12", "Section 7.6") to its first part.
 */
import React from "react";

// "Table 100.1", "Table 100.12.1", "Section 9", "Section 7.6.1.1". A trailing
// period is never captured, so "use Table 100.12." links "Table 100.12".
const REF_PATTERN = /\b(?:Table\s+(100(?:\.\d+)+)|Section\s+(\d+(?:\.\d+)*))/g;

export function standardRefHref(standard: string, num: string): string {
  return `/standards/${standard}/${num}`;
}

export function StandardRef({
  standard,
  num,
  children,
}: {
  standard: string;
  num: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={standardRefHref(standard, num)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in the standard (new tab)"
      // Reports put descriptions inside clickable rows and cells.
      onClick={(event) => event.stopPropagation()}
      className="text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid print:text-current print:no-underline"
    >
      {children}
    </a>
  );
}

/**
 * A report's NETA Section cell ("7.1.1.A.9", "7.22.3.A.8.1") as a link to
 * that section, scrolled to part A, step 9 (the reader reads "#A.9").
 * Anything that doesn't look like a section reference stays plain text.
 */
export function NetaSectionLink({
  value,
  standard,
}: {
  value?: string | number | null;
  standard: string;
}) {
  const text = value == null ? "" : String(value);
  const match = /^(\d+(?:\.\d+)*)\.([A-Z])\.(\d+)(?:\.\d+)*$/.exec(text.trim());
  if (!match) return <>{text}</>;
  const [, section, part, step] = match;
  return (
    <StandardRef standard={standard} num={`${section}#${part}.${step}`}>
      {text}
    </StandardRef>
  );
}

/** Renders text with any NETA references linked. Plain text passes through. */
export function StandardRefText({ text, standard }: { text?: string | null; standard: string }) {
  if (!text) return <>{text ?? null}</>;
  const parts: React.ReactNode[] = [];
  const pattern = new RegExp(REF_PATTERN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <StandardRef key={match.index} standard={standard} num={match[1] ?? match[2]}>
        {match[0]}
      </StandardRef>,
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
