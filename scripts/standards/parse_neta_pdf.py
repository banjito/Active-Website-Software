#!/usr/bin/env python3
"""
Parse a NETA standard PDF (ATS / MTS) into docs-style markdown pages and write
a SQL seed for common.standard_sections (see database/migrations/standard_sections.sql).

Usage:
  python3 -I scripts/standards/parse_neta_pdf.py <pdf> <standard-slug> <out.sql>
      [--label "ANSI/NETA ATS-2025"] [--overrides hand_fixed.sql] [--report]

  <standard-slug>  e.g. ats-2025, mts-2023
  --overrides      an earlier seed file; its hand-fixed TABLE bodies win
  --report         print a per-page summary (sizes, table fallbacks) to stdout

The OUTPUT contains copyrighted NETA text: write it outside the repo and never
commit it. This script holds no standards text itself.

Needs poppler's `pdftotext` (brew install poppler). Python stdlib only.
"""
import argparse
import re
import subprocess
import sys

# Group labels for chapter-7 families whose children share no common first
# words. Structure only, written by us.
GROUP_NAMES = {
    "7.1": "Switchgear, Switchboards, and Panelboards",
    "7.19": "Surge Protection",
    "7.20": "Capacitors, Reactors, and Resistors",
}

SKIP_APPENDICES = {"C", "D", "E"}  # about NETA, comment / proposal forms

SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"}


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


def title_case(text):
    words = norm(text).lower().split(" ")
    out = []
    for i, word in enumerate(words):
        if i > 0 and word in SMALL_WORDS:
            out.append(word)
        else:
            out.append("-".join(part[:1].upper() + part[1:] for part in word.split("-")))
    return " ".join(out)


def first_word(text):
    return norm(text).split(" ")[0].strip(",").lower() if norm(text) else ""


# ---------------------------------------------------------------- pages ---

def load_pages(pdf):
    raw = subprocess.run(
        ["pdftotext", "-layout", pdf, "-"], capture_output=True, check=True
    ).stdout.decode("utf-8", "replace")
    return raw.split("\f")


def strip_chrome(page, std_label_re):
    """Drop the footer ('Page N', '*Optional Test') and the 'ANSI/NETA ...'
    line that pdftotext emits at the end of each page. Returns (lines, book_page)."""
    lines = page.split("\n")
    book_page = None
    changed = True
    while changed and lines:
        changed = False
        while lines and not lines[-1].strip():
            lines.pop()
            changed = True
        if not lines:
            break
        last = lines[-1].strip()
        m = re.match(r"^Page (\d+)$", last)
        if m:
            book_page = book_page or int(m.group(1))
            lines.pop()
            changed = True
        elif std_label_re.match(last) or last == "*Optional Test":
            lines.pop()
            changed = True
    lines = [l for l in lines if l.strip() != "*Optional Test"]
    return lines, book_page


# ------------------------------------------------------------------ TOC ---

def parse_toc(pages, body_start):
    entries = []
    buf = []
    for page in pages[:body_start]:
        if "CONTENTS" not in page:
            continue
        for line in page.split("\n"):
            s = norm(line)
            if not s or s in ("CONTENTS", "TABLES", "APPENDICES") or "NETA" in s and len(s) < 25:
                buf = []
                continue
            buf.append(s)
            joined = " ".join(buf)
            m = re.match(r"^(.*?)\s*\.{2,}\s*(\d+)$", joined)
            if not m:
                if len(buf) > 3:
                    buf = []
                continue
            buf = []
            text, page_no = norm(m.group(1)), int(m.group(2))
            t = re.match(r"^Table\s+(100(?:\.\d+)+)\s+(.*)$", text)
            a = re.match(r"^Appendix\s+([A-Z])\s*-\s*(.*)$", text)
            c = re.match(r"^(\d+)\.\s+(.*)$", text)
            s_ = re.match(r"^(\d+(?:\.\d+)+)\s+(.*)$", text)
            if t:
                entries.append({"kind": "table", "num": t.group(1), "title": norm(t.group(2))})
            elif a:
                entries.append({"kind": "appendix", "num": a.group(1), "title": norm(a.group(2))})
            elif c:
                entries.append({"kind": "chapter", "num": c.group(1), "title": norm(c.group(2))})
            elif s_:
                entries.append({"kind": "section", "num": s_.group(1), "title": norm(s_.group(2))})
    return entries


# --------------------------------------------------------- body split ---

