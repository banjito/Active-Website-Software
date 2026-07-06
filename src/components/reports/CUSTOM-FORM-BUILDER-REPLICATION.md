# Replicating Reports in the Custom Form Builder — Operational Playbook

Turn a hard-coded report (`src/components/reports/*.tsx`) into a Custom Form template at
`https://ampos.io/custom-forms/builder`. This is the distilled, token-efficient procedure
(learned the slow way — follow it and skip the trial-and-error).

> **Golden rules:** read the source first → add sections in report order → **Preview to verify**
> → **Save every 1–2 sections**. Content survives extension reconnects; a full page reload
> reverts *unsaved* work.

---

## 1. Extract the spec from the `.tsx` (do this before touching the browser)

Read the report file and pull out, in render order:

| What | Where in the source |
|------|---------------------|
| **Title** | print-header `<h1>` (e.g. "3-Set Low Voltage Cable Test Report (ATS)") |
| **NETA section** | print-header badge / `README.md` table (e.g. `7.3.1`) |
| **Sections & order** | the `<h2>` section headers in the JSX return |
| **Fields / columns per section** | the inputs/selects in each section; the `formData` interface |
| **Dropdown options** | the `const ..._OPTIONS = [...]` arrays |
| **# of test rows/sets** | `Array.from({ length: N })` / `TOTAL_ROWS` |
| **Formulas** | temp-correction logic (`applyTCF`, `getTCF`) → maps to `{...}*{JD.tcf}` |

Note: some report files have **stubbed sections** ("to be implemented"). Use the sibling
rendered report (e.g. the 12/20-set variant) or `reportMappings.ts` for the real content.

---

## 2. Report section → builder component map

| Report section | Builder component | Notes |
|----------------|-------------------|-------|
| Job Information | **Job Information** (Info) | Fixed 5×2: customer, siteAddress, jobNumber, user, date, technicians, identifier, substation, eqptLocation, temp°F/°C/humidity. Exposes `{JD.tcf}`. |
| Cable/nameplate/key-value data | **Custom Table** (Other), or **Nameplate Data** / **Extended Nameplate** | For a label→value strip use Custom Table: N columns × 1 row, uncheck add/remove rows. |
| Visual & Mechanical Inspection | **Visual & Mechanical Inspection** (Inspection) | Checklist items (ID + description) + Result dropdown (Satisfactory/…/N.A.). Edit "Checklist Items". |
| Insulation-resistance / test-reading tables | **Insulation Resistance Test** (Testing) | Ships with A-G/B-G/C-G + corrected. Extend to full reading set (see §5). |
| Other measurement tables | Winding Resistance, Contact/Pole Resistance, TTR, Power Factor, Applied Voltage, Primary/Secondary Injection, etc. | Pick the closest Testing component; else Custom Table. |
| Test Equipment Used | **Test Equipment Used** (Equipment) | Equipment / Serial / AMP ID / Cal Date, w/ field-equipment lookup. Set rows=1 for a single instrument. |
| Comments | **Comments** (Other) | Single free-text area. |

**Full palette** (categories): Info: Job Information, Temperature Correction, Nameplate Data,
LV Breaker Nameplate, Extended Nameplate. Testing: Insulation Resistance Test, Shield Continuity,
Withstand, Voltage/Current/Resistance Readings, Contact/Pole Resistance, Turns Ratio (TTR),
Dielectric Absorption, Polarization Index, Winding Resistance, Ratio & Polarity (CT/PT),
Secondary Injection/Trip, Oil/DGA, Power/Dissipation Factor, Capacitance, Contact Timing,
Applied Voltage, Insulation by Winding, Trip Unit Settings, Device Settings (As Found/As Left),
Primary/Secondary Injection (LV Breaker). Inspection: Visual & Mechanical Inspection.
Equipment: Test Equipment Used, Fuse Data. Other: Comments, Custom Table, Conditional Table,
Custom Text Field.

---

## 3. Builder mechanics (fast facts)

- **Title/NETA:** top of builder. NETA is a combobox — type the value, then click away (a
  "Save '7.3.3'" chip appears; clicking elsewhere commits it). Verify the title didn't drop a
  word (fast typing after focus can).
- **Add a section:** drag the component card from the left palette onto the canvas. The section
  is inserted **where the cursor drops** → usually mid-list. To append at the end, drop into the
  empty canvas *below the last section*; otherwise reorder afterward (§6).
- **Select/edit a section:** click its gear icon → right-hand **Edit Section** panel.
  - **Section Title** renames it; **Reference code** auto-derives (`JD`, `CD`, `VAM`, `ETI`,
    `TEU`, `COM`). Referenced in formulas as `{REF.C<n>}` (column n) / `{REF.C<n>.R<r>}` (cell).
  - **Number of Rows**; uncheck *Allow adding/removing rows* for fixed tables. (Triple-click the
    field before typing — `cmd+a`+Backspace can leave a stray digit, e.g. `11`.)
  - **Columns** (bottom): `+ Add Column`, `Even %`. Each column is an accordion → **Name**,
    **Column width**, **Cell value** (User entry / Populate from field / Calculate from formula),
    **Input type** (Text / dropdown / …).
