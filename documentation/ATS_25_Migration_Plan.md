# ATS 25 Migration Plan

Moving the report catalog from NETA ATS 2021 to ATS 2025.

**Sources**
- `documentation/ANSI NETA ATS-2025_Final.pdf` (296 pages, the full standard). This is now the source of truth.
- `Blank Test Forms ATS 25/` (13 .xlsx test sheets + a May 2025 backup zip). Useful for form layout, but see section 5: two of the sheets contain errors.

---

## 1. Where things stand

**Six ATS 25 reports are built and shipping** (web + offline Electron app):

| NETA | Component | V&M items: standard vs component |
|---|---|---|
| 7.1.1 | `SwitchgearSwitchboardAssembliesATS25Report` | 20 / 20, one bad cross-reference (see 4.1) |
| 7.1.2 | `PanelboardAssembliesATS25Report` | 12 / 12, clean |
| 7.2.1.1 | `SmallLowVoltageDryTypeTransformerATS25Report` | 8 / 8, clean |
| 7.2.2 | `LiquidFilledXfmrATS25Report` | 20 / **18**, two items missing (see 4.2) |
| 7.6.1.1.1 | `LVMoldedCaseCircuitBreakerATS25Report` | 7 / 7, clean |
| 7.22.1 | `EmergencySystemsEngineGeneratorATS25Report` | 4 / 4, clean |

Sheets in the folder needing **no** work: the second Panelboard copy (same form, different sample data), `LV Circuit Breaker ATS25.xlsx` (same form as LV Molded Case with an `MA` trip type, already supported by the built component), and `back-up 5-23-25.zip` (backup of four already-built sheets).

## 2. Ground rule: relabeling is not migrating

Renaming "ATS 21" to "ATS 25" was considered and rejected. Verified against the standard:

- Switchgear 7.1.1 Visual & Mechanical: **14 items in the ATS 21 component, 20 in ATS-2025**. New items include torque-wrench verification of bolted connections, instrument transformer inspection per 7.10, surge arrester inspection per 7.19, control power transformers, and thermographic survey per Section 9.
- Surviving items were reworded, not just renumbered.
- The 2025 forms are built around NETA clause IDs (`7.1.1.A.1`, `7.4.A.5`) that do not exist anywhere in the 2021 components.

A relabeled report would have a tech complete 14 inspection items and sign a document asserting a 20-item standard. Every ATS 25 report gets built from the standard.

## 3. Verification method

`pdftotext -layout` on the standard, then a parser that pulls each section's `A. Visual and Mechanical Inspection` list and diffs it against the `id` / `description` pairs in the corresponding component. 62 sections parsed. Two parser caveats worth knowing if this is re-run:

- Section headers use a single space in some sections and multiple in others.
- The `B.` heading is not always "Electrical Tests". 7.22.1 uses "Electrical **and Mechanical** Tests", which silently overruns the A-list if the parser matches on the full heading.

## 4. Defects in shipped ATS 25 reports

### 4.1 Switchgear 7.1.1.A.17 has the wrong NETA cross-reference (fix first)
`SwitchgearSwitchboardAssembliesATS25Report.tsx:455` reads:

> "Visual/mechanical inspection of instrument transformers per Section **7.19**."

The standard and the source Excel sheet both say **Section 7.10**. 7.19 is surge arresters, which is item A.18. Item 18 appears to have been copy-pasted over item 17 without changing the reference. Both items currently point at 7.19.

### 4.2 Liquid Filled Xfmr 7.2.2 is missing two items
The component has 18 of the standard's 20. Numbering of the items it does have is correct, so these are omissions rather than a misalignment:

- **A.4** `*Test dew point of tank gases.`
- **A.20** `*Perform thermographic survey in accordance with Section 9.`

Both are optional (asterisked) tests, but they belong on the form.

### 4.3 Switchgear 7.1.1.A.19 is missing its sub-items
The component carries the parent text "Inspect control power transformers." but none of the standard's three sub-items (physical damage / cracked insulation / tightness; primary and secondary fuse ratings match drawings; drawout disconnecting contacts, grounding contacts, and interlocks). Decide whether sub-items are in scope for the form generally; 7.1.1.A.10 has the same structure.

### 4.4 Item text is abbreviated throughout
Most built reports shorten the standard's wording. Mostly harmless, but some abbreviations drop substantive content. `7.1.1.A.9` is the clearest case: the component omits both the "or in accordance with 7.1.1.B.1" alternative method and the "In the absence of manufacturer's data, use Table 100.12" fallback. Worth a decision on whether forms carry full clause text or a house short form.

## 5. Defects in the AMP test sheets

The sheets are not reliable as a sole source. Building straight from them propagates these:

