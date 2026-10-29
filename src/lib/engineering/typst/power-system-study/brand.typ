// Company branding: the cover's edge bar, header and footer artwork, the logo
// on SKM title pages and the color of headings and cover text. The C&E Design
// template swaps only this file (and the defaults in project.typ).

#let company = "AMP"
#let ink = black

// Orange bar down the cover's left edge.
#let cover-bar = rect(width: 0.8cm, height: 100%, fill: rgb(242, 103, 34))
#let cover-header = image("/Pictures/Cover Header.png", width: 100%)
#let cover-footer = image("/Pictures/Cover Footer.png", width: 100%)
#let logo(width) = image("/Pictures/AMP-Logo.png", width: width)
