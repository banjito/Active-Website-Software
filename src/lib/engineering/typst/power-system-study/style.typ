// The report's look: page setup, the header and footer on every page, cover
// pages and SKM PDF pages. Replaces the 16 fancypagestyles in the LaTeX master.
#import "project.typ": *

#let myorange = rgb(242, 103, 34)

// Whole report: US letter, the LaTeX margins, Helvetica at 12pt.
#let report(body) = {
  set document(title: reporttypetitle)
  set page(paper: "us-letter", margin: (top: 2cm, bottom: 2.8cm, x: 1.5cm))
  set text(font: ("Helvetica", "Arial", "TeX Gyre Heros", "Liberation Sans"), size: 12pt)
  set par(justify: true)
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

// A main study (Executive Summary, Short Circuit Study, ...). Pages restart
// at 1 and read "Page x of y", where y counts only this study's pages.
#let study(title, body) = {
  pagebreak(weak: true)
  set page(
    header: page-header(title),
    footer: page-footer(context {
      let end = query(<study-end>).find(m => m.value == title)
      let total = if end == none { "?" } else { counter(page).at(end.location()).first() }
      [Page #counter(page).display() of #total]
    }),
  )
  counter(page).update(1)
  body
  [#metadata(title) <study-end>]
}

// A titled run of pages inside a study, usually SKM output. Same header and
// footer, but the footer reads just "Page x".
#let attachment(title, body, landscape: false) = {
  pagebreak(weak: true)
  set page(
    flipped: landscape,
    header: page-header(title),
    footer: page-footer(context [Page #counter(page).display()]),
  )
  body
}

// Every page of a PDF (an SKM report, a one-line), one per report page,
// shrunk to fit inside the margins. Typst doesn't read a PDF's page count,
// so pass `pages`; ampOS will fill it in when the file is uploaded.
// Start paths with "/" so they always mean the template's main folder.
#let pdf-pages(path, pages) = for p in range(1, pages + 1) {
  pagebreak(weak: true)
  align(center + horizon, image(path, page: p, width: 100%, height: 100%, fit: "contain"))
}

// A cover page: no header or footer, orange bar down the left edge
// (the LaTeX background rectangle, 0.8cm visible).
#let cover-page(body) = page(
  header: none,
  footer: none,
  background: place(left + top, rect(width: 0.8cm, height: 100%, fill: myorange)),
  body,
)

// Placeholder study cover until the real cover files are converted.
#let section-cover(title) = cover-page[
  #v(1fr)
  #text(size: 28pt, weight: "bold", title)
  #v(0.5em)
  #sitename, #sitelocation
  #v(1fr)
]