**`7.10.1 Current Transformer Test Sheet ATS 25.xlsx`** (8 items, standard has 9)
- `A.6` reads "Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1." The standard's A.6 is the calibrated torque-wrench item with the Table 100.12 fallback. The sheet's text does not correspond to any A-item in the standard.
- `A.9` (`*Perform thermographic survey in accordance with Section 9.`) is absent.

**`7.10.2 Voltage Transformer Test Sheet ATS 25.xlsx`** (9 items, standard has 11)
- Same wrong `A.6` text as above, additionally mis-numbered as `A.6.1`.
- `A.10` (`Perform as-left tests.`) is absent.
- `A.11` (`*Perform thermographic survey in accordance with Section 9.`) is absent.

**`7.4 Metal Enclosed Busways Test Sheet ATS 25.xlsx`** matches the standard on all 10 items. Only nit: sheet A.2 says "physical, electrical, and mechanical condition", the standard says "physical and mechanical condition".

Both CT and VT sheets also append "and specifications" to A.1 where the standard says only "with drawings."

**Recommendation:** build from the standard, use the sheets for layout and for the electrical test tables (which the standard does not lay out). Send the CT and VT sheets back for correction.

## 6. Build queue

Four reports, in this order.

### 6.1 Current Transformer, 7.10.1 (start here)
Smallest; use it to confirm the pattern.
- **9** V&M items per the standard, not the sheet's 8. Take A.6 and A.9 from the standard.
- Layout from sheet: Nameplate (phase/neutral), CT Identification (A/B/C/N serial + ratio), Ratio & Burden, IR primary-to-ground and secondary-to-ground @ 1000V with Table 100.5 criteria, Test Equipment, Comments.
- Supersedes `12-Current Transformer Test ATS`.

### 6.2 Voltage Transformer, 7.10.2
- **11** V&M items per the standard, not the sheet's 9.
- Layout from sheet: Nameplate, Fuse Data, Fuse Resistance (as found / as left), Ratio & Burden, IR primary-to-ground / secondary-to-ground / primary-to-secondary @ 1000V, Table 100.5, Test Equipment, Comments.
- Sheet ships a TCF tab (137 rows); reuse the existing `getTCF` helper rather than embedding a new table.
- Supersedes `Potential Transformer ATS`.

### 6.3 Metal Enclosed Busways, 7.4
- 10 V&M items; sheet and standard agree.
- Bus Resistance (End to End plus joints JP1 to JP12, A/B/C/N/G in microohms, <50% deviation), IR across 9 combinations (A-G, B-G, C-G, A-B, B-C, C-A, A-N, B-N, C-N) @ 5000V with TCF, Table 100.1 criteria.
- Largest of the four.
- Supersedes `5-Metal Enclosed Busway ATS`.

### 6.4 LV Circuit Breaker, IR & DLRO Only
- Same V&M, Device Settings, Contact/Pole Resistance and IR as the full molded-case report, with the Current Sensing / injection section removed.
- **Decision needed:** a mode flag on `LVMoldedCaseCircuitBreakerATS25Report` (preferred, avoids a 3000-line fork) or its own slug.

### Open question
`Xfmr. - Applied Voltage Test.xlsx` carries no NETA clause IDs and no "ATS 25" in its filename. There is no standalone applied-voltage section in ATS-2025; dielectric withstand appears inside the transformer sections. Confirm whether this is intentionally a house form rather than a NETA-numbered one.

## 7. No longer blocked: section map for the rest

The earlier version of this plan listed ~23 reports as blocked for lack of a 2025 test sheet. The standard removes that blocker. Every remaining report maps to a section, with the V&M item count verified from the PDF:

| Current report | NETA 2025 section | V&M items |
|---|---|---|
| 2-Large Dry Type Xfmr ATS 21 | 7.2.1.2 Transformers, Dry-Type, Air-Cooled, Large | 12 |
| 2-Oil Xfmr. Inspection and Test ATS 21 | 7.2.2 Transformers, Liquid-Filled | 20 |
| 3-Low Voltage Cable Test ATS | 7.3.2 Cables, Low-Voltage, **1,000-Volt Maximum** | 8 |
| 4-MV Cable VLF (all variants) | 7.3.3 Shielded Cables, Medium- and High-Voltage | 10 |
| 6-Low Voltage Switch ATS | 7.5.1.1 Switches, Air, Low-Voltage | 13 |
| 23-Medium Voltage Switch | 7.5.1.2 Switches, Air, Medium-Voltage, Metal-Enclosed | 14 |
| 7-MV Way Switch (OIL) ATS 21 | 7.5.2 Switches, Oil, Medium-Voltage | 14 |
| Medium Voltage Way Switch (SF6) | 7.5.4 Switches, SF6, Medium-Voltage | 15 |
| 8-LV CB Electronic Trip ATS (both injection variants) | 7.6.1.2 Circuit Breakers, Low-Voltage, Power | 16 |
| 9-Medium Voltage Circuit Breaker ATS | 7.6.1.3 Air (19) or 7.6.3 Vacuum (16) | 19 / 16 |
| Relay Test Report | 7.9.1 Electromechanical/Solid-State (5) or 7.9.2 Microprocessor (11) | 5 / 11 |
| Grounding System MASTER | 7.13 Grounding Systems | 3 |
| Ground Fault Trip Test Report | 7.14 Ground-Fault Protection Systems, Low-Voltage | 7 |
| 35-Automatic Transfer Switch ATS | 7.22.3 Emergency Systems, Automatic Transfer Switches | 11 |

