// Arc Flash Hazard Analysis report: the Typst version of "00 main.tex".
// Job details live in project.typ; the look lives in style.typ.
//
// Compile by hand:  typst compile main.typ
// Try other values: typst compile main.typ --input sitename="Plant 2"
#import "style.typ": *
#show: report

#include "01-report-cover.typ"

#include "02-executive-summary-cover.typ"
#study("Executive Summary", numbered: false)[#include "03-executive-summary.typ"]

#include "04-short-circuit-study-cover.typ"
#study("Short Circuit Study")[#include "05-short-circuit-study.typ"]

#include "06-protective-device-coordination-cover.typ"
#study("Protective Device Coordination")[#include "07-protective-device-coordination.typ"]

#include "08-arc-flash-study-cover.typ"
#study("Arc Flash Study")[#include "09-arc-flash-study.typ"]
