#!/usr/bin/env python3
"""
Parse a scanned NFPA book (two-column pages, e.g. NFPA 70B-2023) into
docs-style markdown pages and write a SQL seed for common.standard_sections
(see database/migrations/standard_sections.sql). One page per chapter; tables
sit inline where the book prints them; Annex A explanatory notes are attached
under the section they explain (the "*" after a section number).

Prepare the OCR first (tesseract reads the scan far better than the PDF's own
text layer, which drops digits like the "1" in "Type 1"):
  pdfimages -j book.pdf img/pg                     # one JPEG per page
  tesseract img/pg-000.jpg ocr/pg-000 --psm 3 tsv  # for every page

Usage:
  python3 -I scripts/standards/parse_nfpa_ocr.py <ocr-dir> <slug> <out.sql>
      [--label "NFPA 70B-2023"] [--overrides fixes.md] [--report]
  python3 -I scripts/standards/parse_nfpa_ocr.py <ocr-dir> --page N
      (debug: print PDF page N in reading order)

  --overrides  markdown file of hand-fixed tables: "@@ Table 9.2.2" lines,
               each followed by the table's markdown. Those replace the
               automatic conversion.

The OCR files and the OUTPUT hold copyrighted NFPA text: keep them outside
the repo and never commit them. This script holds no standards text.

Needs tesseract (brew install tesseract) and poppler. Python stdlib only.
"""
import argparse
import difflib
import os
import re
import statistics
import sys

# ------------------------------------------------------------ OCR pages ---


class Line:
    __slots__ = ("x0", "y0", "x1", "y1", "words", "col")

    def __init__(self, words):
        self.words = sorted(words, key=lambda w: w[0])
        self.x0 = min(w[0] for w in words)
        self.y0 = min(w[1] for w in words)
        self.x1 = max(w[2] for w in words)
        self.y1 = max(w[3] for w in words)
        self.col = None

    @property
    def text(self):
        return " ".join(w[4] for w in self.words)


def fix_word(t):
    """Characters tesseract reliably gets wrong in these books."""
    t = t.replace("(€)", "(C)").replace("€", "C")
    t = re.sub(r"(?<=cm)\?", "²", t)  # cal/cm?  ->  cal/cm²
    if t == "de":  # "dc" (direct current) reads as "de"
        t = "dc"
    return t


JUNK_WORD = re.compile(r"^[-—–_=~.,:;'\"`|\\/ ]+$")


def load_tsv(path):
    """-> (width, height, [Line]) with page skew removed from word y's."""
    groups = {}
    width = height = 0
    with open(path, encoding="utf-8") as f:
        next(f)
        for raw in f:
            parts = raw.rstrip("\n").split("\t")
            if len(parts) < 12:
                continue
            left, top, w, h = (int(v) for v in parts[6:10])
            if parts[0] == "1":
                width, height = w, h
                continue
            if parts[0] != "5":
                continue
            text = fix_word(parts[11].strip())
            if not text or (JUNK_WORD.match(text) and len(text) > 1):
                continue
            key = (parts[2], parts[3], parts[4])
            groups.setdefault(key, []).append([left, top, left + w, top + h, text, float(parts[10])])

    # Phone photos of a book are a little rotated: fit the slope of long lines
    # and level every word, so table values line up with their row.
    slopes = []
    for words in groups.values():
        if len(words) >= 6:
            xs = [(w[0] + w[2]) / 2 for w in words]
            ys = [w[3] for w in words]
            if max(xs) - min(xs) > width * 0.25:
                mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
                den = sum((x - mx) ** 2 for x in xs)
                if den:
                    slopes.append(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den)
    slope = statistics.median(slopes) if len(slopes) >= 3 else 0.0
    if abs(slope) > 0.15:
        slope = 0.0
    for words in groups.values():
        for w in words:
            shift = round(slope * ((w[0] + w[2]) / 2 - width / 2))
            w[1] -= shift
            w[3] -= shift
    for ws in groups.values():
        ws.sort(key=lambda w: w[0])
        for a, b in zip(ws, ws[1:]):
            if b[4] == "dc" and a[4].lower() == "rue":  # "rue de Varembé" is an address
                b[4] = "de"
    lines = [Line([tuple(w) for w in ws]) for ws in groups.values()]
    # Text showing through from the back of the page reads as low-confidence
    # nonsense ("Se NO vce td eT TASK ...").
    lines = [l for l in lines if len(l.words) < 3 or sum(w[5] for w in l.words) / len(l.words) >= 45]
    return width, height, split_wide_gaps(lines, width)


def split_wide_gaps(lines, width):
    """Tesseract sometimes runs a left-column line into the right column's
    line at the same height. Split at gaps wider than 4% of the page."""
    out = []
    gap = width * 0.04
    for line in lines:
        current = [line.words[0]]
        for prev, word in zip(line.words, line.words[1:]):
            if word[0] - prev[2] > gap:
                out.append(Line(current))
                current = []
            current.append(word)
        out.append(Line(current))
    return out


def split_at_gutter(lines, gutter):
    """A line running from the left column into the right one at the same
    height is two lines."""
    out = []
    for line in lines:
        cut = None
        for k in range(1, len(line.words)):
            a, b = line.words[k - 1], line.words[k]
            if a[2] < gutter + 12 and b[0] > gutter - 12 and b[0] - a[2] > 18:
                cut = k
                break
        if cut is None:
            out.append(line)
        else:
            out.append(Line(line.words[:cut]))
            out.append(Line(line.words[cut:]))
    return out


def column_of(line, gutter):
    """L, R or S (spans both). A revision mark (N, Δ read as A) hangs left
    of a right-column line, into the gutter: judge by the next word."""
    x0 = line.x0
    if len(line.words) > 1 and re.fullmatch(r"[NΔA4•M]", line.words[0][4]):
        x0 = line.words[1][0]
    if line.x1 <= gutter + 8:
        return "L"
    if x0 >= gutter - 8:
        return "R"
    return "S"


def find_gutter(lines, width):
    # Judge by prose lines only: a big table's short cells would otherwise
    # pull the split point into one of its column gaps.
    prose = [l for l in lines if len(l.words) >= 6 and l.x1 - l.x0 > width * 0.3]
    if len(prose) >= 8:
        lines = prose
    best, best_score = width // 2, None
    for x in range(int(width * 0.40), int(width * 0.60), 4):
        crossing = sum(1 for l in lines if l.x0 < x - 6 and l.x1 > x + 6)
        score = (crossing, abs(x - width / 2))
        if best_score is None or score < best_score:
            best, best_score = x, score
    return best


CHROME = [
    re.compile(r"\b7[0O][BE]\s*[-—–]?\s*\d+"),
    re.compile(r"ELECTRICAL EQUIP", re.I),
    re.compile(r"EQUIPMENT MAIN", re.I),
    re.compile(r"\b2023 Edition\b", re.I),
    re.compile(r"Shaded text", re.I),
    re.compile(r"Section deletions", re.I),
    re.compile(r"^ARTICLE\s+\d+\b"),            # 70E running head
    re.compile(r"Revisions\.|figure/table revisions", re.I),
    re.compile(r"^\d{2,3}\.\d{1,2}$"),                 # 70E running head "130.7"
    re.compile(r"^[A-T]\.\d{1,2}(\.\d{1,2})*$"),        # annex running head "D.4.4"
    re.compile(r"^(CHAPTER\s+\d|INFORMATIVE ANNEX\s+[A-Z])\b"),
    re.compile(r"N\s*=\s*New\.|M\s*=\s*Moved\."),
    re.compile(r"Text deletions|figure ?/ ?table|New material|70B[A-Z]\d"),
    re.compile(r"^[0-9O]{2,3}[B8]?\s*[-—–]\s*\d{1,3}$"),  # "70B-24" read as "208-24"
]


def is_chrome(line, height):
    if line.y1 < height * 0.085 or line.y0 > height * 0.90:
        t = line.text
        if any(p.search(t) for p in CHROME):
            return True
        if len(t) <= 3 or re.fullmatch(r"[A-Z ,.\-]+", t):  # running heads, specks
            return True
        if sum(x[5] for x in line.words) / len(line.words) < 50 and len(t) < 45:  # torn running head
            return True
    return False


def book_page(lines, height):
    for line in lines:
        if line.y1 < height * 0.085 or line.y0 > height * 0.93:
            m = re.search(r"7[0O][BE]\s*[-—–]?\s*(\d{1,3})\b", line.text)
            if m:
                return int(m.group(1))
    return None


CAPTION = re.compile(
    r"^(?:[NΔA4•]\s+)?Table\s+(?:Informational Note\s+)?((?:[A-Z]\.)?\d+(?:\.\d+)*(?:\([A-Za-z0-9]{1,3}\))*)(?:\s+(.*))?$"
)
# Revision marks before a section number OCR as N, W, WN, aa, "\N" ...; the
# "*" after it as a quote or degree sign.
HEADING = re.compile(
    r"^(?:[^\w(]{0,2}(?:[NΔAMWVa•]{1,2}|4(?=\s)|=)?[^\w(]{0,3}\s*)?(\d{1,2}(?:[.,]{1,2}\d+)+)([*\"”'°^%]{0,2})[_.\\]{0,2}\s+(.*)$"
)
HEADING_GLUED = re.compile(r"^N\s?(\d)(\d{1,2})((?:[.,]\d+)*)[*\"]?\s+([A-Z].*)$")  # "N71" = 7.1
FOOTNOTE = re.compile(r"^(NA:|N/A:|[*†‡'\"“”]\S|Notes?:)")


class Table:
    def __init__(self, number, title, lines, continued):
        self.number = number
        self.title = title
        self.lines = lines
        self.continued = continued