def heading_unit(line, by_key):
    """If this line is the heading of a TOC unit, return that unit's key."""
    s = line.strip()
    # Appendix headings are centred, and their running headers are upper case.
    m = re.match(r"^Appendix\s+([A-Z])\s*-\s*(.*)$", s, re.I)
    if m and ("appendix", m.group(1)) in by_key:
        return by_key[("appendix", m.group(1))], m.group(2)
    if len(line) - len(line.lstrip()) > 3:
        return None, None
    m = re.match(r"^Table\s+(100(?:\.\d+)+)\b\s*(.*)$", s)
    if m and ("table", m.group(1)) in by_key:
        unit = by_key[("table", m.group(1))]
        rest = m.group(2)
        if not rest or first_word(rest) == first_word(unit["title"]):
            return unit, rest
        return None, None
    m = re.match(r"^(\d+)\.\s+(.+)$", s)
    if m and ("chapter", m.group(1)) in by_key:
        unit = by_key[("chapter", m.group(1))]
        heading = norm(m.group(2)).upper()
        # Long chapter titles wrap: the first line is a prefix of the TOC title.
        if heading == unit["title"].upper() or (len(heading) >= 10 and unit["title"].upper().startswith(heading)):
            return unit, m.group(2)
    m = re.match(r"^(\d+(?:\.\d+)+)\s+(\S.*)$", s)
    if m and ("section", m.group(1)) in by_key:
        unit = by_key[("section", m.group(1))]
        # Body titles can differ from the TOC ("Shielded Cables" vs "Cables"),
        # so accept any shared leading keyword.
        head_words = {w.strip(",").lower() for w in norm(m.group(2)).split(" ")[:4]}
        toc_words = [w.strip(",").lower() for w in norm(unit["title"]).split(" ")[:3]]
        if first_word(m.group(2)) == first_word(unit["title"]) or any(
            len(w) > 3 and w in head_words for w in toc_words
        ):
            return unit, m.group(2)
    return None, None


def split_units(pages, body_start, toc, std_label_re):
    by_key = {(u["kind"], u["num"]): u for u in toc}
    for i, u in enumerate(toc):
        u["order"] = i
        u["lines"] = []
        u["started"] = False
    current = None
    wrap_title = None  # title of the heading just dropped; its wrapped tail is dropped too
    wrap_append = False
    for index in range(body_start, len(pages)):
        lines, book_page = strip_chrome(pages[index], std_label_re)
        for line in lines:
            s = norm(line)
            if s in ("TABLES", "APPENDICES"):
                continue
            unit, heading_text = heading_unit(line, by_key)
            if unit:
                wrap_append = False
                if current is None or unit["order"] > current["order"]:
                    current = unit
                    unit["started"] = True
                    unit["pdf_page"] = index + 1
                    unit["book_page"] = book_page
                    unit["body_title"] = norm(heading_text or "")
                    wrap_append = True
                # Running headers and repeated headings are dropped either way,
                # including the wrapped second line of their title.
                wrap_title = unit["title"].upper()
                continue
            if wrap_title and s and s.upper() in wrap_title and len(s) < len(wrap_title):
                if wrap_append and current.get("body_title") and s not in current["body_title"]:
                    current["body_title"] = norm(current["body_title"] + " " + s)
                continue
            if s:
                wrap_title = None
            if current is not None:
                current["lines"].append(line.rstrip())
    return toc


# ----------------------------------------------------- text -> markdown ---

MARKER_NUM = re.compile(r"^(\s*)(\d+)\.(\s+)(\S.*)$")
MARKER_LET = re.compile(r"^(\s*)([a-z])\.(\s+)(\S.*)$")
MARKER_PAREN = re.compile(r"^(\s*)\(([a-z0-9]{1,3})\)(\s+)(\S.*)$")
MARKER_BULLET = re.compile(r"^(\s*)[•▪●](\s*)(\S.*)$")
HEAD_LETTER = re.compile(r"^(\s{0,3})([A-Z])\.(\s+)(\S.{1,100})$")
NOTE = re.compile(r"^(\s*)Notes?:\s*(.*)$")


def is_tabular(text):
    return len(re.findall(r"\S {3,}\S", text)) >= 2


def optional(text):
    return "**Optional:** " + text[1:].lstrip() if text.startswith("*") else text


def clean(text):
    text = norm(text)
    # A lone leading list/quote character would turn a paragraph into a block.
    if re.match(r"^[-*>#|] ", text):
        text = "​" + text
    return text


def join_lines(a, b):
    """Join a wrapped line. 'power-' + 'factor' -> 'power-factor', but
    'medium-' + 'and high-voltage' keeps its space."""
    if a.endswith("/") or (
        a.endswith("-") and b[:1].islower() and b.split(" ")[0] not in ("and", "or", "to", "through")
    ):
        return a + b
    return a + " " + b


