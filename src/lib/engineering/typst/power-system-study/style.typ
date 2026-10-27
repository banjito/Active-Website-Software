// The report's look: page setup, headers and footers, covers, SKM title
// pages and SKM PDF pages. Replaces the fancypagestyles and titlepages in the
// LaTeX version.
#import "project.typ": *

#let myorange = rgb(242, 103, 34)

// LaTeX's font sizes at 12pt, so the covers match the original.
#let fs = (small: 10.95pt, large: 14.4pt, Large: 17.28pt, Huge: 24.88pt)

// Whole report: US letter, the LaTeX margins, Helvetica at 12pt.
#let report(body) = {
  set document(title: reporttypetitle)
  set page(paper: "us-letter", margin: (top: 2cm, bottom: 2.8cm, x: 1.5cm))
  set text(font: ("Helvetica", "Arial", "Arimo"), size: 12pt)
  set par(justify: true, spacing: 1.1em)
  set list(indent: 1em)
  set enum(indent: 1em)
  // = is \section (numbered); == and === are \subsection* and \subsubsection*.
  set heading(numbering: "1")
  show heading: set block(above: 1.6em, below: 1em)
  show heading.where(level: 1): set text(size: fs.Large)
  show heading.where(level: 2): set text(size: fs.large)
  show heading.where(level: 2): set heading(numbering: none)
  show heading.where(level: 3): set text(size: 12pt)
  show heading.where(level: 3): set heading(numbering: none)
  set table(stroke: 0.5pt, align: center + horizon, inset: 6pt)
  show table.cell.where(y: 0): set text(weight: "bold")
  set outline.entry(fill: none)
  show outline.entry.where(level: 1): set text(weight: "bold")
  body
}

// One row of small print: left, centered, right (fancyhdr's L/C/R).
#let edge-row(l, c, r) = text(size: 8pt, grid(
  columns: (1fr, auto, 1fr),
  column-gutter: 1em,
  align: (left, center, right),
  l, c, r,
))

#let rule = line(length: 100%, stroke: 0.5pt)

#let page-header(title) = stack(
  spacing: 4pt,
  edge-row(title, [#sitename, #sitelocation], mydate),
  rule,
)

#let page-footer(page-label) = stack(
  spacing: 4pt,
  rule,
  edge-row([Prepared by: #preparedby], page-label, [Prepared for: #preparedfor]),
)

// A study (Executive Summary, Short Circuit Study, ...). Its cover is page 1,
// so the text starts at page 2 and reads "Page x of y", where y is the last
// page of the text (SKM sections after it don't count, like \label{...-end}).
#let study(title, body, numbered: true) = {
  pagebreak(weak: true)
  set page(
    header: page-header(title),
    footer: page-footer(context {
      let marks = query(<study-page>).filter(m => m.value == title)
      let total = if marks == () { "?" } else { counter(page).at(marks.last().location()).first() }
      [Page #counter(page).display() of #total]
    }) + [#metadata(title) <study-page>],
  )
  set heading(numbering: none) if not numbered
  counter(page).update(2)
  counter(heading).update(0)
  [#metadata(title) <study-start>]
  body
}

// This study's own table of contents (titletoc's \printlist).
#let contents() = context {
  let next = query(selector(<study-start>).after(here()))
  let target = heading.where(level: 1, outlined: true).after(here())
  if next.len() > 0 { target = target.before(next.first().location()) }
  outline(title: [Table of Contents], target: target)
}

// Incident energy summary table, used in two studies.
#let ie-table() = figure(
  table(
    columns: 3,
    [PPE Category], [Incident Energy (IE)], [No. of Buses Identified],
    [0], [IE < 1.2 cal/cm²], busescat0,
    [3], [1.2 cal/cm² ≤ IE ≤ 12 cal/cm²], busescat3,
    [4], [12 cal/cm² ≤ IE ≤ 40 cal/cm²], busescat4,
    [DANGER], [IE > 40 cal/cm²], busesdanger,
  ),
  caption: [Incident Energy Categories and Associated Buses Identified],
)

// Cover page: orange bar down the left edge, header and footer artwork,
// bold centered text, no page header or footer.
#let cover-page(body) = page(
  header: none,
  footer: none,
  margin: (x: 1.5cm, y: 0cm),
  background: place(left + top, rect(width: 0.8cm, height: 100%, fill: myorange)),
  {
    set align(center)
    set text(weight: "bold")
    set par(spacing: 0.4em)
    image("/Pictures/Cover Header.png", width: 100%)
    text(fs.small, preparedbyaddress)
    body
    v(1fr)
    image("/Pictures/Cover Footer.png", width: 100%)
  },
)

// Cover in front of each study.
#let study-cover(title) = cover-page[
  #v(2cm)
  #text(fs.large)[Report \##projectnumber]
  #v(0.25cm)
  #text(fs.large)[#sitename, #sitelocation]
  #v(0.25cm)
  #text(fs.large, reporttypetitle)
  #v(2cm)
  #text(36pt, title)
  #v(2cm)
  #text(fs.large)[Prepared for]
  #v(0.25cm)
  #text(fs.large, preparedfor)
  #v(2cm)
  #text(fs.large)[Prepared on]
  #v(0.25cm)
  #text(fs.large, mydate)
]