def cut_tables(lines, gutter, width):
    """Pull table regions out of a page's lines. Returns (rest, tables), with
    each table's position kept as a placeholder line in `rest`."""
    lines = sorted(lines, key=lambda l: (l.y0, l.x0))
    taken = set()
    tables = []
    for i, cap in enumerate(lines):
        if i in taken:
            continue
        m = CAPTION.match(cap.text)
        if not m:
            continue
        title = (m.group(2) or "").strip()
        # "Table 9.2.2 and" inside prose is a reference, not a caption. A bare
        # "Table 130.5(C)(3)" line is a caption whose "Continued" OCR'd apart.
        if title and not title[:1].isupper():
            continue
        if not title:
            title = "Continued"
        below = [l for l in lines if cap.y0 < l.y0 < cap.y0 + 260]
        # Wide (full-page) table: something below crosses the gutter, or the
        # caption sits alone on its row with table text in the right column.
        right_at_caption = any(l.col == "R" and l.y1 > cap.y0 - 20 and l.y0 < cap.y1 + 20 for l in lines)
        wide = (
            cap.col == "S"
            or any(l.col == "S" for l in below)
            or (cap.col == "L" and not right_at_caption and sum(1 for l in below if l.col == "R") >= 2)
        )
        if wide:
            x_lo, x_hi = 0, width
        elif cap.col == "L":
            x_lo, x_hi = 0, gutter
        else:
            x_lo, x_hi = gutter, width
        inside = [cap]
        taken.add(i)
        last_y = cap.y1
        seen_footnote = False
        pitch = 34
        for j in range(i + 1, len(lines)):
            l = lines[j]
            if j in taken or not (l.x0 >= x_lo - 10 and l.x1 <= x_hi + 10 or (wide and l.col == "S")):
                if wide and l.x0 < x_hi and l.x1 > x_lo and l.y0 > last_y + 4 * pitch:
                    break
                continue
            gap = l.y0 - last_y
            if HEADING.match(l.text) or re.match(r"^(?:[NΔ]\s+)?Chapter\s+\d+", l.text):
                if not re.match(r"^\d", l.text) or gap > pitch * 0.6:
                    break
            if CAPTION.match(l.text) and (CAPTION.match(l.text).group(2) or "X")[:1].isupper():
                break
            if gap > pitch * (4.5 if len(inside) == 1 else 2.6) or (seen_footnote and gap > pitch * 1.4 and not FOOTNOTE.match(l.text)):
                break
            # Footnotes start at the table's left edge; anything else after
            # them is the next column's prose.
            if seen_footnote and l.x0 > cap.x0 + 90:
                break
            if FOOTNOTE.match(l.text) and len(inside) > 2:
                seen_footnote = True
            inside.append(l)
            taken.add(j)
            last_y = max(last_y, l.y1)
        continued = bool(re.match(r"^Continued\b", title, re.I))
        if continued:
            title = ""
        tables.append(Table(m.group(1), title, inside[1:], continued))
        tables[-1].anchor = cap
        tables[-1].wide = wide
    rest = [l for k, l in enumerate(lines) if k not in taken]
    return rest, tables


def fit_slope(lines):
    slopes = []
    for l in lines:
        if len(l.words) >= 5 and l.x1 - l.x0 > 300:
            xs = [(w[0] + w[2]) / 2 for w in l.words]
            ys = [(w[1] + w[3]) / 2 for w in l.words]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            den = sum((x - mx) ** 2 for x in xs)
            if den:
                slopes.append(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den)
    s = statistics.median(slopes) if len(slopes) >= 3 else 0.0
    return s if abs(s) < 0.15 else 0.0


def relines(lines, col):
    """Glue line pieces that sit end to end at the same height. Tesseract
    cuts printed lines where revision shading starts or stops
    ("N 15.3 Periodic M" + "aintenance Procedures ...")."""
    pieces = sorted(lines, key=lambda l: l.x0)
    out = []
    for piece in pieces:
        first = piece.words[0]
        fy = (first[1] + first[3]) / 2
        fh = first[3] - first[1]
        best, best_d = None, None
        for cand in out:
            last = cand.words[-1]
            gap = piece.x0 - last[2]
            if not -6 <= gap <= 90:
                continue
            d = abs((last[1] + last[3]) / 2 - fy)
            if d < 0.6 * max(fh, last[3] - last[1]) and (best_d is None or d < best_d):
                best, best_d = cand, d
        if best is None:
            piece.col = col
            out.append(piece)
            continue
        words = list(best.words)
        last = list(words[-1])
        if piece.x0 - last[2] < 4 and last[4][-1:].isalpha() and first[4][:1].islower():
            last[2], last[4] = first[2], last[4] + first[4]
            words[-1] = tuple(last)
            words += piece.words[1:]
        else:
            words += piece.words
        merged = Line(words)
        merged.words = words
        merged.col = col
        out[out.index(best)] = merged
    return out


def reading_order(entries):
    """(y, x, col, item) -> items. Spanning entries split the page into
    bands; in each band the left column reads before the right one."""
    entries = sorted(entries, key=lambda e: (e[0], e[1]))
    out, band = [], []

    def flush():
        for side in ("L", "R"):
            out.extend(e[3] for e in sorted((e for e in band if e[2] == side), key=lambda e: (e[0], e[1])))
        band.clear()

    for e in entries:
        if e[2] == "S":
            flush()
            out.append(e[3])
        else:
            band.append(e)
    flush()
    return out


def order_page(path):
    width, height, lines = load_tsv(path)
    page_no = book_page(lines, height)
    lines = [l for l in lines if not is_chrome(l, height)]
    result = {"width": width, "book_page": page_no, "items": []}
    if not lines:
        return result
    gutter = find_gutter(lines, width)

    def classify(ls):
        for l in ls:
            l.col = column_of(l, gutter)
        return ls

    # Tables first, on tesseract's own lines (a wide table's rows cross the
    # gutter); then prose lines that run across the gutter are cut in two.
    rest, tables = cut_tables(classify(lines), gutter, width)
    rest = classify(split_at_gutter(rest, gutter))
    # Prose: rebuild lines per column. Tesseract splits one printed line into
    # pieces from different blocks ("N 15.3 Periodic M" + "aintenance ..."),
    # and the page bends differently in each column.
    rest = (
        relines([l for l in rest if l.col == "L"], "L")
        + relines([l for l in rest if l.col == "R"], "R")
        + [l for l in rest if l.col == "S"]
    )
    rest = drop_strays(rest)
    # Reading order: spanning rows (and wide tables) split the page into
    # bands; in each band the left column reads before the right one. A
    # column-width table sits in its column at its caption's height.
    entries = [(l.y0, l.x0, l.col, ("line", l)) for l in rest]
    for t in tables:
        entries.append((t.anchor.y0, t.anchor.x0, "S" if t.wide else t.anchor.col, ("table", t)))
    result["items"] = reading_order(entries)
    result["gutter"] = gutter
    return result


def page_path(ocr_dir, pdf_page):
    return os.path.join(ocr_dir, f"pg-{pdf_page - 1:03d}.tsv")


# ----------------------------------------------------------------- tables ---

TYPE_FIX = {"24": "2A", "ZA": "2A", "2a": "2A", "IA": "1A", "lA": "1A", "|A": "1A", "1a": "1A",
            "I": "1", "l": "1", "|": "1", "]": "1", "Z": "2", "NA.": "NA", "N/A": "NA", "Na": "NA"}
TYPE_VALUES = {"1", "1A", "2", "2A", "NA", "1 or 2", "1A or 2A", "Reserved"}


def norm_type(v):
    v = v.strip().rstrip(".")
    v = TYPE_FIX.get(v, v)
    if re.fullmatch(r"[1lI|\]H]\s*or\s*[2Z?]", v):
        return "1 or 2"
    if re.fullmatch(r"[1lI|]A\s*or\s*2A", v):
        return "1A or 2A"
    return v


def column_spans(words, min_gap=18):
    """x-intervals covered by words, merged where closer than min_gap."""
    spans = []
    for x0, x1 in sorted((w[0], w[2]) for w in words):
        if spans and x0 - spans[-1][1] < min_gap:
            spans[-1][1] = max(spans[-1][1], x1)
        else:
            spans.append([x0, x1])
    return spans


def overlap(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))


VALUE_TOKEN = re.compile(r"^(1|2|1A|2A|NA|N/A|lor2|lor\?|Hor\?|lor|or|2\.|[lI|\]]|Z|ZA|24|IA|lA|2a|Reserved)[.,]?$")


def typed_table(lines, left, first_y):
    """Equipment task tables: No. | Task | one test-type column per
    equipment kind | Notes. Test-type columns are found by clustering where
    the values (1, 2, 2A, NA, 1 or 2 ...) actually sit, so narrow columns on
    a curved photo stay apart and notes text stays out of them.
    -> (header, rows, problems) or None."""
    head_lines = [l for l in lines if l.y0 < first_y - 8]
    if not any(re.match(r"^Type", w[4]) for l in head_lines for w in l.words):
        return None
    body = [l for l in lines if l.y0 >= first_y - 8]
    num_end = left + 70
    xs = sorted(
        (w[0] + w[2]) / 2 for l in body for w in l.words
        if VALUE_TOKEN.match(w[4]) and w[0] > num_end + 200
    )
    clusters = []
    for x in xs:
        if clusters and x - clusters[-1][-1] < 45:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    rows_guess = max(2, sum(1 for l in body if l.words[0][0] < num_end and len(l.words[0][4]) <= 3))
    clusters = [c for c in clusters if len(c) >= max(2, rows_guess * 0.3)]
    if not clusters:
        return None
    bounds = [(min(c) - 30, max(c) + 30) for c in clusters]
    centres = [sum(c) / len(c) for c in clusters]
    task_end = bounds[0][0]
    notes_start = bounds[-1][1]
    has_notes = any(w[0] > notes_start for l in lines for w in l.words)

    def column(w):
        c = (w[0] + w[2]) / 2
        if w[0] < num_end and w[2] <= num_end + 12:
            return 0
        if c < task_end:
            return 1
        if c > notes_start:
            return 2 + len(centres) if has_notes else 1 + len(centres)
        for j, (lo, hi) in enumerate(bounds):
            if lo <= c <= hi:
                return 2 + j
        return 2 + min(range(len(centres)), key=lambda j: abs(c - centres[j]))

    ncol = 2 + len(centres) + (1 if has_notes else 0)
    spacing = min([b - a for a, b in zip(centres, centres[1:])] or [160])

    def head_column(w):
        # Header cells are wider than their values: nearest centre wins.
        c = (w[0] + w[2]) / 2
        if w[0] < num_end and w[2] <= num_end + 12:
            return 0
        if c < centres[0] - 0.75 * spacing:
            return 1
        if has_notes and c > centres[-1] + 0.75 * spacing:
            return ncol - 1
        return 2 + min(range(len(centres)), key=lambda j: abs(c - centres[j]))

    header = [[] for _ in range(ncol)]
    for l in head_lines:
        for w in l.words:
            header[head_column(w)].append(w)
    header = [re.sub(r"(\w)[!'’]", "\\1†", cell_join(h)) for h in header]
    header[0] = header[0] or "No."
    header[1] = header[1] or "Task"
    if has_notes:
        header[-1] = header[-1] or "Notes"

    anchors = []
    for l in sorted(body, key=lambda l: l.y0):
        w = l.words[0]
        if w[0] < num_end and len(w[4]) <= 3 and w[2] - w[0] < 60:
            if not anchors or l.y0 - anchors[-1] > 14:
                anchors.append(l.y0)
    if not anchors:
        return None
    rows = [[[] for _ in range(ncol)] for _ in anchors]
    for l in body:
        for w in l.words:
            mid = (w[1] + w[3]) / 2
            k = max((i for i, a in enumerate(anchors) if a <= mid + 8), default=0)
            rows[k][column(w)].append(w)
    problems = []
    out = []
    for k, r in enumerate(rows):
        cells = [cell_join(c) for c in r]
        if cells[0] and not re.fullmatch(r"\d{1,2}", cells[0]):
            problems.append(f"row {k + 1} number read as {cells[0]!r}")
        cells[0] = str(k + 1)
        for j in range(2, 2 + len(centres)):
            cells[j] = norm_type(cells[j])
            if cells[j] not in TYPE_VALUES and cells[j] != "":
                problems.append(f"row {k + 1} odd value {cells[j]!r}")
                cells[j] = "?"
        if all(cells[j] == "" for j in range(2, 2 + len(centres))):
            problems.append(f"row {k + 1} has no test types")
        out.append(cells)
    return header, out, problems