KEYED = re.compile(r"^(\S.{0,34}?)( {4,})(\S.*)$")


def convert_text(lines, definitions=False):
    """Layout text -> markdown blocks. definitions=True bolds the first line of
    each paragraph when it is a short 'Term.' line (Appendix A)."""
    blocks = []
    state = {"kind": None}  # list | para | note | code | bullets
    target = {"ref": None, "indent": 0}  # what a continuation line appends to
    blank_before = [False]

    def flush():
        k = state["kind"]
        if k == "list":
            out = []
            for n, item in enumerate(state["items"]):
                number = state["start"] + n
                out.append(f"{number}. {clean(item['text'])}")
                for child in item["children"]:
                    out.append(f"  - {clean(child['text'])}")
            blocks.append("\n".join(out))
        elif k == "bullets":
            blocks.append("\n".join(f"- {clean(it['text'])}" for it in state["items"]))
        elif k == "para":
            blocks.append(clean(state["text"]["text"]))
        elif k == "note":
            blocks.append(f"::: note\n{clean(state['text']['text'])}\n:::")
        elif k == "code":
            body = state["lines"]
            pad = min(len(l) - len(l.lstrip()) for l in body if l.strip())
            blocks.append("```\n" + "\n".join(l[pad:] for l in body) + "\n```")
        state.clear()
        state["kind"] = None
        target["ref"] = None

    for line in lines:
        if not line.strip():
            blank_before[0] = True
            if state["kind"] == "note":
                flush()
            continue
        indent = len(line) - len(line.lstrip())
        text = line.strip()
        after_blank = blank_before[0]
        blank_before[0] = False

        # Tabular lines inside a section: keep the layout verbatim.
        body_text = re.sub(r"^(\d+\.|[A-Za-z]\.|\([a-z0-9]{1,3}\)|Notes?:)\s+", "", text)
        in_list = state["kind"] in ("list", "bullets")
        if is_tabular(body_text) or (not in_list and re.search(r"\S {6,}\S", body_text)):
            if state["kind"] != "code":
                flush()
                state.update(kind="code", lines=[])
            state["lines"].append(line)
            continue
        if state["kind"] == "code":
            flush()

        m = HEAD_LETTER.match(line)
        if m and not text.endswith(",") and len(text) < 100:
            flush()
            blocks.append(f"## {m.group(2)}. {norm(m.group(4))}")
            continue

        m = NOTE.match(line)
        if m:
            flush()
            state.update(kind="note", text={"text": m.group(2)})
            target.update(ref=state["text"], indent=indent)
            continue

        m = MARKER_NUM.match(line)
        if m:
            number = int(m.group(2))
            text_indent = len(m.group(1)) + len(m.group(2)) + 1 + len(m.group(3))
            if state["kind"] == "list" and state["items"] and indent > state["indent"] + 2:
                child = {"text": f"{number}. {optional(m.group(4))}"}
                state["items"][-1]["children"].append(child)
                target.update(ref=child, indent=text_indent)
                continue
            if state["kind"] != "list" or indent < state["indent"] - 2:
                flush()
                state.update(kind="list", items=[], start=number, indent=indent)
            item = {"text": optional(m.group(4)), "children": []}
            state["items"].append(item)
            target.update(ref=item, indent=text_indent)
            continue

        m = MARKER_LET.match(line) or MARKER_PAREN.match(line)
        if m and indent > 0:
            label = f"{m.group(2)}." if MARKER_LET.match(line) else f"({m.group(2)})"
            text_indent = len(m.group(1)) + len(label) + len(m.group(3))
            child = {"text": f"{label} {optional(m.group(4))}"}
            if state["kind"] == "list" and state["items"]:
                state["items"][-1]["children"].append(child)
            else:
                if state["kind"] != "bullets":
                    flush()
                    state.update(kind="bullets", items=[])
                child["children"] = []
                state["items"].append(child)
            target.update(ref=child, indent=text_indent)
            continue

        # "ASTM D92      Standard Test Method..." rows inside a list: code + title.
        m = KEYED.match(text)
        if m and state["kind"] == "list" and state["items"] and indent > state["indent"]:
            child = {"text": f"**{m.group(1)}** {m.group(3)}"}
            state["items"][-1]["children"].append(child)
            target.update(ref=child, indent=indent + len(m.group(1)) + len(m.group(2)))
            continue

        m = MARKER_BULLET.match(line)
        if m:
            child = {"text": optional(m.group(3))}
            text_indent = len(m.group(1)) + 1 + len(m.group(2))
            if state["kind"] == "list" and state["items"]:
                state["items"][-1]["children"].append(child)
            else:
                if state["kind"] != "bullets":
                    flush()
                    state.update(kind="bullets", items=[])
                state["items"].append(child)
            target.update(ref=child, indent=text_indent)
            continue

        # Plain text: continuation of whatever came before, or a new paragraph.
        ref = target["ref"]
        if ref is not None and state["kind"] in ("list", "bullets") and indent >= target["indent"] - 2:
            ref["text"] = join_lines(ref["text"], text)
            continue
        if ref is not None and state["kind"] in ("note", "para") and not after_blank:
            ref["text"] = join_lines(ref["text"], text)
            continue
        flush()
        text = optional(text)
        if definitions and len(text) < 70 and text.endswith(".") and text[:1].isupper():
            text = f"**{text}**"
        state.update(kind="para", text={"text": text})
        target.update(ref=state["text"], indent=indent)

    flush()
    return blocks


