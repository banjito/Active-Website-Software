// PROJECT DEFINITIONS
// ampOS fills these in from the job when it builds the PDF. The values after
// each name are only used when this template is compiled by hand.

#let field(key, fallback) = sys.inputs.at(key, default: fallback)

#let reporttypetitle = field("reporttypetitle", "Arc Flash Hazard Analysis")
#let projectnumber = field("projectnumber", "26045")
#let mydate = field("mydate", "May 5, 2026")
#let sitename = field("sitename", "Cook's Pest Control IT Department")
#let sitelocation = field("sitelocation", "Decatur, AL")
#let preparedfor = field("preparedfor", "Cook's Pest Control Property Management")
#let preparedby = field("preparedby", "AMP Quality Energy Services")
#let preparedbyaddress = field("preparedbyaddress", "P.O. Box 1725, Decatur, AL 35602")
#let utilityprovider = field("utilityprovider", "Decatur Utilities")

// Arc flash findings: buses in each PPE category. Shared by the Executive
// Summary and the Arc Flash Study, so the two tables can't disagree.
#let busescat0 = field("busescat0", "9")
#let busescat3 = field("busescat3", "5")
#let busescat4 = field("busescat4", "5")
#let busesdanger = field("busesdanger", "0")

// How many pages an SKM PDF has. ampOS sets this when the PDF is uploaded.
// A PDF with no count is left out and only its title page prints, like the
// commented-out \includepdf lines in the LaTeX version.
// By hand: typst compile main.typ --input "pages:/PDF/TCCs.pdf=5"
#let pdf-page-count(path) = int(sys.inputs.at("pages:" + path, default: "0"))

// The blank border around an SKM PDF's pages: left, right, top and bottom, as
// fractions of the page. ampOS measures it when the PDF is uploaded, and the
// report trims it off so the tables fill the page.
// By hand: --input "margins:/PDF/TCCs.pdf=0.02,0.02,0.03,0.03"
#let pdf-margins(path) = sys.inputs.at("margins:" + path, default: "0,0,0,0").split(",").map(float)