def text_rows(ws):
    """Words of one cell -> printed lines in reading order. Groups by height
    with a tolerance instead of fixed bands, so a slightly curved line stays
    one line."""
    ws = sorted(ws, key=lambda w: (w[1] + w[3]) / 2)
    rows = []
    for w in ws:
        c = (w[1] + w[3]) / 2
        if rows and c - rows[-1][0] < 0.6 * max(12, w[3] - w[1]):
            rows[-1][1].append(w)
        else:
            rows.append([c, [w]])
    return [sorted(r[1], key=lambda w: w[0]) for r in rows]


def cell_join(ws):
    ws = [w for row in text_rows(ws) for w in row]
    out = ""
    for w in ws:
        t = w[4]
        out = join_words(out, t) if out.endswith("-") else (out + " " + t).strip()
    return out


def table_markdown(table_lines, number):
    """Table lines (caption excluded) -> (markdown, problems)."""
    problems = []
    lines = sorted(table_lines, key=lambda l: (l.y0, l.x0))
    if not lines:
        return "", ["empty"]
    # Left edge of the grid: the leftmost x shared by several lines.
    xs = sorted(l.x0 for l in lines)
    left = xs[min(2, len(xs) - 1)]
    first_num = next((l.y0 for l in lines if re.fullmatch(r"\d{1,2}", l.words[0][4]) and l.x0 - left < 70), None)
    # Footnotes: from the first footnote-looking line, at the left edge,
    # below the first body row.
    foot_at = next(
        (k for k, l in enumerate(lines)
         if FOOTNOTE.match(l.text) and l.x0 - left < 90 and (first_num is None or l.y0 > first_num)),
        len(lines),
    )
    grid, notes = lines[:foot_at], lines[foot_at:]
    words = [w for l in grid for w in l.words]
    if not words:
        return "", ["empty"]

    # Numbered tables: a "No." column holding 1, 2, 3 ... at the far left.
    num_words = [w for w in words if re.fullmatch(r"\d{1,2}", w[4]) and w[0] - left < 70]
    numbered = len(num_words) >= 2
    if numbered:
        first_y = min(w[1] for w in num_words)
    else:
        first_y = None

    # Header = everything above the first body row. For tables without a
    # number column, the first row is the first line holding a digit or the
    # word "months"/"Reserved"/"NA" (interval tables).
    interval = any(re.search(r"months", w[4]) for l in grid for w in l.words)
    if first_y is None:
        for l in grid:
            pat = r"months|Reserved" if interval else r"\d|months|Reserved"
            if any(re.search(pat, w[4]) for w in l.words):
                first_y = l.y0
                break
    if first_y is None:
        return "", ["no body rows"]
    typed = typed_table(grid, left, first_y) if numbered else None
    if typed:
        header, table, problems = typed
        return render_table(header, table, [], notes), problems
    body_words = [w for w in words if w[1] >= first_y - 8]
    head_words = [w for w in words if w[1] < first_y - 8]

    spans = column_spans(body_words)
    # Header words that sit right of every body column (an empty "Notes"
    # column) open their own column.
    for w in head_words:
        if w[0] > spans[-1][1] + 18:
            spans.append([w[0], w[2]])
    ncol = len(spans)
    if ncol < 2:
        return "", ["one column"]

    def col_of(w, strict=False):
        best, score = None, 0
        for j, (a, b) in enumerate(spans):
            o = overlap(w[0], w[2], a, b)
            if o > score:
                best, score = j, o
        if best is None and not strict:
            c = (w[0] + w[2]) / 2
            best = min(range(ncol), key=lambda j: abs((spans[j][0] + spans[j][1]) / 2 - c))
        return best

    # Header cells; a word crossing several columns is a group caption.
    header = [""] * ncol
    group_caps = []
    for l in sorted((l for l in grid if l.y0 < first_y - 8), key=lambda l: l.y0):
        for w in l.words:
            covered = [j for j, (a, b) in enumerate(spans) if overlap(w[0], w[2], a, b) > 4]
            if len(covered) > 1 and len(w[4]) > 3:
                group_caps.append(w[4])
                continue
            j = col_of(w)
            header[j] = (header[j] + " " + w[4]).strip()

    # Row anchors.
    key_col = 0 if numbered else (1 if ncol >= 3 else 0)
    anchors = []
    for l in sorted((l for l in grid if l.y0 >= first_y - 8), key=lambda l: l.y0):
        ws0 = [w for w in l.words if col_of(w) == 0]
        wsk = [w for w in l.words if col_of(w) == key_col]
        if numbered:
            if ws0 and re.fullmatch(r"\d{1,2}", ws0[0][4]):
                anchors.append(l.y0)
        else:
            starts = [ws[0][4] for ws in (ws0, wsk) if ws]
            if any(s[:1].isupper() or s[:1].isdigit() for s in starts):
                if not anchors or l.y0 - anchors[-1] > 10:
                    anchors.append(l.y0)
    if not anchors:
        return "", ["no anchors"]

    rows = [[[] for _ in range(ncol)] for _ in anchors]
    for w in body_words:
        mid = (w[1] + w[3]) / 2
        # Top-aligned cells: the last anchor at or above the word (with a
        # little slack for leftover skew).
        k = max((i for i, a in enumerate(anchors) if a <= mid + 6), default=0)
        rows[k][col_of(w)].append(w)

    def cell_text(ws):
        ws = sorted(ws, key=lambda w: (round(w[1] / 14), w[0]))
        out = ""
        for w in ws:
            t = w[4]
            if out.endswith("-") and t[:1].islower():
                out = out + t
            else:
                out = (out + " " + t).strip()
        return out

    table = [[cell_text(c) for c in r] for r in rows]
    if interval:
        for r in table:
            for j, c in enumerate(r):
                m = re.fullmatch(r"(?:[I|l]\s+)?(?:months\s+(\d+)|(\d+)\s+months)(?:\s+[I|l])?", c)
                if m:
                    r[j] = f"{m.group(1) or m.group(2)} months"

    # Interval tables: a lowercase cell start in the first column continues
    # the product name from the row above ("Electric vehicle / power ...").
    if not numbered:
        for k in range(1, len(table)):
            t = table[k][0]
            if t and t[:1].islower():
                for back in range(k - 1, -1, -1):
                    if table[back][0]:
                        table[back][0] += " " + t
                        break
                table[k][0] = ""

    typed = any("Type" in h for h in header)
    if typed:
        value_cols = [j for j, h in enumerate(header) if "Type" in h]
        for r in table:
            for j in value_cols:
                r[j] = norm_type(r[j])
        expect = 1
        for r in table:
            if r[0] != str(expect):
                problems.append(f"row number {r[0]!r}, expected {expect}")
                if r[0].isdigit():
                    expect = int(r[0])
            expect += 1
            for j in value_cols:
                if r[j] not in TYPE_VALUES and r[j] != "":
                    problems.append(f"row {r[0]} odd value {r[j]!r}")
            if all(r[j] == "" for j in value_cols):
                problems.append(f"row {r[0]} has no test types")

    # Only task tables (fixed 1/2/2A/NA values) can be checked by machine.
    problems.append("not machine-checked")
    return render_table(header, table, group_caps, notes), problems


def render_table(header, table, group_caps, notes):
    def esc(t):
        return t.replace("|", "/")

    md = []
    if group_caps:
        md.append(f"*{' '.join(group_caps)}*")
        md.append("")
    md.append("| " + " | ".join(esc(h) for h in header) + " |")
    md.append("| " + " | ".join("---" for _ in header) + " |")
    for r in table:
        md.append("| " + " | ".join(esc(c) for c in r) + " |")
    if notes:
        md.append("")
        text = ""
        for l in notes:
            t = l.text
            if text and FOOTNOTE.match(t):
                md.append(text)
                md.append("")
                text = t
            else:
                text = join_words(text, t)
        if text:
            md.append(text)
    return "\n".join(md).strip()


def merge_tables(tables):
    """Join 'Table X Continued' parts onto the first part."""
    out = {}
    order = []
    for t in tables:
        if t.number in out:
            out[t.number]["parts"].append(t.lines)
        else:
            out[t.number] = {"title": t.title, "parts": [t.lines]}
            order.append(t.number)
    return out, order


# ------------------------------------------------------------- text flow ---

MARKER = re.compile(r"^(?:[NΔ•]{1,2}|A|4)[_.,'’]?\s+(?=(?:\d{1,2}\.\d|Table\b|Chapter\b|[A-M]\.\d|\(\d))")
CHAPTER = re.compile(r"^(?:[NΔ][_.,]?\s+)?Chapter\s+(\d{1,2})\s+(.*)$")
ANNEX = re.compile(r"^(?:[NΔ]\s+)?Annex\s+([A-M])[_.]?\s+(.*)$")
ANNEX_ENTRY = re.compile(r"^[^\w(]{0,2}(?:[NΔE4]\s*)?A[.,]?\s?(\d{1,2})[.,](\d+(?:[.,]\d+)*)[_*.]{0,2}\s+(.*)$")
LIST_ITEM = re.compile(r"^\((\d{1,2}|[a-z]|[ivx]{1,4})\)\s+(.*)$")
INFO_NOTE = re.compile(r"^(?:[NΔ]\s+)?Informational Note(?: No\. ?\d+)?:\s*(.*)$", re.I)
EXCEPTION = re.compile(r"^Exception(?: No\. ?\d+)?:\s*(.*)$")


