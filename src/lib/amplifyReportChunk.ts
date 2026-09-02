/**
 * Split extracted source text into pieces small enough for one model pass.
 *
 * A multi-unit export — a whole battery bank, a switchgear lineup — runs to
 * dozens of pages holding a dozen separate reports. The parser answers with
 * JSON capped at 8192 output tokens, so asking for such a document in a single
 * call truncates the response mid-object and the whole conversion fails. Cut
 * the source up first and one impossible call becomes several ordinary ones.
 *
 * Cuts land on page (or sheet) boundaries so no table is severed mid-row.
 * Where the source restarts its own page numbering per unit, that reset marks
 * the boundary and each chunk carries one unit; a unit too large for a single
 * pass is split further, with its first page repeated as context so every
 * piece still knows which unit it belongs to.
 */

/**
 * Source lines per model call.
 *
 * This, not the character count, is what governs: a page listing bare cell
 * numbers 1…120 is barely a kilobyte of input but becomes a JSON row apiece on
 * the way out. Budgeting by characters let a 4.5 kB page of cell numbers ask
 * for more output than the model can emit, while a 7 kB page of prose fit
 * easily. At roughly 35 tokens per emitted row this leaves the 8192-token
 * ceiling a wide margin.
 */
export const CHUNK_LINE_BUDGET = 130;

/** Companion cap, for a source whose lines are long rather than numerous. */
export const CHUNK_CHAR_BUDGET = 14_000;

/** One model call's worth of source text. */
export interface SourceChunk {
  text: string;
  /**
   * Which unit of the source this came from. Chunks sharing a group are one
   * unit that had to be split for size, and their reports are rejoined after
   * parsing.
   */
  group: number;
}

/** Page marker written by the PDF extractor, or the workbook's sheet header. */
const PAGE_MARKER = /^--- PAGE \d+ ---$/;
const SHEET_MARKER = /^### SHEET: /;

/** A page's own printed "page 1", ignoring the extractor's marker line. */
const RESTARTS_NUMBERING = /\bPAGE\s*(?:#\s*)?1\b(?!\d)/i;

function countLines(text: string): number {
  return text.split("\n").filter((line) => line.trim()).length;
}

/** Break the text into pages or sheets, each keeping its own marker line. */
function segment(text: string): string[] {
  const lines = text.split("\n");
  const isMarker = (line: string) =>
    PAGE_MARKER.test(line.trim()) || SHEET_MARKER.test(line);

  if (!lines.some(isMarker)) return [text];

  const segments: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (isMarker(line) && current.length > 0) {
      segments.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) segments.push(current.join("\n"));
  return segments;
}

/** Drop the leading marker so it cannot be mistaken for the page's own text. */
function body(segment: string): string {
  const newline = segment.indexOf("\n");
  const first = (newline === -1 ? segment : segment.slice(0, newline)).trim();
  if (!PAGE_MARKER.test(first) && !SHEET_MARKER.test(first)) return segment;
  return newline === -1 ? "" : segment.slice(newline + 1);
}

/**
 * Group segments into one run per unit under test.
 *
 * A report that prints its own page numbers restarts them for each unit, which
 * separates the units far more reliably than any content heuristic. The reset
 * is only trusted when the first segment shows it too and at least two units
 * were found; a lone stray "page 1" deeper in the document would otherwise cut
 * an intact report in half.
 */
function groupByUnit(segments: string[]): string[][] {
  const starts = segments.map((s) => RESTARTS_NUMBERING.test(body(s)));
  const count = starts.filter(Boolean).length;
  if (!starts[0] || count < 2) return [segments];

  const groups: string[][] = [];
  for (const [i, seg] of segments.entries()) {
    if (starts[i]) groups.push([seg]);
    else groups[groups.length - 1].push(seg);
  }
  return groups;
}

/**
 * Pack one unit's segments into as few chunks as the budgets allow.
 *
 * Every chunk after the first repeats the unit's opening page. Without it a
 * continuation is a wall of anonymous readings, and the model — asked for a
 * report per unit — names it from whatever heading it can see, leaving an
 * upload of fourteen battery strings with entries like "Battery Test 2". The
 * repeat costs a page of input and buys the identity that lets the pieces be
 * rejoined; the duplicated sections it produces are merged away afterwards.
 */
function packGroup(
  segments: string[],
  group: number,
  lineBudget: number,
  charBudget: number,
): SourceChunk[] {
  const [header, ...rest] = segments;
  const chunks: SourceChunk[] = [];

  let current: string[] = [header];
  let lines = countLines(header);
  let chars = header.length;

  const flush = () => {
    chunks.push({ text: current.join("\n"), group });
    // The header is context for the continuation, not part of its budget: it
    // has already been charged to the first chunk.
    current = [header];
    lines = 0;
    chars = 0;
  };

  for (const seg of rest) {
    // A single oversized segment still goes out on its own: splitting inside a
    // page would strand a table's rows from their headings.
    if (
      current.length > 1 &&
      (lines + countLines(seg) > lineBudget || chars + seg.length > charBudget)
    ) {
      flush();
    }
    current.push(seg);
    lines += countLines(seg);
    chars += seg.length + 1;
  }

  chunks.push({ text: current.join("\n"), group });
  return chunks;
}

/**
 * Split source text into chunks, in document order.
 *
 * Text that already fits the budgets comes back as a single chunk, so the
 * ordinary one-report conversion is unchanged.
 */
export function splitSourceIntoChunks(
  text: string,
  lineBudget = CHUNK_LINE_BUDGET,
  charBudget = CHUNK_CHAR_BUDGET,
): SourceChunk[] {
  if (countLines(text) <= lineBudget && text.length <= charBudget) {
    return [{ text, group: 0 }];
  }

  return groupByUnit(segment(text)).flatMap((segments, group) =>
    packGroup(segments, group, lineBudget, charBudget),
  );
}