// Title page in front of each SKM section.
#let title-page(heading, logo-width) = page(header: none, footer: none, {
  set align(center)
  set text(weight: "bold")
  set par(spacing: 0.4em)
  v(1cm)
  text(fs.large)[Report \##projectnumber]
  v(0.25cm)
  text(fs.large)[#sitename, #sitelocation]
  v(0.25cm)
  text(fs.large, reporttypetitle)
  v(2cm)
  text(fs.Huge, heading)
  v(2cm)
  text(fs.large, mydate)
  v(1fr)
  image("/Pictures/AMP-Logo.png", width: logo-width)
})

// A section after a study's text: a title page, then the body under its own
// header, numbered from 2 ("Page x"). `heading` is the title-page text when
// it differs from the header. Landscape sections print on ledger paper
// (17 x 11 in). `bare` drops the header and footer and fills the page (arc
// flash labels).
#let section(title, body, heading: none, landscape: false, logo-width: 25%, bare: false) = {
  set page(width: 17in, height: 11in, margin: (top: 1.6cm, bottom: 2.8cm, x: 2cm)) if landscape
  set page(
    header: page-header(title),
    footer: page-footer(context [Page #counter(page).display()]),
  ) if not bare
  set page(header: none, footer: none, margin: 0pt) if bare
  title-page(if heading == none { title } else { heading }, logo-width)
  if not bare { counter(page).update(2) }
  body
}

// One PDF page, as big as the page allows. `trim` cuts the PDF's own blank
// margins off (a fraction of its width and height from each side), so the
// table inside fills more of the page.
#let pdf-page(file, p, trim) = layout(area => {
  let natural = measure(image(file, page: p))
  let w = natural.width * (1 - 2 * trim.x)
  let h = natural.height * (1 - 2 * trim.y)
  let scale = calc.min(area.width / w, area.height / h) * 0.999
  align(center + horizon, box(width: w * scale, height: h * scale, clip: true, place(
    top + left,
    dx: -natural.width * trim.x * scale,
    dy: -natural.height * trim.y * scale,
    // Both sides set, or Typst shrinks the image to fit the box.
    image(file, page: p, width: natural.width * scale, height: natural.height * scale),
  )))
})

// An SKM section: a title page, then every page of the PDF.
#let attachment(title, file, trim: (x: 0, y: 0), ..options) = section(title, ..options, {
  for p in range(1, pdf-page-count(file) + 1) {
    pagebreak(weak: true)
    pdf-page(file, p, trim)
  }
})