def titleish(title):
    """'Circuit Breakers, Low- and Medium-' yes; 'and Annex R.' / 'is not a part' no."""
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z-]*", title) if len(w) > 3]
    if not title[:1].isupper() or not words:
        return False
    return sum(1 for w in words if w[0].isupper()) >= 0.6 * len(words)


WORD_TAILS = {"ing", "ings", "ment", "ments", "tion", "tions", "sion", "sions", "ness", "ance", "ences", "ence",
              "ity", "ities", "ted", "ded", "tive", "tively", "ture", "tures", "cal", "cally", "ers", "ous"}
VOCAB = set()  # English words plus words the book itself repeats


def load_vocab(ocr_dir, first, last):
    """For line-end hyphens and v/y misreads. Uses the system word list when
    there is one, plus confident words that appear 3+ times in this book."""
    if os.path.exists("/usr/share/dict/words"):
        VOCAB.update(w.strip().lower() for w in open("/usr/share/dict/words", encoding="utf-8"))
    counts = {}
    for pdf in range(first, last + 1):
        path = page_path(ocr_dir, pdf)
        if not os.path.exists(path):
            continue
        for l in load_tsv(path)[2]:
            for w in l.words:
                t = w[4].strip(".,;:()[]").lower()
                if w[5] >= 90 and len(t) > 3 and re.fullmatch(r"[a-z]+", t):
                    counts[t] = counts.get(t, 0) + 1
    VOCAB.update(t for t, n in counts.items() if n >= 3)


def is_word(t):
    t = t.lower()
    if t in VOCAB:
        return True
    for suf in ("s", "es", "ed", "d", "ing", "ly", "er", "ers", "ment", "ments", "ation"):
        if t.endswith(suf) and (t[: -len(suf)] in VOCAB or t[: -len(suf)] + "e" in VOCAB):
            return True
    return t.endswith("ies") and t[:-3] + "y" in VOCAB


def fix_vy(text):
    """"yoltage" -> "voltage": swap y and v when that makes a real word."""
    def one(m):
        w = m.group(0)
        if len(w) < 4 or w.isupper() or is_word(w):
            return w
        for i, ch in enumerate(w):
            if ch in "yv":
                t = w[:i] + ("v" if ch == "y" else "y") + w[i + 1:]
                if is_word(t):
                    return t
        return w
    return re.sub(r"[A-Za-z]*[yv][A-Za-z]*", one, text)


def join_words(a, b):
    """Join a wrapped line. A hyphen at the break is dropped when the two
    halves make one word ("require-" + "ments") and kept when they are two
    words ("insulation-" + "resistance"). A period or quote read where the
    hyphen was is dropped too ("conduc." + "ted")."""
    if not a:
        return b
    if not b:
        return a
    ma, mb = re.search(r"([A-Za-z]+)([-.,;:'\"\u2018\u2019]{1,2}) ?$", a), re.match(r"[a-z]+", b)
    if ma and mb:
        left, mark, right = ma.group(1), ma.group(2), mb.group(0)
        stem = a[: ma.start(2)]
        if mark == "-":
            if b.split(" ")[0] in ("and", "or", "to", "through"):
                return a + " " + b
            if is_word(left + right) or not VOCAB:
                return stem + b
            if is_word(left) and is_word(right) and len(left) > 2 and len(right) > 2:
                return a + b
            return stem + b if not re.search(r"\d-$|[A-Z]-$", a) else a + b
        if VOCAB and not is_word(left) and is_word(left + right):
            return stem + b
    elif VOCAB and (mc := re.search(r"([A-Za-z]{2,})$", a)) and mb and not is_word(mc.group(1)) and is_word(mc.group(1) + mb.group(0)):
        return a + b  # the line-end hyphen was not read at all
    elif VOCAB and mc and mb and (mb.group(0) in WORD_TAILS or not is_word(mb.group(0))) and len(mb.group(0)) > 1 and is_word(mc.group(1) + mb.group(0)):
        return a + b  # "check" + "ing", "Require" + "ments"
    elif a.endswith("-") and b[:1].isalpha() and re.search(r"[A-Za-z]-$", a) and b[:1].isupper() and is_word(b.split(" ")[0].strip(".,")):
        return a + b
    return a + " " + b


def split_title(rest):
    """'Visual Inspections. An inspection ...' -> ('Visual Inspections', 'An inspection ...')."""
    m = re.match(r"^([A-Z](?:[^.]|\.(?=\d)){1,90}?)\.\s+(.*)$", rest)
    if m and not re.search(r"\b(shall|should|is|are|be)\b|\b(No|Vol|e\.g|et al)$", m.group(1)):
        return m.group(1), m.group(2)
    m = re.match(r"^([A-Z][^.]{1,90}?)\.$", rest)
    if m:
        return m.group(1), ""
    return None, rest


class Flow:
    """Collects paragraphs for one chapter (or Annex A)."""

    def __init__(self):
        self.paras = []  # dicts: kind, num, star, title, text

    def add(self, kind, **kw):
        self.paras.append(dict(kind=kind, **kw))

    @property
    def last(self):
        return self.paras[-1] if self.paras else None


def guess_book_page(ocr_dir, pdf):
    """Running head unreadable: count from the nearest readable page."""
    for d in (1, -1, 2, -2, 3, -3):
        path = page_path(ocr_dir, pdf + d)
        if os.path.exists(path):
            _, height, lines = load_tsv(path)
            n = book_page(lines, height)
            if n:
                return n - d
    return None


def num_key(num):
    return tuple(int(x) for x in re.findall(r"\d+", num))


def toc_titles(ocr_dir, pages):
    """Chapter titles from the contents pages: fallback when a chapter's own
    heading did not OCR."""
    out = {}
    for pdf in pages:
        path = page_path(ocr_dir, pdf)
        if not os.path.exists(path):
            continue
        for kind, item in order_page(path)["items"]:
            if kind != "line":
                continue
            m = re.match(r"^Chapter\s+(\d{1,2})\s+[—_\s]*(.*)$", item.text)
            if m:
                title = re.sub(r"\s*([._…·,-]\s*){3,}.*$|\s*7[0O][BE].*$|\s*\.$", "", m.group(2)).strip()
                if titleish(title):
                    out[m.group(1)] = title
    return out


def build(ocr_dir, first_pdf, last_pdf, report, toc_pages=(9, 10), fixes=None):
    fixes = fixes or {}
    chapters = []  # {num, title, flow, pdf_page, book_page}
    annex_a = {}  # "A.22.3.3" -> [text paragraphs]
    tables = {}  # number -> {"title", "parts": [[lines]], "chapter"}
    table_order = []
    toc = toc_titles(ocr_dir, toc_pages)
    recent = []
    mode = None  # "chapter" | "annexA" | "stop"
    current = None
    entry = None
    pending_title = None

    for pdf in range(first_pdf, last_pdf + 1):
        path = page_path(ocr_dir, pdf)
        if not os.path.exists(path) or pdf in SKIP_PAGES:
            continue
        page = order_page(path)
        # The same page photographed twice: skip the repeat.
        words = [w.lower() for kind, it in page["items"]
                 for l in ([it] if kind == "line" else it.lines) for w in l.text.split() if len(w) > 2]
        if len(words) > 40 and any(
            difflib.SequenceMatcher(None, words, prev, autojunk=False).ratio() > 0.8 for prev in recent
        ):
            report.append(f"!! pdf {pdf} repeats an earlier page: skipped")
            continue
        recent = (recent + [words])[-3:]
        if page["book_page"] is None:
            page["book_page"] = guess_book_page(ocr_dir, pdf)
        page["items"] = apply_region_fixes(page["items"], page["gutter"], fixes, pdf)
        prev_x = None
        for kind, item in page["items"]:
            if mode == "stop":
                break
            if kind == "table":
                if mode == "chapter" and current is not None:
                    if item.number in tables:
                        tables[item.number]["parts"].append(item.lines)
                    else:
                        tables[item.number] = {"title": item.title, "parts": [item.lines], "chapter": current["num"],
                                               "book_page": page["book_page"]}
                        table_order.append(item.number)
                        current["flow"].add("table", num=item.number)
                elif mode == "annexA" and entry is not None:
                    if item.number in tables:
                        tables[item.number]["parts"].append(item.lines)
                    else:
                        tables[item.number] = {"title": item.title, "parts": [item.lines], "chapter": None,
                                               "book_page": page["book_page"]}
                        table_order.append(item.number)
                        annex_a[entry].extend([f"@@TABLE {item.number}", ""])
                continue
            line = item
            text = MARKER.sub("", line.text.strip())
            if re.fullmatch(r"[NΔ•A4*]", text):
                continue
            m = ANNEX.match(text)
            if m and not titleish(m.group(2)) and not (mode == "annexA" and m.group(1) == "B" and len(text) < 60):
                m = None
            if m and mode is not None:
                if m.group(1) == "A":
                    mode, entry = "annexA", None
                    continue
                mode = "stop"
                break
            m = CHAPTER.match(text)
            if m and (not titleish(m.group(2)) or (chapters and int(m.group(1)) <= int(chapters[-1]["num"]))):
                m = None
            if m and mode != "annexA":
                mode = "chapter"
                current = {"num": m.group(1), "title": m.group(2).strip(), "flow": Flow(),
                           "pdf_page": pdf, "book_page": page["book_page"]}
                chapters.append(current)
                pending_title = current
                continue
            if mode is None:
                continue

            if mode == "annexA":
                m = ANNEX_ENTRY.match(text)
                key = None
                if m:
                    chap, rest = m.group(1), m.group(2).replace(",", ".")
                    if int(chap) > 38 and len(chap) == 2:  # "A91.1" = A.9.1.1
                        chap, rest = chap[0], chap[1] + "." + rest
                    key = "A." + chap + "." + rest
                    # Entries run in book order; a backwards number is a
                    # cross-reference at the start of a wrapped line.
                    if entry and num_key(key[2:]) < num_key(entry[2:]):
                        key = None
                if key:
                    entry = key
                    annex_a.setdefault(entry, []).append(m.group(3))
                elif entry is not None:
                    paras = annex_a[entry]
                    if text.startswith("*Figure "):
                        paras.extend([text, ""])
                    elif LIST_ITEM.match(text) or INFO_NOTE.match(text):
                        paras.append(text)
                    else:
                        paras[-1] = join_words(paras[-1], text)
                continue

            flow = current["flow"]
            # A wrapped chapter title ("Circuit Breakers, Low- and Medium-" /
            # "Voltage") continues on a centred line before the first section.
            if pending_title is current and not flow.paras and not HEADING.match(text):
                if re.search(r"[-,]$|\band$|\bof$|\bfor$", current["title"]) or (line.x0 - (prev_x or line.x0)) > 40:
                    current["title"] = join_words(current["title"], text)
                    continue
            g = HEADING_GLUED.match(line.text.strip())
            if g and g.group(1) == current["num"]:
                text = f"{g.group(1)}.{g.group(2)}{g.group(3).replace(',', '.')} {g.group(4)}"
            m = HEADING.match(text)
            # "7.2.1.1 through 7.2.1.4" wrapped mid-sentence is not a heading.
            if m and (m.group(3)[:1].islower() or re.sub(r"[.,]+", ".", m.group(1)) in current.get("seen", ())):
                m = None
            num = re.sub(r"[.,]+", ".", m.group(1)) if m else None
            if m and int(num.split(".")[0]) == int(current["num"]) + 1 and len(num.split(".")) == 2:
                # The chapter heading itself was not read (shaded "Chapter 16
                # Fuses"): its first section opens it.
                n = num.split(".")[0]
                current = {"num": n, "title": toc.get(n, f"Chapter {n}"), "flow": Flow(),
                           "pdf_page": pdf, "book_page": page["book_page"]}
                chapters.append(current)
                flow = current["flow"]
                report.append(f"!! chapter {n} heading not found; opened at {num} (pdf {pdf})")
            if m and num.split(".")[0] == current["num"]:
                title, body = split_title(m.group(3))
                current.setdefault("seen", set()).add(num)
                flow.add("section", num=num, star=bool(m.group(2)), title=title, text=body)
                prev_x = line.x0
                continue
            m = LIST_ITEM.match(text)
            if m:
                flow.add("item", label=m.group(1), text=m.group(2))
                continue
            m = INFO_NOTE.match(text)
            if m:
                flow.add("note", text=m.group(1))
                continue
            m = EXCEPTION.match(text)
            if m:
                flow.add("exception", text=text)
                continue
            last = flow.last
            if last is None or last["kind"] == "table":
                flow.add("para", text=text)
            else:
                last["text"] = join_words(last["text"], text)
            prev_x = line.x0
    return chapters, annex_a, tables, table_order


