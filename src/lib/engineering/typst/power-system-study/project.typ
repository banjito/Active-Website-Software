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
