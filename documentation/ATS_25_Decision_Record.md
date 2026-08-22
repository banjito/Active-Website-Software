# ATS 25 Decision Record

A question about one switchgear report in the offline app turned into a catalog-wide migration. This is the reasoning behind it: what we found, what we ruled out and why, and the calls still open.

Companion to `ATS_25_Migration_Plan.md`, which holds the operational spec (section map, per-report checklist, slugs and tables). This file holds the *why*.

| | |
|---|---|
| Date | 21 August 2026 |
| Source of truth | ANSI/NETA ATS-2025 |
| Reports built | 6 of ~34 |
| Defects found | 3 in shipped code, 2 in test sheets |

---

## The short version

The offline app never had its own switchgear report to fix. An ATS 25 version already existed and was already shipping. And once the full standard turned up, the whole remaining catalog stopped being blocked.

**If you read nothing else:** relabeling "ATS 21" to "ATS 25" is not an option, and we now have proof rather than an opinion. Separately, verification against the standard found a wrong NETA cross-reference in a report that is **already in techs' hands**, and two of AMP's own ATS 25 test sheets carry errors that would have been copied straight into new reports.

---

## 1. How we got here

Each step changed what the job actually was, so the order matters.

**1. The offline app has no reports of its own.**
It renders the same components from `src/components/reports/` unchanged, wired through `electron/renderer/reportRegistry.tsx`, which is generated from `src/App.tsx` by `scripts/gen-report-registry.mjs`. There was no separate offline report to update. Anything we fix lands in both places at once.

**2. The ATS 25 switchgear report already existed.**
`SwitchgearSwitchboardAssembliesATS25Report.tsx`, 3,310 lines, clause IDs `7.1.1.A.1` through `.20`, already registered and already present in the committed bundle. The real complaint was discoverability: both editions sit in one flat list, and the 2021 entry is named `1-Switchgear, ...`, so the leading `1-` sorts it above the `7.1.1` entry. Techs pick the first thing they see.

**3. Relabeling was proposed, then ruled out.**
The intuition was that only the title needed to change. Checking the one pair where both editions existed disproved it, and the standard later confirmed it outright. See part 2.

**4. `Blank Test Forms ATS 25/` surfaced.**
Thirteen Excel test sheets. Six matched reports already built; three needed no work at all (a duplicate Panelboard copy, an `MA`-trip variant the existing component already handles, and a backup zip). Four were genuinely new and buildable.

**5. The full standard arrived.**
296 pages of ANSI/NETA ATS-2025. This is the turning point: the ~23 reports previously blocked for lack of a test sheet are no longer blocked, because the standard is the authority the sheets were only ever approximating.

**6. Verification found defects in shipped code.**
Extracting the standard's text and diffing all 62 parsed sections against the built components caught three problems in reports already in the field, and two bad test sheets. That check is now part of the build process rather than a one-off.

---

## 2. Why relabeling was rejected

Switchgear 7.1.1 is the only equipment type where both editions exist in our codebase, which makes it the honest test case. The Visual & Mechanical section is not the same section with a new year on it.

| | ATS 21 component | ATS 25, verified against the standard |
|---|---|---|
| V&M items | **14** | **20** |
| Clause IDs | none anywhere in the file | `7.1.1.A.1` through `.20` |
| Header string | `NETA - ATS 7.1` | `NETA - ATS 7.1.1` |
| Table | `switchgear_reports` | `switchgear_switchboard_ats25_reports` |

The six additions are not cosmetic: torque-wrench verification of bolted connections, instrument transformer inspection per 7.10, surge arrester inspection per 7.19, control power transformers, and thermographic survey per Section 9.

**The stake.** Under a relabel, a tech completes 14 inspection items and signs a document asserting a 20-item standard. Surviving items were also reworded, not merely renumbered:

- ATS 21: "Inspect physical, electrical, and mechanical condition **of cords and connectors**."
- ATS 25: "Inspect physical, electrical, and mechanical condition."

That is your company name on the report, not ours.

---

## 3. What wins when sources disagree

They do disagree, in both directions, so the precedence has to be explicit. The test sheets are still valuable, but for layout and the electrical test tables the standard does not specify, not for clause content.