# ------------------------------------------------------ table grids ---

def tokens(line):
    return [(m.start(), m.end(), m.group()) for m in re.finditer(r"\S+(?: \S+)*", line)]


def overlap(a, b):
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def auto_table(grid):
    """Turn a layout grid into a markdown table. Returns None when the column
    structure is not clear-cut; the caller then keeps the layout verbatim."""
    rows = [tokens(l) for l in grid if l.strip()]
    if len(rows) < 3:
        return None
    n = max(len(r) for r in rows)
    if n < 2:
        return None
    full = [r for r in rows if len(r) == n]
    if len(full) < 2:
        return None
    spans = [(min(r[j][0] for r in full), max(r[j][1] for r in full)) for j in range(n)]
    for j in range(n - 1):
        if spans[j][1] >= spans[j + 1][0]:
            return None
    first = next(i for i, r in enumerate(rows) if len(r) == n)
    header_rows, body_rows = rows[:first], rows[first:]

    def column_of(tok, strict):
        best, best_overlap = None, 0
        for j, span in enumerate(spans):
            o = overlap((tok[0], tok[1]), span)
            if o > best_overlap:
                best, best_overlap = j, o
        if best is not None:
            return best
        if strict:
            return None
        centre = (tok[0] + tok[1]) / 2
        return min(range(n), key=lambda j: abs((spans[j][0] + spans[j][1]) / 2 - centre))

    captions = []
    header = [""] * n
    for r in header_rows:
        for tok in r:
            covered = [j for j, span in enumerate(spans) if overlap((tok[0], tok[1]), span) > 0]
            if len(covered) > 1:
                captions.append(tok[2])
                continue
            j = column_of(tok, strict=False)
            header[j] = norm(header[j] + " " + tok[2])

    # One layout line = one row. Merging wrapped lines guesses which row a
    # value belongs to, and a wrong guess is worse than a plain-looking table.
    body = []
    for r in body_rows:
        cells = [""] * n
        for tok in r:
            covered = [j for j, span in enumerate(spans) if overlap((tok[0], tok[1]), span) > 0]
            if len(covered) > 1:
                return None
            j = column_of(tok, strict=True)
            if j is None or cells[j]:
                return None
            cells[j] = tok[2]
        body.append(cells)
    if len(body) < 2:
        return None
    if not any(header):
        header, body = body[0], body[1:]

    def row(cells):
        return "| " + " | ".join(c.replace("|", "/") for c in cells) + " |"

    out = []
    if captions:
        out.append(norm(" ".join(captions)))
        out.append("")
    out.append(row(header))
    out.append("| " + " | ".join("---" for _ in range(n)) + " |")
    out.extend(row(c) for c in body)
    return "\n".join(out)


def convert_table(lines):
    """Grid before 'Notes:', notes after. Returns (markdown, used_auto_table)."""
    split = next((i for i, l in enumerate(lines) if re.match(r"^\s*Notes?:\s*$", l)), None)
    grid = lines if split is None else lines[:split]
    notes = [] if split is None else lines[split + 1:]
    while grid and not grid[0].strip():
        grid.pop(0)
    while grid and not grid[-1].strip():
        grid.pop()
    parts = []
    auto = auto_table(grid) if grid else None
    if auto:
        parts.append(auto)
    elif grid:
        pad = min(len(l) - len(l.lstrip()) for l in grid if l.strip())
        parts.append("```\n" + "\n".join(l[pad:] for l in grid) + "\n```")
    if notes:
        note_blocks = convert_text(notes)
        if note_blocks:
            parts.append("## Notes")
            parts.extend(note_blocks)
    return "\n\n".join(parts), bool(auto)