- **Save:** 💾 top-right → returns to the templates list (the form gets a URL id and
  auto-creates on first edit). Re-open with the ✏️ pencil on its card.
- **Preview:** eye icon / "Preview" button on the card → renders the real form. Formula columns
  show computed values (empty reading × TCF = **`0`** = formula is wired correctly).

---

## 4. Standard procedure

1. **Create Template** → set Title + NETA.
2. Add **Job Information** first (drag to canvas). Rename if needed.
3. Add remaining sections **in report order**, dropping each into empty canvas below the last one.
4. Configure each section: title, rows, columns, dropdowns, formulas.
5. **Preview** → sanity-check order, columns, and that corrected columns compute.
6. **Save** (checkpoint) after each section or two.

---

## 5. Building a wide reading table (e.g. Insulation Resistance) — the crux

Example: LV cable "Electrical Tests" = 26 columns.

- Target layout: `From, To, Config, Size` → 10 phase readings
  `A-G,B-G,C-G,N-G,A-B,B-C,C-A,A-N,B-N,C-N` → their ten **20 °C corrected** columns →
  `Cont., Results`.
- **Column-reference numbering is positional and fixed** — a corrected column references its
  reading by position, so decide final order first. With readings at C5–C14:
  - `A-G (20°C)` at C15 → formula `{ETI.C5}*{JD.tcf}`
  - `B-G (20°C)` → `{ETI.C6}*{JD.tcf}` … `C-N (20°C)` → `{ETI.C14}*{JD.tcf}`
- **Per corrected column:** expand → set **Cell value → Calculate from formula** → type
  `{ETI.C<reading>}*{JD.tcf}`. (Lowercase `{JD.tcf}` matches the shipped component; `{JD.TCF}`
  also works.) The `°` types fine.
- Add all columns first (`+ Add Column`), then `Even %`, then rename/format each.
- **Reusing shipped columns:** the Insulation Resistance component's first column is a
  **Test Type dropdown** and its A-G/B-G/C-G-corrected columns are **formulas**. If you repurpose
  positions, switch their **Cell value** back to *User entry* and set **Input type = Text**
  (e.g. the `From` column otherwise renders as a dropdown).

---

## 6. Reordering sections

Drag the **⠿ handle** at the left of a section's title bar. Dropping **over a lower** section
moves it **down**; **over an upper** section moves it **up** (it can jump 1–2 positions depending
on drop depth). Verify order cheaply with `get_page_text` (lists every section + column).

---

## 7. Gotchas (each one cost real time)

- **Chrome extension disconnects frequently.** Keep browser batches small; save often. On a
  disconnect: `list_connected_browsers` → `select_browser` → screenshot. State is preserved
  across reconnects **as long as the page doesn't reload**.
- **Window resizes between reconnects** (~840 ↔ ~1568 px) and shifts every coordinate.
  **Re-screenshot before coordinate clicks**; never reuse coordinates across a reconnect.
- **Drops land under the cursor**, not at the end — plan to reorder or drop into empty canvas.
- **Renaming a column doesn't change its internal key** (footer still says "Column N"). Harmless.
- **Near-bottom textareas/radios get missed** — if a corrected column silently stays *User entry*,
  scroll it up so the whole editor is on-screen and redo. Always Preview to confirm.
- **Save navigates away** → you must re-open to continue; budget for it.

---

## 8. Efficiency tips (fewer tokens / round-trips)

- **`get_page_text`** for definitive audits of section order and column names — far cheaper than
  screenshotting the whole list.
- **Position the target column near the top of the Edit panel** before expanding, so name +
  cell-value radios + formula textarea are all visible → do it in **one `browser_batch`** (expand →
  rename → click "Calculate from formula" → type formula → collapse) with no mid-scroll.
- **Batch stable, repeated edits** (e.g. renaming several collapsed columns at known y-positions)
  into a single `browser_batch`.
- Verify formulas in bulk via **Preview** (corrected cols show `0`) instead of re-opening each.

---

## 9. Per-report checklist (copy per report)

```
Report: __________________________  Source: src/components/reports/________.tsx
[ ] Title + NETA set
[ ] Sections added in order: _______________________________________
[ ] Each table: rows set, add/remove toggled, columns named
[ ] Dropdown options match source OPTIONS arrays
[ ] Formula columns: Calculate-from-formula + {REF.Cn}*{JD.tcf}, verified in Preview
[ ] Test Equipment + Comments present
[ ] Section order matches report (Preview)
[ ] Saved
```

### Worked example — `3-LowVoltageCableATS.tsx`
Title `3-Set Low Voltage Cable Test Report (ATS)`, NETA `7.3.3`. Sections:
Job Information → **Cable Data** (Custom Table, 7 cols ×1 row: Tested From, Manufacturer,
Conductor Material, Insulation Type, System Voltage, Rated Voltage, Length) →
**Visual & Mechanical Inspection** (7.3.1.A.1, .2.1, .3, .4, .5) →
**Electrical Tests** (Insulation Resistance Test, 26 cols per §5, 3 rows) →
**Test Equipment Used** (rows=1) → **Comments**.
