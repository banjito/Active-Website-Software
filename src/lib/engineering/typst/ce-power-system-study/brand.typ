// Company branding for C&E Design: navy wordmark and text, the AMP orange as
// a single accent line beside the navy cover bar.

#let company = "C&E Design"
#let navy = rgb("#1b0f56")
#let orange = rgb("#f16823")
#let ink = navy

// Navy bar down the cover's left edge, edged in AMP orange.
#let cover-bar = stack(
  dir: ltr,
  rect(width: 0.8cm, height: 100%, fill: navy),
  rect(width: 0.12cm, height: 100%, fill: orange),
)
#let cover-header = pad(top: 0.6cm, image("/Pictures/CE-Logo.svg", width: 55%))
#let cover-footer = pad(bottom: 0.6cm, stack(
  spacing: 8pt,
  line(length: 100%, stroke: 2pt + navy),
  align(right, text(16pt, fill: navy)[(256) 508-7101 #h(1.2em) | #h(1.2em) cedsi.com]),
))
#let logo(width) = image("/Pictures/CE-Logo.svg", width: width * 1.6)