# ------------------------------------------------------------ output ---

def group_for(unit, units):
    kind, num = unit["kind"], unit["num"]
    if kind == "table":
        return "Tables"
    if kind == "appendix":
        return "Appendices"
    chapter = num.split(".")[0]
    chapters = {u["num"]: u for u in units if u["kind"] == "chapter"}
    if chapter != "7" or kind == "chapter":
        ch = chapters.get(chapter)
        return f"{chapter}. {title_case(ch['title'])}" if ch else chapter
    family = ".".join(num.split(".")[:2])
    if family in GROUP_NAMES:
        return f"{family} {GROUP_NAMES[family]}"
    kids = [u for u in units if u["kind"] == "section" and (u["num"] == family or u["num"].startswith(family + "."))]
    if len(kids) == 1:
        return f"{family} {kids[0].get("final_title", kids[0]["title"])}"
    heads = {norm(k.get("final_title", k["title"]).split(",")[0]) for k in kids}
    if len(heads) == 1:
        return f"{family} {heads.pop()}"
    return f"{family} {norm(kids[0].get("final_title", kids[0]["title"]).split(',')[0])}"


def load_overrides(path, slug):
    if not path:
        return {}
    text = open(path, encoding="utf-8").read()
    pattern = re.compile(
        r"\(\s*'" + re.escape(slug) + r"',\s*'([0-9.]+)',\s*'table'.*?\$md\$\n(.*?)\$md\$", re.S
    )
    return {m.group(1): m.group(2).strip() for m in pattern.finditer(text)}


def sql_text(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("slug")
    ap.add_argument("out")
    ap.add_argument("--label", default=None)
    ap.add_argument("--overrides", default=None)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    pages = load_pages(args.pdf)
    std_label_re = re.compile(r"^(ANSI/)?NETA [A-Z]{3}-\d{4}$")
    body_start = next(
        i for i, p in enumerate(pages)
        if any(re.match(r"^1\.\s+GENERAL SCOPE$", norm(l)) for l in p.split("\n"))
        and "CONTENTS" not in p
    )
    toc = parse_toc(pages, body_start)
    toc = [u for u in toc if not (u["kind"] == "appendix" and u["num"] in SKIP_APPENDICES)] + [
        {"kind": "appendix", "num": n, "title": "(skipped)", "skip": True}
        for n in sorted(SKIP_APPENDICES)
    ]
    units = split_units(pages, body_start, toc, std_label_re)
    overrides = load_overrides(args.overrides, args.slug)

    rows = []
    report = []
    for u in units:
        if u.get("skip") or not u["started"]:
            if not u.get("skip"):
                report.append(f"!! never found: {u['kind']} {u['num']} {u['title']}")
            continue
        body_title = u.get("body_title") or ""
        toc_title = u["title"]
        if u["kind"] == "chapter":
            title = title_case(toc_title)
        elif body_title and not (toc_title.startswith(body_title) and len(toc_title) > len(body_title)):
            title = body_title
        else:
            title = toc_title
        u["final_title"] = title

    for u in units:
        if u.get("skip") or not u["started"]:
            continue
        if u["kind"] == "table":
            if u["num"] in overrides:
                body, how = overrides[u["num"]], "override"
            else:
                body, auto = convert_table(list(u["lines"]))
                how = "auto-table" if auto else "layout"
        else:
            blocks = convert_text(u["lines"], definitions=(u["kind"] == "appendix" and u["num"] == "A"))
            body, how = "\n\n".join(blocks), "text"
        if not body.strip():
            report.append(f"   empty (skipped): {u['kind']} {u['num']}")
            continue
        rows.append({
            "section_number": u["num"],
            "kind": "table" if u["kind"] == "table" else "section",
            "title": u["final_title"],
            "group_title": group_for(u, units),
            "sort_order": (len(rows) + 1) * 10,
            "book_page": u.get("book_page"),
            "pdf_page": u.get("pdf_page"),
            "body": body.strip(),
        })
        report.append(
            f"{u['num']:>12} {how:<10} {len(body):>6}ch  p{u.get('book_page')}  {rows[-1]['group_title'][:28]:<28} {u['final_title'][:50]}"
        )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(f"-- {args.label or args.slug}: generated by scripts/standards/parse_neta_pdf.py\n")
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

    if args.report:
        print("\n".join(report))
    layout = sum(1 for line in report if " layout " in line)
    print(f"{len(rows)} pages written to {args.out} ({layout} tables kept as layout text)")


if __name__ == "__main__":
    main()