def note_text(paras, tables_md, titles):
    out = []
    for p in paras:
        if p.startswith("@@TABLE "):
            # A callout can't sit inside the note's callout: warnings become
            # plain italics here.
            md = tables_md.get(p[8:], "")
            md = re.sub(r"::: warning\n(.*?)\n:::", lambda m: f"*{m.group(1)}*", md, flags=re.S)
            out.append(f"**Table {p[8:]} {titles.get(p[8:], '')}**".replace(" **", "**"))
            out.append(md)
        elif LIST_ITEM.match(p):
            out.append(f"- {p}")
        else:
            out.append(p)
    return "\n\n".join(x for x in out if x)


def chapter_markdown(ch, annex_a, tables_md, table_titles):
    # Each Annex A note goes under its section; a note whose section number
    # did not OCR goes under the nearest section before it.
    sections = [p["num"] for p in ch["flow"].paras if p["kind"] == "section"]
    host = {}
    for key in annex_a:
        num = key[2:]
        if num.split(".")[0] != ch["num"]:
            continue
        if num in sections:
            host.setdefault(num, []).append(key)
            continue
        before = [n for n in sections if num_key(n) <= num_key(num)]
        if before:
            host.setdefault(max(before, key=num_key), []).append(key)
    for p in ch["flow"].paras:
        if p["kind"] == "section" and not p["title"]:  # title wrapped onto the next line
            title, text = split_title(p["text"])
            if title and titleish(title):
                p["title"], p["text"] = title, text
    blocks = []
    pending_note = None
    used_notes = set()
    item_run = []

    def flush_items():
        if item_run:
            blocks.append("\n".join(f"- ({lab}) {t}" for lab, t in item_run))
            item_run.clear()

    def flush_note():
        nonlocal pending_note
        flush_items()
        for key in host.get(pending_note, []) if pending_note else []:
            body = note_text(annex_a[key], tables_md, table_titles)
            blocks.append(f"::: note\n**{key}** {body}\n:::")
        pending_note = None

    for p in ch["flow"].paras:
        k = p["kind"]
        if k == "item":
            item_run.append((p["label"], p["text"]))
            continue
        if k == "section":
            flush_note()
            num, title, text = p["num"], p["title"], p["text"]
            depth = num.count(".")
            star = "*" if p["star"] else ""
            if depth == 1:
                blocks.append(f"## {num}{star} {title or ''}".rstrip())
                if text:
                    blocks.append(text)
            elif title:
                blocks.append(f"**{num}{star} {title}.** {text}".rstrip())
            else:
                blocks.append(f"**{num}{star}** {text}".rstrip())
            if num in host and num not in used_notes:
                used_notes.add(num)
                pending_note = num
            continue
        flush_items()
        if k == "table":
            n = p["num"]
            blocks.append(f"### Table {n} {table_titles.get(n, '')}".rstrip())
            blocks.append(tables_md.get(n, "*Table not converted.*"))
        elif k == "note":
            blocks.append(f"::: note\n**Informational Note:** {p['text']}\n:::")
        elif k == "exception":
            blocks.append(f"*{p['text']}*")
        else:
            blocks.append(p["text"])
    flush_note()
    return "\n\n".join(b for b in blocks if b.strip())


# ------------------------------------------------- article books (70E) ---
# NFPA 70E: Articles (90, 100, 105 ... 390) grouped in Chapters 1-3, then
# Informative Annexes A-T. One page per Article and per Annex. Inside an
# Article: "130.7 Title." sections, then (A) / (1) / (a) / a. subdivisions,
# Informational Notes and Exceptions inline.

ART_HEAD = re.compile(r"^(?:[NΔAM•]\s+)?ARTICLE\s+(\d{2,3})\b\s*$")
CHAP_HEAD = re.compile(r"^(?:[NΔAM]\s+)?Chapter\s+([1-9])\s+([A-Z].*)$")
ANNEX_HEAD = re.compile(r"^(?:[NΔAM]\s+)?Informative Annex\s+([A-T])(?![A-Za-z])[_:.\s]*(.*)$")
ANNEX_BOILERPLATE = re.compile(r"^This informative annex (is|ts|1s) not a part", re.I)
ART_SEC = re.compile(r"^(?:[NΔAM4•]\s*)?(\d{2,3})[.,](\d{1,2})\s+(.*)$")
ANNEX_SEC = re.compile(r"^(?:[^\w(]{0,2}[NΔAM4•]?[^\w(]{0,2}\s*)?([A-T])\.(\d{1,2}(?:\.\d{1,2})*)\s+(.*)$")
SUB = re.compile(r"^(?:[NΔAM4•&]{1,2}\s*)?\(([A-Z]|\d{1,2}|[a-z])\)\s+(.*)$")
LETTER_ITEM = re.compile(r"^([a-z])\.\s+(.*)$")
NOTE_70E = re.compile(r"^(?:[NΔAM]\s+)?(Informational Note(?: (?:No\.\s?)?\d+)?(?: to [^:]{1,30})?):\s*(.*)$", re.I)
EXC_70E = re.compile(r"^(?:[NΔAM]\s+)?(Exception(?: No\.\s?\d+)?(?: to [^:]{1,20})?):\s*(.*)$")


def column_pitch(lines):
    """Median distance between consecutive line tops in one column."""
    ys = sorted(l.y0 for l in lines)
    diffs = [b - a for a, b in zip(ys, ys[1:]) if 10 < b - a < 120]
    return statistics.median(diffs) if diffs else 42


def annex_titles(ocr_dir, pages):
    """Annex titles from the contents page (some annex headings OCR badly).
    Wrapped titles continue on the next line."""
    out = {}
    for pdf in pages:
        path = page_path(ocr_dir, pdf)
        if not os.path.exists(path):
            continue
        lines = [it for kind, it in order_page(path)["items"] if kind == "line"]
        for i, l in enumerate(lines):
            m = re.match(r"^Informative Annex\s+([A-T])[:;]+\s*(.*)$", l.text)
            if not m:
                continue
            title = m.group(2)
            done = bool(re.search(r"\.{3,}|70E", title))
            if not done and i + 1 < len(lines) and not lines[i + 1].text.startswith("Informative Annex"):
                title = join_words(title, lines[i + 1].text)
            title = re.sub(r"\s*[.:;,…·+]{3,}.*$|\s*70E.*$", "", title).strip(" .;:")
            if title and not re.search(r"\d$", title):  # "... and Risk 76": wrapped badly
                out[m.group(1)] = title
    return out