1. **ANSI/NETA ATS-2025.** Clause IDs, item counts, item wording. Always authoritative.
2. **AMP test sheets.** Form layout, nameplate fields, test tables, criteria columns, equipment lists.
3. **Existing components.** Code patterns and plumbing only. Never a reference for clause content.

---

## 4. Verification results: all six shipped reports

Item counts are the standard's `A. Visual and Mechanical Inspection` list against what each component actually renders.

| NETA | Component | Std | Built | Status |
|---|---|---|---|---|
| 7.1.1 | Switchgear & Switchboard Assemblies | 20 | 20 | Bad cross-reference |
| 7.1.2 | Panelboard Assemblies | 12 | 12 | Clean |
| 7.2.1.1 | Small LV Dry Type Transformer | 8 | 8 | Clean |
| 7.2.2 | Liquid Filled Transformer | 20 | **18** | Two items missing |
| 7.6.1.1.1 | LV Molded Case Circuit Breaker | 7 | 7 | Clean |
| 7.22.1 | Emergency Systems, Engine Generator | 4 | 4 | Clean |

### Method

`pdftotext -layout` on the standard, then a parser that pulls each section's `A.` list and diffs it against the `id` / `description` pairs in the corresponding component. Two parser caveats if this is re-run:

- Section headers use a single space in some sections and multiple in others.
- The `B.` heading is not always "Electrical Tests". 7.22.1 uses "Electrical **and Mechanical** Tests", which silently overruns the A-list if the parser matches on the full heading.

---

## 5. Defects in reports already in the field

### 5.1 Switchgear 7.1.1.A.17 cites the wrong NETA section (fix first)

`SwitchgearSwitchboardAssembliesATS25Report.tsx:455` reads:

> "Visual/mechanical inspection of instrument transformers per Section **7.19**."

The standard and AMP's own source sheet both say Section 7.10:

> "Perform visual and mechanical inspection of instrument transformers in accordance with Section **7.10**."

7.19 is surge arresters, which is item A.18. Item 18 looks to have been pasted over item 17 without changing the reference, so both items currently point at 7.19. The Excel sheet is correct here; the error was introduced in the component.

### 5.2 Liquid Filled Transformer is missing two items

The component carries 18 of the standard's 20. Numbering on the 18 it does have is correct, so these are straight omissions rather than a misalignment:

- `A.4` Test dew point of tank gases
- `A.20` Perform thermographic survey in accordance with Section 9

Both are optional tests under the standard, but they belong on the form.

### 5.3 Switchgear 7.1.1.A.19 is missing its sub-items

The component has the parent text "Inspect control power transformers" but none of the standard's three sub-items covering physical damage and cracked insulation, fuse ratings matching drawings, and drawout disconnecting contacts. `7.1.1.A.10` has the same nested structure, so this is a general question about whether sub-items belong on our forms.

### 5.4 Clause text is abbreviated throughout

Most built reports shorten the standard's wording. Usually harmless, occasionally not. `7.1.1.A.9` is the clearest case: the component drops both the "or in accordance with 7.1.1.B.1" alternative method and the "in the absence of manufacturer's data, use Table 100.12" fallback. A tech reading only the form would not know the fallback exists.

---

## 6. Two of the test sheets are wrong

This is why the precedence ladder matters. Had we built from the sheets as originally planned, both of these would have shipped.

**`7.10.1 Current Transformer Test Sheet ATS 25.xlsx`** (8 items, standard has 9)
- `A.6` reads "Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1", which corresponds to no A-item in the standard. The real `A.6` is the calibrated torque-wrench item with the Table 100.12 fallback.
- `A.9`, the thermographic survey, is absent entirely.

**`7.10.2 Voltage Transformer Test Sheet ATS 25.xlsx`** (9 items, standard has 11)
- Same wrong `A.6` text, additionally mis-numbered as `A.6.1`.
- `A.10` (perform as-left tests) and `A.11` (thermographic survey) are both absent.

**`7.4 Metal Enclosed Busways Test Sheet ATS 25.xlsx`** (10 items, matches)
- Matches the standard on all ten. One wording nit: sheet says "physical, electrical, and mechanical condition", standard says "physical and mechanical condition".

Both CT and VT sheets also append "and specifications" to `A.1` where the standard says only "with drawings".

---

## 7. Notable mappings in what's left

Every remaining 2021-era report now has a home in the standard with a verified item count. The full table is in the plan doc; these are the entries that carry a decision or a surprise.

