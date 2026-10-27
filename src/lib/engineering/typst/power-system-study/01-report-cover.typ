// Placeholder until "01 Report Cover.tex" is converted.
#import "style.typ": *

#cover-page[
  #v(1fr)
  #text(size: 30pt, weight: "bold", reporttypetitle)
  #v(0.5em)
  #text(size: 16pt)[#sitename \ #sitelocation]
  #v(2em)
  Project No. #projectnumber \
  #mydate
  #v(1fr)
  #text(size: 10pt)[
    *Prepared for:* #preparedfor \
    *Prepared by:* #preparedby \
    #preparedbyaddress
  ]
]