def norm_words(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


FIGURE_BOXES = []  # filled by load_overrides
SKIP_PAGES = set()  # --skip-pages
SEQ_REPORT = []  # renumbered list items, for the report
REPLACEMENTS = []  # filled by load_overrides
TEXT_BOXES = []  # (pdf, col, y0, y1, [lines]); filled by load_overrides
PLACES = {}  # table number -> (pdf, y0, y1, col); filled by load_overrides

FIGURE_CAP = re.compile(r"^\W{0,2}(?:[NΔA]\s+)?FIGURE\s+([A-Z]?\.?\d[\w.()]*)\s*(.*)$")


def drop_figures(items, gutter, width, book_page, report, pdf):
    """Text OCR'd out of a figure (flowcharts, sample forms) is noise. Walk
    up from each "FIGURE X.Y" caption and drop lines until two full-width
    prose lines in a row; leave a pointer to the book page instead."""
    lines = [it for kind, it in items if kind == "line"]
    caps = [l for l in lines if FIGURE_CAP.match(l.text)]
    if not caps:
        return items
    margins = {}
    for c in ("L", "R"):
        xs = sorted(l.x0 for l in lines if l.col == c)
        ends = sorted(l.x1 for l in lines if l.col == c)
        if xs:
            margins[c] = (xs[len(xs) // 10], ends[len(ends) * 9 // 10])
    drop = set()
    pointer = {}
    for cap in caps:
        m = FIGURE_CAP.match(cap.text)
        wide = cap.col == "S"
        cols = ("L", "R", "S") if wide else (cap.col,)
        above = sorted((l for l in lines if l.col in cols and l.y0 < cap.y0 and id(l) not in drop),
                       key=lambda l: -l.y0)
        streak = 0
        taken = []
        for l in above:
            lo, hi = margins.get(l.col, (0, width))
            prose = l.col != "S" and l.x0 - lo < 30 and hi - l.x1 < 40 and len(l.text) > 35
            if prose:
                streak += 1
                if streak >= 2:
                    break
                taken.append(l)
                continue
            streak = 0
            taken.append(l)
        # The prose line counted in a broken streak stays with the figure only
        # if a figure line came after it.
        while taken and (lambda l: l.col != "S" and len(l.text) > 35)(taken[-1]):
            taken.pop()
        for l in taken:
            drop.add(id(l))
        drop.add(id(cap))
        title = re.sub(r"\.$", "", m.group(2)).strip()
        pointer[id(cap)] = f"*Figure {m.group(1).rstrip('.')}{': ' + title if title else ''} (not reproduced; see book page {book_page}).*"
        report.append(f"   figure {m.group(1)} pdf {pdf}: dropped {len(taken)} lines")
    out = []
    for kind, it in items:
        if kind == "line" and id(it) in drop:
            if id(it) in pointer:
                out.append(("figure", pointer[id(it)]))
            continue
        out.append((kind, it))
    return out


def apply_text_boxes(items, gutter, pdf):
    boxes = [b for b in TEXT_BOXES if b[0] == pdf]
    if not boxes:
        return items
    entries = []
    for kind, it in items:
        if kind == "line":
            if any(b[2] <= it.y0 <= b[3] and it.col in (b[1], "S") for b in boxes):
                continue
            entries.append((it.y0, it.x0, it.col, ("line", it)))
        else:
            entries.append((it.anchor.y0, it.anchor.x0, "S" if it.wide else it.anchor.col, ("table", it)))
    for _, col, y0, y1, typed in boxes:
        xs = sorted(it.x0 for kind, it in items if kind == "line" and it.col == col)
        x = xs[len(xs) // 10] if xs else (0 if col == "L" else gutter)
        step = min(40, (y1 - y0) / max(1, len(typed)))
        for i, t in enumerate(typed):
            y = int(y0 + i * step)
            words, wx = [], x
            for w in t.split():
                words.append((wx, y, wx + 8 * len(w), y + 28, w, 99.0))
                wx += 8 * len(w) + 8
            line = Line(words)
            line.col = col
            entries.append((y, x, col, ("line", line)))
    return reading_order(entries)


STRAY = re.compile(r"[^A-Za-z0-9(]{1,4}|[a-z]|[ij] [ij]")


def drop_strays(lines):
    """Specks that OCR'd as a lone mark or letter inside a paragraph."""
    left = {}
    for l in lines:
        left[l.col] = min(left.get(l.col, l.x0), l.x0)
    return [l for l in lines if not (STRAY.fullmatch(l.text.strip()) and l.x0 - left[l.col] > 120)]


def apply_region_fixes(items, gutter, fixes, pdf=None):
    """Override "until Y" / "column L|R": the table is the lines from its
    caption down to page height Y (in that column, if given). Lines the
    detector took beyond that go back to the prose; prose lines inside it
    join the table. Then the page's reading order is rebuilt."""
    items = apply_text_boxes(items, gutter, pdf)
    # "place PDF Y0 Y1 COL": a table whose caption the scanner never read.
    for num, (pp, y0, y1, pcol) in ((n, pl) for n, pl in PLACES.items() if pl[0] == pdf):
        def in_box(x0, x1, y):
            return y0 <= y <= y1 and (pcol == "S" or (pcol == "L" and x1 <= gutter + 8) or (pcol == "R" and x0 >= gutter - 8))
        kept = []
        for kind, it in items:
            if kind == "line" and in_box(it.x0, it.x1, it.y0):
                continue
            if kind == "table" and y0 <= it.anchor.y0 <= y1:
                continue
            kept.append((kind, it))
        t = Table(num, "", [], False)
        t.anchor = Line([(0, y0, 10, y0 + 10, "Table", 99.0)])
        t.anchor.col = pcol
        t.wide = pcol == "S"
        entries = []
        for kind, it in kept + [("table", t)]:
            if kind == "line":
                entries.append((it.y0, it.x0, it.col, ("line", it)))
            else:
                entries.append((it.anchor.y0, it.anchor.x0, "S" if it.wide else it.anchor.col, ("table", it)))
        items = reading_order(entries)

    def fix_for(num):
        f = fixes.get(num)
        if not f:
            return None
        cut_y, col, pages = f
        cut_y = pages.get(pdf, cut_y)
        return (cut_y, col) if (cut_y is not None or col) else None

    targets = [it for kind, it in items if kind == "table" and fix_for(it.number)]
    if not targets:
        return items
    pool = [it for kind, it in items if kind == "line"]
    for t in targets:
        pool.extend(t.lines)
    g = gutter
    taken = set()
    for t in targets:
        cut_y, col = fix_for(t.number)
        if col == "S":
            t.wide = True
            col = None
        elif col:
            t.wide = False
            t.anchor.col = col

        def inside(l, t=t, cut_y=cut_y, col=col):
            if l.y0 <= t.anchor.y0 + 2 or (cut_y is not None and l.y0 > cut_y):
                return False
            if col == "L":
                return l.x1 <= g + 8
            if col == "R":
                return l.x0 >= g - 8
            return t.wide or (t.anchor.col == "L" and l.x1 <= g + 8) or (t.anchor.col == "R" and l.x0 >= g - 8)

        if cut_y is None:
            # Column fix only: keep the detected extent, drop the other column.
            bottom = max([l.y0 for l in t.lines] or [t.anchor.y0])
            inside_c = inside
            inside = lambda l, f=inside_c, b=bottom: f(l) and l.y0 <= b
        t.lines = [l for l in pool if id(l) not in taken and inside(l)]
        taken.update(id(l) for l in t.lines)
    rest = [l for l in pool if id(l) not in taken]
    rest = split_at_gutter(rest, g)
    for l in rest:
        l.col = column_of(l, g)
    entries = [(l.y0, l.x0, l.col, ("line", l)) for l in rest]
    for kind, it in items:
        if kind == "table":
            entries.append((it.anchor.y0, it.anchor.x0, "S" if it.wide else it.anchor.col, ("table", it)))
    return reading_order(entries)


def build_articles(ocr_dir, first_pdf, last_pdf, report, toc_pages=(5, 6), absorb=None, until=None):
    absorb = absorb or {}
    until = until or {}
    units = []  # {num, title, group, blocks, pdf_page, book_page}
    tables = {}
    order = []
    group = "Introduction"
    unit = None
    title_open = False
    toc = annex_titles(ocr_dir, toc_pages)
    recent = []
    for pdf in range(first_pdf, last_pdf + 1):
        path = page_path(ocr_dir, pdf)
        if not os.path.exists(path) or pdf in SKIP_PAGES:
            continue
        page = order_page(path)
        words = [w.lower() for kind, it in page["items"]
                 for l in ([it] if kind == "line" else it.lines) for w in l.text.split() if len(w) > 2]
        if len(words) > 40 and any(
            difflib.SequenceMatcher(None, words, prev, autojunk=False).ratio() > 0.8 for prev in recent
        ):
            report.append(f"!! pdf {pdf} repeats an earlier page: skipped")
            continue
        recent = (recent + [words])[-3:]
        if page["book_page"] is None:
            page["book_page"] = guess_book_page(ocr_dir, pdf)
        page_lines = [it for kind, it in page["items"] if kind == "line"]
        pitch = {c: column_pitch([l for l in page_lines if l.col == c]) for c in ("L", "R", "S")}
        margin = {}
        for c in ("L", "R"):
            xs = sorted(l.x0 for l in page_lines if l.col == c)
            margin[c] = xs[len(xs) // 10] if xs else 0
        prev = None
        skip = 0
        items = list(page["items"])
        # "until Y": the table ends at page height Y; lines below it that the
        # detector took go back to the prose, left column then right.
        items = apply_region_fixes(items, page["gutter"], until, pdf)
        items = drop_figures(items, page["gutter"], page["width"], page["book_page"], report, pdf)
        for bp, bcol, by0, by1 in FIGURE_BOXES:
            if bp == pdf:
                g = page["gutter"]
                items = [
                    (kind, it) for kind, it in items
                    if not (kind == "line" and by0 <= it.y0 <= by1
                            and (bcol == "S" or (bcol == "L" and it.x1 <= g + 8) or (bcol == "R" and it.x0 >= g - 8)))
                ]
        for kind, item in items:
            if kind == "figure":
                if unit is not None:
                    unit["blocks"].append({"kind": "para", "text": item})
                prev = None
                continue
            if kind == "line" and skip:
                skip -= 1
                continue
            if kind == "table":
                skip = absorb.get(item.number, 0) if item.number not in tables else 0
                if unit is None:
                    continue
                if item.number in tables:
                    tables[item.number]["parts"].append(item.lines)
                else:
                    tables[item.number] = {"title": item.title, "parts": [item.lines], "book_page": page["book_page"]}
                    order.append(item.number)
                    unit["blocks"].append({"kind": "table", "num": item.number})
                prev = None
                continue
            line = item
            text = line.text.strip()
            text = re.sub(r"\s*Shaded = Revisions[.,]?(.*?Moved\.)?", "", text).strip()
            if not text:
                continue
            # "130.7(C) (7) (a)" -> "130.7(C)(7)(a)"
            while True:
                joined = re.sub(r"(\d\.\d+(?:\([A-Za-z0-9]{1,3}\))+)\s+(?=\([A-Za-z0-9]{1,3}\))", r"\1", text)
                if joined == text:
                    break
                text = joined
            gap_break = (
                prev is not None and prev.col == line.col
                and line.y0 - prev.y0 > 1.4 * pitch.get(line.col, 42)
            )
            prev = line
            if re.fullmatch(r"[NΔAM•*]", text):
                continue
            m = CHAP_HEAD.match(text)
            if m and titleish(m.group(2)) and (unit is None or unit["num"].isdigit()):
                group = f"Chapter {m.group(1)} {m.group(2).strip()}"
                continue
            m = ART_HEAD.match(text)
            if m:
                unit = {"num": m.group(1), "title": "", "group": group if m.group(1) != "90" else "Introduction",
                        "blocks": [], "pdf_page": pdf, "book_page": page["book_page"]}
                units.append(unit)
                title_open = True
                continue
            m = ANNEX_HEAD.match(text)
            if m and unit is not None:
                unit = {"num": m.group(1), "title": toc.get(m.group(1)) or m.group(2).strip(" _:"),
                        "toc_title": bool(toc.get(m.group(1))), "group": "Informative Annexes",
                        "blocks": [], "pdf_page": pdf, "book_page": page["book_page"]}
                units.append(unit)
                title_open = True
                continue
            if unit is None:
                continue
            if ANNEX_BOILERPLATE.match(text):
                # Sometimes OCR'd onto one line with the right column's start.
                rest = re.split(r"\bof this NFPA\s*", text, maxsplit=1)
                if len(rest) < 2 or not rest[1].strip():
                    continue
                text = re.sub(r"^([A-T])-(\d)", r"\1.\2", rest[1].strip())
            # The boilerplate's second line.
            text = re.sub(r"(document\s+)?(but\s+)?is included for informational purposes only\.?\s*", "", text).strip()
            if not text:
                continue
            blocks = unit["blocks"]
            if text.startswith("¶ "):
                blocks.append({"kind": "para", "text": text[2:]})
                title_open = False
                continue
            # Title lines: centred under the heading, before any content.
            if title_open and not blocks and unit.get("toc_title"):
                # Title known from the contents: swallow its printed lines.
                if text and norm_words(text) in norm_words(unit["title"]):
                    continue
                title_open = False
            if title_open and not blocks:
                centred = line.col in margin and line.x0 - margin[line.col] > 40
                if not unit["title"] or centred or re.search(r"[-,]$|\b(and|for|of|the|to)$", unit["title"]):
                    if not (ART_SEC.match(text) or ANNEX_SEC.match(text) or SUB.match(text)
                            or NOTE_70E.match(text)) and len(text) < 80:
                        unit["title"] = join_words(unit["title"], text)
                        continue
            title_open = False

            if unit["num"].isdigit():
                m = ART_SEC.match(text)
                if m and m.group(1) == unit["num"]:
                    title, body = split_title(m.group(3))
                    blocks.append({"kind": "sec", "num": f"{m.group(1)}.{m.group(2)}", "title": title, "text": body})
                    continue
            else:
                if unit["num"] == "O":  # "O.1" reads as "0.1"
                    text = re.sub(r"^(\W{0,2}[NΔAM]?\s?)[0OQ][.,](?=\d{1,2}(?:\.\d+)*\s+[A-Z])", r"\1O.", text)
                m = ANNEX_SEC.match(text)
                if m and m.group(1) == unit["num"]:
                    title, body = split_title(m.group(3))
                    blocks.append({"kind": "sec", "num": f"{m.group(1)}.{m.group(2)}", "title": title, "text": body})
                    continue
            m = NOTE_70E.match(text)
            if m:
                blocks.append({"kind": "note", "label": m.group(1), "text": m.group(2)})
                continue
            m = EXC_70E.match(text)
            if m:
                blocks.append({"kind": "exc", "label": m.group(1), "text": m.group(2)})
                continue
            m = SUB.match(text)
            # "(2) and to prevent ..." wrapped mid-sentence is not a new item.
            if m and (m.group(2)[:1].isupper() or m.group(2)[:1].isdigit() or m.group(2)[:1] in "“\"‘'"):
                label = m.group(1)
                title, body = split_title(m.group(2))
                if title and not titleish(title):
                    title, body = None, m.group(2)
                kind = "sub" if (label.isupper() or title) else "item"
                blocks.append({"kind": kind, "label": label, "title": title, "text": body})
                continue
            m = LETTER_ITEM.match(text)
            if m and m.group(2)[:1].isupper() and blocks and blocks[-1]["kind"] in ("item", "subitem"):
                blocks.append({"kind": "subitem", "label": m.group(1), "text": m.group(2)})
                continue
            last = blocks[-1] if blocks else None
            new_para = last is None or last["kind"] == "table" or (
                gap_break and last["kind"] not in ("item", "subitem")
            )
            if new_para:
                m = re.match(r"^([A-Z][^.]{0,70}?)\.\s+(.*)$", text) if unit["num"] == "100" else None
                if m and not re.search(r"\b(shall|is|are)\b", m.group(1)):
                    blocks.append({"kind": "def", "term": m.group(1), "text": m.group(2)})
                else:
                    blocks.append({"kind": "para", "text": text})
            else:
                last["text"] = join_words(last.get("text", ""), text)
    return units, tables, order


def fix_sequences(blocks, where, report):
    """(5) read as (9), (2) or (3) read as (8): put a numbered run back in
    order when its neighbours say what the number must be."""
    runs = {"item": [], "sub": []}
    for b in blocks + [{"kind": "sec"}]:
        k = b["kind"]
        if k in ("sec", "table") or (k == "sub" and not b["label"].isdigit()):
            for kind in runs:
                close_run(runs[kind], where, report)
                runs[kind] = []
            continue
        if k == "sub" and b["label"].isdigit():
            close_run(runs["item"], where, report)
            runs["item"] = []
            runs["sub"].append(b)
        elif k == "item" and b["label"].isdigit():
            if int(b["label"]) == 1 and runs["item"]:
                close_run(runs["item"], where, report)
                runs["item"] = []
            runs["item"].append(b)
        elif k == "item":  # (a) (b): a new level
            close_run(runs["item"], where, report)
            runs["item"] = []


def close_run(run, where, report):
    # Only with both neighbours agreeing: a lone jump (4) -> (8) can be real
    # (the list was interrupted by exceptions), as in 120.6.
    for i, b in enumerate(run):
        n, want = int(b["label"]), i + 1
        if n == want:
            continue
        nxt = int(run[i + 1]["label"]) if i + 1 < len(run) else None
        prev_ok = i == 0 or int(run[i - 1]["label"]) == want - 1
        if prev_ok and nxt == want + 1:
            report.append(f"   renumbered {where}: ({n}) -> ({want}) {b['text'][:40] or b.get('title')}")
            b["label"] = str(want)


def article_markdown(unit, tables_md, titles):
    for b in unit["blocks"]:
        # A heading whose title wrapped onto the next line.
        if b["kind"] in ("sec", "sub", "item") and not b.get("title") and b["text"]:
            title, text = split_title(b["text"])
            if title and titleish(title) and (b["kind"] != "item" or b["label"].isdigit()):
                b["title"], b["text"] = title, text
                if b["kind"] == "item":
                    b["kind"] = "sub"
        elif b["kind"] == "item" and b["label"].isdigit():
            # "(1) 120-Volt Cord Circuits. Cord sets ..."
            m = re.match(r"^(\d[^.]{3,60})\.\s+([A-Z].*)$", b["text"])
            if m and titleish("X" + m.group(1)):
                b["title"], b["text"], b["kind"] = m.group(1), m.group(2), "sub"
    fix_sequences(unit["blocks"], unit["num"], SEQ_REPORT)
    out = []
    items = []

    def flush():
        if items:
            out.append("\n".join(items))
            items.clear()

    for b in unit["blocks"]:
        k = b["kind"]
        if k == "item":
            items.append(f"- ({b['label']}) {b['text']}".rstrip())
            continue
        if k == "subitem":
            prefix = "  - " if items else "- "
            items.append(f"{prefix}{b['label']}. {b['text']}".rstrip())
            continue
        flush()
        if k == "sec":
            depth = b["num"].count(".")
            if depth == 1:
                out.append(f"## {b['num']} {b['title'] or ''}".rstrip())
                if b["text"]:
                    out.append(b["text"])
            elif b["title"]:
                out.append(f"**{b['num']} {b['title']}.** {b['text']}".rstrip())
            else:
                out.append(f"**{b['num']}** {b['text']}".rstrip())
        elif k == "sub":
            if b["title"]:
                out.append(f"**({b['label']}) {b['title']}.** {b['text']}".rstrip())
            else:
                out.append(f"**({b['label']})** {b['text']}".rstrip())
        elif k == "note":
            out.append(f"::: note\n**{b['label']}:** {b['text']}\n:::")
        elif k == "exc":
            out.append(f"*{b['label']}:* {b['text']}")
        elif k == "def":
            out.append(f"**{b['term']}.** {b['text']}")
        elif k == "table":
            n = b["num"]
            out.append(f"### Table {n} {titles.get(n, '')}".rstrip())
            out.append(tables_md.get(n, "*Table not converted.*"))
        else:
            out.append(b["text"])
    flush()
    return "\n\n".join(x for x in out if x.strip())


# ----------------------------------------------------------------- output ---

def load_overrides(path):
    """Hand fixes, checked against the photos:
      @@ Table 15.3.5          patches for one table:
      cell 3 5 = 2             body row 3, column 5 (1-based)
      header = No. | Task | ... whole header row
      drop 7                   remove body row 7
      verified                 checked against the book: no warning
      @@@ Table 12.3.5         whole table: the markdown that follows
    -> {number: {"cells": [...], "header": str|None, "drop": [...],
                 "verified": bool, "markdown": str|None}}"""
    if not path:
        return {}
    out = {}
    cur = None
    for raw in open(path, encoding="utf-8").read().split("\n"):
        # "@@ figure 89 S 800 3050": drop OCR text inside that box of PDF
        # page 89 (column L, R or S = all), e.g. sample forms and flowcharts.
        # "@@ lines 89 R 1090 1280" + typed lines: what the book prints in
        # that box, where the scan is unreadable (page curl, a figure).
        m = re.match(r"^@@ lines (\d+) ([LR]) (\d+) (\d+)\s*$", raw)
        if m:
            TEXT_BOXES.append((int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4)), []))
            cur = "lines"
            continue
        if cur == "lines" and not raw.startswith("@@"):
            if raw.strip() and not raw.startswith("#"):
                TEXT_BOXES[-1][4].append(raw.strip())
            continue
        # "@@ replace tesung => testing": fix a scanner typo everywhere.
        m = re.match(r"^@@ replace (.+?) => (.*)$", raw)
        if m:
            REPLACEMENTS.append((m.group(1), m.group(2)))
            cur = None
            continue
        m = re.match(r"^@@ figure (\d+) ([LRS]) (\d+) (\d+)\s*$", raw)
        if m:
            FIGURE_BOXES.append((int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4))))
            cur = None
            continue
        m = re.match(r"^(@@@?) Table (\S+)\s*$", raw)
        if m:
            cur = out.setdefault(m.group(2), {"cells": [], "header": None, "drop": [], "verified": False, "markdown": None})
            if m.group(1) == "@@@":
                cur["markdown"] = ""
                cur["verified"] = True
            continue
        if cur is None:
            continue
        if cur["markdown"] is not None:
            cur["markdown"] += raw + "\n"
            continue
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line == "verified":
            cur["verified"] = True
        elif m := re.match(r"^until (\d+)(?: page (\d+))?$", line):
            if m.group(2):
                cur.setdefault("until_pages", {})[int(m.group(2))] = int(m.group(1))
            else:
                cur["until"] = int(m.group(1))
        elif m := re.match(r"^column ([LRS])$", line):
            cur["column"] = m.group(1)
        elif m := re.match(r"^cell (\d+) (\d+) = (.*)$", line):
            cur["cells"].append((int(m.group(1)), int(m.group(2)), m.group(3).strip()))
        elif m := re.match(r"^header = (.*)$", line):
            cur["header"] = m.group(1).strip()
        elif m := re.match(r"^drop (\d+)$", line):
            cur["drop"].append(int(m.group(1)))
        else:
            sys.exit(f"overrides: can't read {raw!r}")
    for num, v in out.items():
        v["absorb"] = 0
        v.setdefault("until", None)
        v.setdefault("column", None)
        if v["markdown"] is not None:
            v["markdown"] = v["markdown"].strip()
            # "absorb N" / "absorb rest" on the first line: the table's notes
            # were typed into the override, so drop that many prose lines
            # that follow the table on its page.
            # "title ..." line: the full caption when it wraps in the book.
            v["title"] = None
            while True:
                m = re.match(r"^absorb (\d+|rest)\n", v["markdown"] + "\n")
                if m:
                    v["absorb"] = 10 ** 6 if m.group(1) == "rest" else int(m.group(1))
                    v["markdown"] = v["markdown"][m.end():].strip()
                    continue
                m = re.match(r"^place (\d+) (\d+) (\d+) ([LRS])\n", v["markdown"] + "\n")
                if m:
                    PLACES[num] = (int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4))
                    v["markdown"] = v["markdown"][m.end():].strip()
                    continue
                m = re.match(r"^column ([LRS])\n", v["markdown"] + "\n")
                if m:
                    v["column"] = m.group(1)
                    v["markdown"] = v["markdown"][m.end():].strip()
                    continue
                m = re.match(r"^until (\d+)(?: page (\d+))?\n", v["markdown"] + "\n")
                if m:
                    if m.group(2):
                        v.setdefault("until_pages", {})[int(m.group(2))] = int(m.group(1))
                    else:
                        v["until"] = int(m.group(1))
                    v["markdown"] = v["markdown"][m.end():].strip()
                    continue
                m = re.match(r"^title (.+)\n", v["markdown"] + "\n")
                if m:
                    v["title"] = m.group(1).strip()
                    v["markdown"] = v["markdown"][m.end():].strip()
                    continue
                break
    return out