// SKM's Arc Flash PPE Table (NFPA 70E 130.5(G)). It is the same on every job,
// so it is typed in here instead of uploaded. The picture columns (paths to
// SKM's own bitmaps) and the empty PPE Others 5 column are left out.
#let ppe-table() = {
  set text(size: 11pt)
  set par(justify: false)
  set table(inset: 6pt)
  let danger = rgb(255, 235, 235)
  let level-fill = (x, y) => if y == 4 { danger }
  let swatch(c) = table.cell(fill: c)[]
  let orange = rgb(255, 165, 0)
  let dnwol = [DO NOT WORK ON LIVE!]
  let arc-clothing = [Arc-rated shirt & pants or arc-rated coverall or arc-rated arc flash suit]
  let arc-others = [Arc-rated shirt (long-sleeve) plus Arc-rated pants (long) or Arc-rated coverall, or arc rated arc flash suit. Arc rated outerwear (eg. jacket, parka, rainwear, hard hat liner, high visibility apparel) as needed.]
  let tools = [> 50V voltage rated tools + Class 0 (minimum) gloves]
  let hard-hat = [Hardhat + Arc-rated hard hat liner + Safety Glasses or Goggles + Ear Canal Inserts]
  let shoes = [Leather shoes (flash) as needed. Dielectric shoes or insulating mat (step and touch potential).]
  table(
    columns: (auto, 1fr, 1fr, 1fr, 1fr, 0.8fr, 2.2fr, 1.2fr, 1.3fr, 1fr, 0.9fr, 0.9fr),
    fill: level-fill,
    table.header(
      [], [Incident Energy From (cal/cm²)], [Incident Energy To (cal/cm²)],
      [IE Low Marginal (cal/cm²)], [IE High Marginal (cal/cm²)], [PPE Level \#],
      [PPE Level], [Clothing Layers], [Required Minimum Arc Rating of PPE (cal/cm²)], [Notes],
      [Level Background Color], [Level Foreground Color],
    ),
    [1], [0.0], [1.2], [0.000], [1.190], [0], [No Arc-rated PPE Required], [N/A], [N/A], [H.3],
    swatch(orange), swatch(black),
    [2], [1.2], [12.0], [1.210], [11.800], [3], arc-clothing, [2 or 3], [12], [130.5(G)],
    swatch(orange), swatch(black),
    [3], [12.0], [100.0], [12.200], [99.000], [4], arc-clothing, [3 or more], [100], [130.5(G)],
    swatch(orange), swatch(black),
    [4], [100.0], [9999.0], [1000.000], [9998.000], [Dangerous!], dnwol, dnwol, [N/A], dnwol,
    swatch(red), swatch(white),
  )
  v(1fr)
  table(
    columns: (auto, 0.9fr, 1.6fr, 1.3fr, 1fr, 1.4fr, 2fr, 1.2fr, 1.4fr),
    fill: level-fill,
    table.header(
      [], [Warning Label Text], [Head & Eye & Hearing Protection], [Hand & Arm Protection],
      [Foot Protection], [PPE Others 1], [PPE Others 2], [PPE Others 3], [PPE Others 4],
    ),
    [1], [WARNING], [Safety Glasses or Goggles], [Rubber insulating gloves w/ leather protectors], [N/A],
    [Safety glasses, Class G or E hard hat as needed.], [N/A], tools,
    [Dielectric shoes or insulating mat (step and touch potential).],
    [2], [WARNING], hard-hat,
    [Heavy-duty leather gloves, arc-rated gloves, or rubber insulating gloves w/ leather protectors],
    [Leather footwear],
    [Safety glasses, hard hat with arc-rated hood or balaclava, and arc-rated face shield. Hearing protection.],
    arc-others, [#tools and leather protectors (flash).], shoes,
    [3], [WARNING], hard-hat, [Arc-rated gloves or rubber insulating gloves w/ leather protectors],
    [Leather footwear], [Safety glasses, hard hat with arc-rated hood. Hearing protection.],
    arc-others, [#tools and leather protectors (flash).], shoes,
    [4], [DANGER], dnwol, dnwol, dnwol, dnwol, dnwol, dnwol, dnwol,
  )
  v(1fr)
}