Two notes from this map:

- **7.3.2 changed scope in 2025**, from "600-Volt Maximum" to "1,000-Volt Maximum". The PDF's own table of contents still says 600-Volt while the section body says 1,000-Volt; the body governs. This affects which cable report applies to a given job.
- **9-Medium Voltage Circuit Breaker** and **Relay Test Report** each map to two sections. These are currently one report apiece and probably need splitting, matching how NETA separates them.

### Sections in ATS-2025 with no report at all

Not part of this migration, but worth knowing the catalog has gaps against the current standard: 7.25 Fiber-Optic Cables (4), 7.26 Electric Vehicle Charging Systems (8), 7.27 Arc Energy Reduction Systems, 7.28 Battery Energy Storage Systems (9), 7.29 Solar Photovoltaic Systems (7), 7.30 Wind Turbine Systems. BESS had a dedicated working group for this edition.

## 8. Per-report checklist

Touchpoints, traced from `small-lv-dry-type-transformer-ats25`:

1. `src/components/reports/<Name>ATS25Report.tsx` (new component)
2. `src/App.tsx` route: `/jobs/:id/<slug>/:reportId?`
3. `src/components/reports/reportMappings.ts` (slug to display name)
4. `src/components/jobs/JobDetail.tsx` (asset picker and slug maps, ~4 sites)
5. `src/components/reports/ReportApprovalWorkflow.tsx`
6. `src/lib/reportEvaluations.ts` (PASS/FAIL)
7. `Database Scripts/Setup & Configuration/create_<table>_reports.sql`
8. `electron/renderer/reportRegistry.tsx`, regenerated via `scripts/gen-report-registry.mjs` (do not hand-edit)
9. `src/docs/content/reports/catalog.md`

Proposed slugs and tables:

| Report | Slug | Table |
|---|---|---|
| 7.10.1 CT | `current-transformer-ats25` | `current_transformer_ats25_reports` |
| 7.10.2 VT | `voltage-transformer-ats25` | `voltage_transformer_ats25_reports` |
| 7.4 Busway | `metal-enclosed-busway-ats25` | `metal_enclosed_busway_ats25_reports` |

Conventions to hold to:
- Display name is `<NETA section> <Title> ATS 25`, matching the existing six.
- New table per report. No migration of 2021 data into 2025 tables: a signed report stays under the edition it was tested to.
- **Never delete the ATS 21 component.** Saved reports in the old tables need it to open.
- The offline Electron app needs no schema work; its SQLite store creates tables on demand.
- Verify each new component against the standard with the section-diff method in part 3 before it ships.

## 9. After the build: fix the picker

The ATS 21 and ATS 25 reports currently sit side by side in one flat list, and the 2021 switchgear entry is named `1-Switchgear, ...` so the leading `1-` sorts it above the `7.1.1` ATS 25 entry. Techs pick the first thing they see.

- Add `standard: "ATS21" | "ATS25" | "MTS"` and `legacy?: true` to `ReportEntry`, sourced from `scripts/gen-report-registry.mjs` (the registry file is generated).
- In `electron/renderer/ReportListPage.tsx`, hide legacy entries behind a "Show superseded (ATS 21)" toggle and badge the rest. Routes stay live so old reports open by deep link.
- Drop the `1-` / `2-` numeric prefixes that distort ordering.

## 10. Housekeeping

The standard PDF and the `Blank Test Forms ATS 25/` sheets are not covered by `.gitignore`, so they will be committed. Two things to decide:

- **Licensing.** The copyright page permits purchasers to reproduce Section 7 on a "cut and paste" basis for the equipment being tested, provided the source is identified in writing. That covers using the clause text in our forms. It does not obviously cover redistributing the whole 296-page PDF, which matters because ampOS ships as per-buyer white-label instances (see `documentation/NEW_INSTANCE_PLAYBOOK.md`).
- **Attribution.** If clause text appears on generated reports, the forms should identify ANSI/NETA ATS-2025 as the source to satisfy the reproduction terms.