| Current report | ATS 2025 section | Items | Note |
|---|---|---|---|
| 3-Low Voltage Cable Test ATS | 7.3.2 | 8 | Scope widened from 600V to 1,000V |
| 9-Medium Voltage Circuit Breaker ATS | 7.6.1.3 / 7.6.3 | 19 / 16 | Air vs Vacuum. Likely needs splitting |
| Relay Test Report | 7.9.1 / 7.9.2 | 5 / 11 | Electromechanical vs microprocessor. Likely needs splitting |
| 8-LV CB Electronic Trip ATS | 7.6.1.2 | 16 | Both injection variants map here |
| 35-Automatic Transfer Switch ATS | 7.22.3 | 11 | Straightforward |
| Grounding System MASTER | 7.13 | 3 | Smallest section in the standard |

**Worth knowing separately.** ATS-2025 contains six sections we have no report for at all: Fiber-Optic Cables, Electric Vehicle Charging Systems, Arc Energy Reduction Systems, Battery Energy Storage Systems, Solar Photovoltaic Systems, and Wind Turbine Systems. BESS had a dedicated working group for this edition. That is a services gap against the current standard, not a migration item, but worth seeing while the catalog is open.

---

## 8. Open decisions

None of these block starting on 7.10.1 Current Transformer, but each shapes what gets built.

**Policy: full clause text on forms, or a house short form?**
Affects every report, existing and future, so worth settling once. Full text is defensible and complete but makes forms long. Short form is readable in the field but has already dropped substantive content once, at `7.1.1.A.9`.
*Suggestion:* full clause text where the item carries a criterion, fallback, or cross-reference; short form permitted only for pure inspection items.

**Build: IR & DLRO Only as a mode flag or its own slug?**
The short LV Circuit Breaker form is the full molded-case report with the current-sensing and injection sections removed. Everything else is identical.
*Suggestion:* a mode flag on `LVMoldedCaseCircuitBreakerATS25Report`. Forking 3,000 lines to delete one section means fixing every future bug twice.

**Question: what is the Applied Voltage sheet?**
`Xfmr. - Applied Voltage Test.xlsx` has no NETA clause IDs and no "ATS 25" in its filename. There is no standalone applied-voltage section in ATS-2025; dielectric withstand appears inside the transformer sections. Deliberately a house form, or an unfinished draft?

**Scope: split the MV Circuit Breaker and Relay reports?**
Each is currently one report but maps to two NETA sections with materially different item counts. Keeping them merged means one form that overserves one case and underserves the other.
*Suggestion:* split both, matching how NETA separates them. Decide before building, since it changes slugs and tables.

**Legal: should the standard PDF live in the repo?**
Neither the 296-page PDF nor the test sheets folder is covered by `.gitignore`, so both will be committed. The copyright page permits purchasers to reproduce Section 7 on a "cut and paste" basis for the equipment being tested, provided the source is identified in writing. That covers clause text in our forms. It is less clear on redistributing the whole document, which matters because ampOS ships as per-buyer white-label instances.
*Suggestion:* decide whether the PDF is tracked, and add an ANSI/NETA ATS-2025 attribution line to generated reports that carry clause text.

---

## 9. Recommended sequence

Ordered so the riskiest thing already in the field gets fixed before anything new is added on top of it.

1. **Fix the 7.19 cross-reference and the two missing Liquid Filled items.** Small, contained, and it corrects reports techs are filling out right now.
2. **Send the CT and VT sheets back for correction.** Not a blocker, since the standard governs, but the sheets should not stay wrong.
3. **Build 7.10.1 Current Transformer.** Smallest of the four, and it proves the pattern before it is repeated.
4. **Then 7.10.2 Voltage Transformer and 7.4 Metal Enclosed Busways.** Same pattern, larger forms. Busway is the biggest of the four.
5. **Fix the report picker.** Add a `standard` flag to the registry, hide superseded ATS 21 entries behind a toggle, drop the `1-` prefixes that break sorting. Worth doing once several ATS 25 reports exist rather than now.
6. **Work the remaining catalog by section.** Roughly 23 reports, all mapped, all verifiable against the standard.

---

## Standing rule

Never delete an ATS 21 component. Saved reports in the old tables need it to open, and a signed report stays under the edition it was tested to.