def apply_patches(md, fix):
    lines = md.split("\n")
    rows_at = [i for i, x in enumerate(lines) if x.startswith("| ")]
    if not rows_at:
        return md
    head_i, body_is = rows_at[0], rows_at[2:]

    def cells(x):
        return [c.strip() for c in x.strip().strip("|").split("|")]

    def row(cs):
        return "| " + " | ".join(cs) + " |"

    if fix["header"]:
        hs = [h.strip() for h in fix["header"].split("|")]
        lines[head_i] = row(hs)
        lines[rows_at[1]] = row(["---"] * len(hs))
    for r, c, v in fix["cells"]:
        if r > len(body_is):
            sys.exit(f"overrides: row {r} out of range")
        cs = cells(lines[body_is[r - 1]])
        while len(cs) < c:
            cs.append("")
        cs[c - 1] = v
        lines[body_is[r - 1]] = row(cs)
    for r in sorted(fix["drop"], reverse=True):
        del lines[body_is[r - 1]]
    return "\n".join(lines)


def sql_text(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def group_for(num):
    n = int(num)
    return "General" if n <= 10 else "Equipment"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ocr_dir")
    ap.add_argument("slug", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--label", default=None)
    ap.add_argument("--overrides", default=None)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--page", type=int, default=None)
    ap.add_argument("--first", type=int, default=11, help="first PDF page of chapter 1")
    ap.add_argument("--last", type=int, default=110, help="a PDF page at or after Annex B")
    ap.add_argument("--dump-tables", default=None, help="write every converted table here")
    ap.add_argument("--skip-pages", default="",
                    help="PDF pages to ignore, e.g. 34,35 (the same page photographed twice)")
    ap.add_argument("--layout", choices=["chapters", "articles"], default="chapters",
                    help="chapters: NFPA 70B style; articles: NFPA 70E style")
    args = ap.parse_args()
    SKIP_PAGES.update(int(x) for x in args.skip_pages.split(",") if x.strip())

    if args.page:
        page = order_page(page_path(args.ocr_dir, args.page))
        print(f"# pdf {args.page}  book {page['book_page']}  gutter {page.get('gutter')}/{page['width']}")
        for kind, item in page["items"]:
            if kind == "line":
                print(f"{item.col} {item.x0:>4} {item.y0:>4} | {item.text}")
            else:
                print(f"== TABLE {item.number} {item.title!r} ({len(item.lines)} lines, wide={item.wide})")
                for l in item.lines:
                    print(f"   T {l.x0:>4} {l.y0:>4} | {l.text}")
        return

    report = []
    load_vocab(args.ocr_dir, args.first, args.last)
    overrides = load_overrides(args.overrides)
    if args.layout == "articles":
        units, tables, order = build_articles(
            args.ocr_dir, args.first, args.last, report,
            absorb={n: v["absorb"] for n, v in overrides.items()},
            until={n: (v["until"], v["column"], v.get("until_pages", {})) for n, v in overrides.items()
                   if v["until"] or v["column"] or v.get("until_pages")},
        )
        chapters, annex_a = [], {}
    else:
        chapters, annex_a, tables, order = build(
            args.ocr_dir, args.first, args.last, report,
            fixes={n: (v["until"], v["column"], v.get("until_pages", {})) for n, v in overrides.items()
                   if v["until"] or v["column"] or v.get("until_pages")},
        )
        units = []
    tables_md, titles = {}, {}
    dump = []
    for n in order:
        t = tables[n]
        titles[n] = t["title"]
        fix = overrides.get(n)
        if fix and fix.get("title"):
            titles[n] = fix["title"]
        if fix and fix["markdown"] is not None:
            tables_md[n] = fix["markdown"]
            report.append(f"  Table {n:<12} override")
            continue
        # Parts from different pages have unrelated y's: convert each part,
        # then put every part's rows under the first part's header.
        before, grid, after, probs = [], [], [], []
        for k, part in enumerate(t["parts"]):
            md, pr = table_markdown(part, n)
            probs.extend(f"part {k + 1}: {p}" if k else p for p in pr)
            lines = md.split("\n")
            rows_at = [i for i, x in enumerate(lines) if x.startswith("| ")]
            if not rows_at:
                continue
            if k == 0 or not grid:
                before = lines[: rows_at[0]]
                grid = lines[rows_at[0]: rows_at[-1] + 1]
            else:
                grid += lines[rows_at[0] + 2: rows_at[-1] + 1]
            for x in lines[rows_at[-1] + 1:]:
                if x.strip() and x not in after:
                    after.append(x)
        md = "\n".join(before + grid + ([""] + "\n\n".join(after).split("\n") if after else []))
        if fix:
            md = apply_patches(md, fix)
        page_ref = f"book page {t['book_page']}" if t.get("book_page") else "the book"
        if not md.strip():
            md = f"::: warning\nThis table did not convert from the scan. See {page_ref}.\n:::"
        elif probs and not (fix and fix["verified"]):
            md = (f"::: warning\nRead from a photo of the book. Some cells may be wrong or show \"?\". "
                  f"Check {page_ref} before relying on it.\n:::\n\n" + md)
        tables_md[n] = md
        if fix and fix["verified"]:
            probs = []
        flag = "OK" if not probs else f"CHECK ({len(probs)}): " + "; ".join(probs[:4])
        report.append(f"  Table {n:<12} {flag}")
        dump.append(f"@@ Table {n}\n{md}\n")
    if args.dump_tables:
        with open(args.dump_tables, "w", encoding="utf-8") as f:
            f.write("\n".join(dump))

    rows = []
    for ch in chapters:
        body = chapter_markdown(ch, annex_a, tables_md, titles) or "*Reserved for future use.*"
        rows.append({
            "section_number": ch["num"],
            "kind": "section",
            "title": ch["title"],
            "group_title": group_for(ch["num"]),
            "sort_order": (len(rows) + 1) * 10,
            "book_page": ch["book_page"],
            "pdf_page": ch["pdf_page"],
            "body": body,
        })
        report.append(f"Ch {ch['num']:>2} {len(body):>6}ch p{ch['book_page']} {ch['title'][:60]}")
    for u in units:
        body = article_markdown(u, tables_md, titles) or "*Reserved for future use.*"
        rows.append({
            "section_number": u["num"],
            "kind": "section",
            "title": u["title"] or u["num"],
            "group_title": u["group"],
            "sort_order": (len(rows) + 1) * 10,
            "book_page": u["book_page"],
            "pdf_page": u["pdf_page"],
            "body": body,
        })
        report.append(f"{u['num']:>4} {len(body):>6}ch p{u['book_page']} {u['group'][:22]:<22} {u['title'][:60]}")

    for r in rows:
        r["body"] = fix_vy(r["body"])
        for old, new in REPLACEMENTS:
            r["body"] = r["body"].replace(old, new)
            r["title"] = r["title"].replace(old, new)
    if args.slug and args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(f"-- {args.label or args.slug}: generated by scripts/standards/parse_nfpa_ocr.py\n")
            f.write("-- Copyrighted text from the company's licensed copy. Do NOT commit this file.\n")
            f.write("-- Run after database/migrations/standard_sections.sql. Replaces this standard's rows.\n\n")
            f.write("BEGIN;\n\n")
            f.write(f"DELETE FROM common.standard_sections WHERE standard = {sql_text(args.slug)};\n\n")
            for r in rows:
                if "$md$" in r["body"]:
                    sys.exit(f"body of {r['section_number']} contains $md$")
                f.write(
                    "INSERT INTO common.standard_sections "
                    "(standard, section_number, kind, title, group_title, sort_order, book_page, pdf_page, body) VALUES (\n"
                    f"  {sql_text(args.slug)}, {sql_text(r['section_number'])}, {sql_text(r['kind'])},\n"
                    f"  {sql_text(r['title'])},\n"
                    f"  {sql_text(r['group_title'])}, {r['sort_order']}, "
                    f"{r['book_page'] if r['book_page'] else 'NULL'}, {r['pdf_page'] if r['pdf_page'] else 'NULL'},\n"
                    f"$md$\n{r['body']}\n$md$);\n\n"
                )
            f.write("COMMIT;\n")
    report.extend(SEQ_REPORT)
    if args.report:
        print("\n".join(report))
    print(f"{len(rows)} chapters, {len(order)} tables, {len(annex_a)} Annex A notes")


if __name__ == "__main__":
    main()
