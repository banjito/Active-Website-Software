# ampOS — Project Management Phase 2

**Test Scheduling, Project Tracker & Asset Action Refactor**

| | |
|---|---|
| **Doc owner** | Jack Lyons — Internal Systems Architect, AMP QES |
| **Requested by** | Ethan Thoenes (NETA III / EE, EIT) — email 05 Aug 2026 |
| **Status** | Draft spec — pending Ethan review |
| **Pilot site** | QTS ATL2 DC7 (Customer: M.C. Dean) — 218 assets currently loaded |
| **Reference input** | `ATL2_DC7_Set_ALL_Equipment_Dates_-_P6_DD_2026_8_3.xlsx` (P6 export, data date 03-Aug-26) |

---

## 1. Why this phase exists

Phase 1 gave ampOS an asset registry and a report skeleton: we know *what* equipment is on a site and we can attach a test report to it. What we cannot do is answer the question every project manager actually asks:

> "What are we testing this week, what's late, and what's still not even set?"

Phase 2 closes that gap. It adds a **scheduling layer** between the asset and the report — a record that says *this asset*, *this scope of work*, *this window*, *this status*. Once that record exists, the Project Tracker is just a set of views over it, and the reports we already build become the completion event at the end of a scheduled item.

Everything in this document flows from three requirements in Ethan's email:

1. A way to **schedule a test** from the asset list.
2. A new **Project Tracker tab** listing every scheduled test with status and result.
3. **Date manipulation** — including bulk shift — so a delay can be modeled in seconds instead of re-keying 40 rows.

---

## 2. What the customer schedule actually looks like

Before designing anything, it's worth reading what the attached P6 export tells us, because our data model has to survive contact with it. The file is the *set* schedule (equipment installation), but Ethan confirmed the *test* schedule arrives in the same shape with different descriptors and dates.

Observations from the file:

| Property | Value |
|---|---|
| Rows | 302 total, of which **262 are real activities** |
| Rollup rows | 1 "Total", 7 month groups, 31 week groups (indent-encoded, not a real column) |
| Date span | 03-Aug-2026 → 26-Feb-2027 (~7 months) |
| Columns | Activity ID, Activity Name, Start, Finish, Remaining Duration, Activity Count |
| Typical duration | 5 days (195 of 262 activities); range 0–26 |
| Start/finish times | Start 08:00, finish 18:00 in 218 of 246 dated rows (16:00/17:00 elsewhere) |
| Weekend activity | **Zero.** Every start and finish lands Mon–Fri |
| Milestones | 16 rows with **no start date** and a *text* finish carrying a `*` constraint flag (e.g. `04-Sep-26 17:00*`) |
| Area distribution | 8 data halls × 29 activities each (DH 1100/1150/1200/1250/2100/2150/2200/2250), plus Equipment Yard (8), AD1/AD2, BOH1/BOH2, HSE1/HSE2, FOH HSE |

Four design consequences, and these are the load-bearing ones:

- **Time-of-day is noise.** 08:00 and 18:00 are P6 calendar artifacts, not real information. We store and display **dates only**. (§5.4)
- **The calendar is working-day based.** Nothing lands on a weekend, and "5 days" means five working days. Our shift-dates feature therefore defaults to **working days**, not calendar days. Getting this wrong makes every shifted date drift onto a Saturday. (§8.3)
- **Not every row has both dates.** Milestones have finish-only, and one row (`QTS-1060.EG5`) has a real start with a text finish. The importer must not choke, and `start_date` must be nullable.
- **The work is extremely repetitive.** Eight data halls with an identical 29-activity pattern. That is a strong argument for templated scheduling and for batch operations being first-class rather than an afterthought.

---

## 3. Scope

### In scope

- **A.** Asset tab action-bar refactor + new "Schedule test" action (single and batch)
- **B.** New Project Tracker tab: table, saved views, filters, grouping
- **C.** Scheduled-test CRUD, status model, and report linkage
- **D.** Bulk date operations: set start, set finish, shift both by N days
- **E.** Data model, API, and permissions to support the above

### Deferred (Phase 2.5 / 3 — noted here so we design without painting ourselves in)

- **F.** P6 Excel import for schedules (§10 — spec'd now, built after A–E land)
- **G.** Gantt / timeline visualization
- **H.** Auto-advance of Equipment Status from imported *set* dates
- **I.** Schedule templates ("apply the standard MV switchgear test package to these 12 assets")
- **J.** Site holiday calendars and crew/resource assignment
- **K.** Customer-facing schedule export back to P6 format

---

## 4. Vocabulary

Precise terms, because "test" is currently doing about four jobs in our conversations.

| Term | Meaning |
|---|---|
| **Asset** | Existing Phase 1 entity. A physical item at a site (switchgear, breaker, transformer). May have a parent. |
| **Scheduled Test** | New Phase 2 entity. One asset + one scope of work + one date window + status. The row in the Project Tracker. |
| **Work Scheduled** | *What* we're doing. Preferably a report template reference; free text as fallback. |
| **Report Template** | Existing entity. Defines the test checklist / form for a class of work. |
| **Report** | Existing entity. The filled-out instance. Carries the PASS/FAIL/LIMITED SERVICE result. |
| **Part of** | The parent asset's identifier, when the scheduled asset is a child (e.g. `MVG-A1 VFI-01` is part of `MVG-A1 SWGR`). |
| **Activity** | A row in the customer's P6 export. Maps to zero or more Scheduled Tests. |

**On "checklists":** the subject line says *Test Scheduling & Checklists*. The checklist is not a new object — it is the report template's test list, surfaced at the schedule level. A scheduled test whose Work Scheduled points at a report template inherits that template's checklist, and completing the report satisfies it. Building a separate checklist object would create a second source of truth. If Ethan wants ad-hoc punch items per scheduled test, that's a `checklist_item` child table in Phase 3, not now.

---

## 5. Data model

Postgres flavor below; translate as needed for the ampOS DB layer.

### 5.1 Table: `scheduled_test`

```sql
CREATE TABLE scheduled_test (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES site(id),
  asset_id            UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,

  -- Work Scheduled: template preferred, free text fallback
  report_template_id  UUID REFERENCES report_template(id),
  work_scheduled_text TEXT,

  -- Dates: DATE, not TIMESTAMP. See §5.4
  start_date          DATE,
  finish_date         DATE,

  equipment_status    equipment_status_enum,            -- nullable by design
  testing_status      testing_status_enum NOT NULL
                        DEFAULT 'not_started',

  -- Result is derived from the linked report; column is a cache
  report_id           UUID REFERENCES report(id),
  result              result_enum,

  notes               TEXT,

  -- Import provenance (Phase 2.5, column added now to avoid a migration)
  source              schedule_source_enum NOT NULL DEFAULT 'manual',
  external_activity_id TEXT,
  external_batch_id   UUID,
  has_date_constraint BOOLEAN NOT NULL DEFAULT FALSE,

  created_by          UUID NOT NULL REFERENCES app_user(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT work_scheduled_present CHECK (
    report_template_id IS NOT NULL OR work_scheduled_text IS NOT NULL
  ),
  CONSTRAINT finish_after_start CHECK (
    start_date IS NULL OR finish_date IS NULL OR finish_date >= start_date
  )
);

CREATE INDEX idx_sched_site_dates   ON scheduled_test (site_id, start_date, finish_date)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_sched_asset        ON scheduled_test (asset_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sched_testing_stat ON scheduled_test (site_id, testing_status)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_sched_external ON scheduled_test (site_id, external_activity_id)
  WHERE external_activity_id IS NOT NULL AND deleted_at IS NULL;
```

### 5.2 Enums

```sql
CREATE TYPE equipment_status_enum AS ENUM (
  'not_installed', 'ready_for_testing', 'in_service', 'out_of_service'
);

CREATE TYPE testing_status_enum AS ENUM (
  'not_started', 'in_progress', 'complete',
  'on_hold', 'retest_required', 'not_required'
);

CREATE TYPE result_enum AS ENUM ('pass', 'fail', 'limited_service');

CREATE TYPE schedule_source_enum AS ENUM ('manual', 'p6_import', 'template');
```

> **Note:** Ethan's list reads "Not Require" — assuming **Not Required**. Confirm. (§13 Q1)

### 5.3 Columns we do *not* store

Substation, Identifier, Part of, Equipment Type, Building/Area are all **joined from `asset`**, never copied. If a breaker gets re-identified, the tracker must follow it. `part_of` resolves as `asset.parent_id → parent.identifier`, null when the asset has no parent.

The one exception is `result`, which *is* cached on the row. Rationale: the Project Tracker sorts and filters by result across hundreds of rows, and reaching through `report_id` on every query is a needless join. It is maintained by trigger/service hook on report save — never editable by hand when `report_id` is set.

### 5.4 Dates are dates

Store `DATE`. Do not store `TIMESTAMPTZ`.

The P6 file carries 08:00 / 18:00 stamps that mean "start of shift" and "end of shift," not real appointments. If we store timestamps, a tech in Atlanta and a PM in Decatur will eventually see different days for the same activity, and someone will be onsite on the wrong Monday. Dates are timezone-free and match how the schedule is actually discussed ("we're testing MVG-A1 the week of the 12th").

On import: `2026-08-03 08:00:00` → `2026-08-03`. `18:00` finish → same-day date. Text finish `04-Sep-26 17:00*` → `2026-09-04` with `has_date_constraint = true`.

### 5.5 Derived field: schedule state

Not stored. Computed at query time against `CURRENT_DATE`, and it is what drives the "due / past-due" view.

| State | Condition | UI |
|---|---|---|
| `complete` | `testing_status IN ('complete','not_required')` | Grey / check |
| `on_hold` | `testing_status = 'on_hold'` | Amber outline |
| `past_due` | `finish_date < today` and not complete | Red |
| `due_now` | `start_date <= today <= finish_date` and not complete | Orange |
| `upcoming` | `start_date > today` | Neutral |
| `unscheduled` | `start_date IS NULL AND finish_date IS NULL` | Dashed / grey |

`retest_required` is deliberately *not* a terminal state — a retest-required item with a past finish date should read **past due** and stay red. That's the point of the flag.

### 5.6 Status transition rules

- `testing_status` starts at `not_started`.
- Creating a report against the scheduled test → auto-advance to `in_progress` (if currently `not_started`).
- Report marked final/approved → auto-advance to `complete` and cache the result.
- Result `FAIL` does **not** auto-set `retest_required`. That's a human call — a fail can end a scope legitimately. Show a prompt, don't automate it.
- Any status is manually overridable. Log the override in the audit trail.
- `equipment_status` is fully manual in Phase 2 (auto-advance from imported set dates is item **H**, deferred).

---

## 6. Asset tab — action refactor

Ethan is right that the action lineup is crowded: six icons per row across 218 rows, with a destructive delete sitting one pixel from a copy button.

### 6.1 Before → after

| Current (6) | Phase 2 (4) |
|---|---|
| Create report | **Add report** (merged; template picker modal now contains a "Link existing report" tab) |
| Link report | *(folded into Add report)* |
| Edit | **Edit ▾** — split button: click opens edit; caret opens menu |
| Duplicate | **Duplicate** |
| Unlink | *(moved into Edit ▾ menu)* |
| Delete | *(moved into Edit ▾ menu, in a separated destructive section with confirm)* |
| — | **Schedule test** ← new, calendar-plus icon |

Net effect: same capability, four icons, and the two irreversible actions are behind a deliberate second click.

### 6.2 Edit ▾ menu contents

```
  Edit asset…
  ─────────────
  Unlink from parent
  ─────────────
  Delete asset            (red, requires typed confirm on parents with children)
```

### 6.3 "Add report" modal

Two tabs in one modal:
- **New from template** — existing template picker (unchanged behavior)
- **Link existing** — searchable list of unlinked reports at this site

Same doc-plus icon as today so muscle memory survives.

### 6.4 "Schedule test" — single asset

Modal fields, in order:

| Field | Control | Required | Default |
|---|---|---|---|
| Asset | Read-only chip: `MVG-A1 VFI-01` · Substation · Equipment Type | — | from row |
| Work scheduled | Combobox of report templates for this equipment type, with **"Other — describe"** at the bottom that reveals a text input | ✅ (one of the two) | — |
| Start date | Date picker, weekends de-emphasized | — | next working day |
| Finish date | Date picker | — | start + template default duration, else start |
| Equipment status | Select | ❌ | current asset value if set, else blank |
| Testing status | Select | ✅ | Not Started |
| Notes | Textarea | ❌ | — |

Behaviors:
- Picking a start with no finish auto-fills finish (working-day arithmetic).
- If the asset already has an open scheduled test with the same template, warn (don't block): *"This asset already has Insulation Resistance scheduled 12–16 Oct. Schedule another?"*
- **Parent assets:** when the selected asset has children (e.g. `MVG-A1 SWGR (5)`), show a checkbox: *"Also schedule the 5 items inside this asset"* — checked by default. This is how a switchgear lineup gets scheduled in one action instead of six.
- Save → toast with *View in Project Tracker* link.

### 6.5 "Schedule test" — batch

Add row checkboxes + a select-all-in-filter control to the asset table. With ≥1 selected, a sticky bulk bar appears: `12 selected — Schedule test · Add report · Export`.

Batch modal is the single modal minus the asset chip, plus a summary line: *"Scheduling 12 assets: 8 Medium Voltage Circuit Breaker, 4 Switchgear."* One date window and one Work Scheduled value applies to all. If the selection spans equipment types with no shared template, the template list shows only common templates and hints why.

Given the 8-hall × 29-activity repetition in the P6 file, batch is not a convenience feature here — it's the primary path.

---

## 7. Project Tracker tab

New top-level tab, site-scoped, sitting beside Assets and Reports.

### 7.1 Columns

| # | Column | Source | Sort | Filter |
|---|---|---|---|---|
| 1 | Substation | `asset.substation` | ✅ | multi-select |
| 2 | Identifier | `asset.identifier` | ✅ | search |
| 3 | Part of | parent identifier, blank if none | ✅ | has parent / no parent |
| 4 | Work scheduled | template name, else free text (italic + "custom" dot) | ✅ | multi-select |
| 5 | Start date | `start_date` | ✅ | range |
| 6 | Finish date | `finish_date` | ✅ (default) | range |
| 7 | Equipment status | enum, blank allowed | ✅ | multi-select + "blank" |
| 8 | Testing status | enum | ✅ | multi-select |
| 9 | Result | from report | ✅ | multi-select + "no result" |

Additional columns available via a column picker but off by default: Building/Area, Equipment Type, Duration (working days), Report link, Notes, Last updated.

A leading status stripe on each row carries the §5.5 schedule state as color — that's what makes past-due readable at a glance without a dedicated column.

### 7.2 Saved views

Ethan asked for four ways to look at this. Implement them as **preset views** (tabs or a view dropdown above the table), each a stored filter + sort + grouping combo. Users can also save their own.

**View 1 — Due & Past Due** *(default landing view)*
- Filter: `schedule_state IN (past_due, due_now)`
- Group: Past Due (collapsed count badge, red) / Due This Week / Due Next Week
- Sort: finish date ascending
- This is the Monday-morning view. It should be the first thing the tab opens to.

**View 2 — Ready for Testing**
- Filter: `equipment_status = 'ready_for_testing'` AND `testing_status NOT IN (complete, not_required)`
- Sort: start date ascending
- Answers "what can we actually put a crew on right now."

**View 3 — Schedule** *(chronological, status-agnostic)*
- Filter: none
- Group: by ISO week (`Week of 12 Oct 2026`), with week header showing count + duration total
- Sort: start date, then substation, then identifier
- Deliberately mirrors the P6 export's month → week → activity structure so it reads familiar to anyone holding the customer's PDF.

**View 4 — By Equipment**
- Filter: none
- Group: user-selectable — Equipment Type (default), Substation, or Building/Area
- Group header shows: `Transformer — 24 scheduled · 9 complete · 3 past due · next 12 Oct`
- This is the "how many transformers are left and when" question, answered in the header row before anyone expands anything.

### 7.3 Global controls

Persistent across views: site selector (matches Assets tab), search (identifier / location / work), date-range chip (This week · This month · Custom · All), and a "Show completed" toggle (off by default in Views 1–2, on in 3–4).

### 7.4 Row detail

Click a row → right-side drawer, not a page navigation. Contains: full asset card (link to Assets tab), work scheduled + template checklist preview, editable dates and statuses, linked report with result and a *Open report* button, notes, and an activity/audit log.

### 7.5 Empty and edge states

- No scheduled tests at site → illustration + *"Nothing scheduled yet. Head to Assets to schedule your first test"* + button.
- Filter returns nothing → *"No items match this view"* + clear-filters.
- Asset deleted → cascade removes scheduled tests; warn in the asset delete confirm with the count.

---

## 8. Bulk date operations

The most operationally valuable feature in this phase. A single delay at a data center cascades through dozens of downstream items, and the alternative to this is re-keying.

### 8.1 Selection

Checkbox column, shift-click range select, select-all-in-current-filter (with explicit count: *"All 47 items in this view"*).

### 8.2 Actions on the bulk bar

`47 selected — Change start · Change finish · Shift dates · Set status ▾ · Delete`

| Action | Behavior |
|---|---|
| **Change start date** | Sets all selected to one start date. Finish unchanged unless it would precede start — in which case finish moves to preserve each item's original duration (flagged in preview). |
| **Change finish date** | Sets all selected to one finish date. Symmetric rule. |
| **Shift dates** | Moves start **and** finish by ±N days, preserving each item's duration. The delay-modeling tool. |
| **Set status** | Bulk set equipment status and/or testing status. |
| **Delete** | Soft delete with confirm + undo toast. |

### 8.3 Shift semantics — working days by default

The shift dialog:

```
Shift dates by  [ 5 ]  [ working days ▾ ]   ( ) Earlier  (•) Later
                       ├─ working days (Mon–Fri)
                       └─ calendar days
```

**Default: working days.** Every one of the 246 dated activities in the P6 file starts and finishes Mon–Fri. A calendar-day shift of a Friday start by 3 days lands on Monday but silently breaks the pattern on multi-week shifts, and a shift of 7 calendar days is not the same as a week of work. Working-day arithmetic keeps the schedule looking like the schedule.

Holidays are *not* handled in Phase 2 — a site holiday calendar is item **J**. Note this in the dialog's helper text so nobody assumes Thanksgiving is accounted for.

### 8.4 Preview before commit

Every bulk date action opens a preview showing old → new for up to the first 10 rows plus a count of the rest:

```
MVG-A1 VFI-01   12 Oct – 16 Oct  →  19 Oct – 23 Oct
MVG-A1 VFI-02   12 Oct – 16 Oct  →  19 Oct – 23 Oct
…and 45 more
⚠ 3 items would move onto a weekend and will snap to the next working day.
⚠ 2 items have no start date and will be skipped.
```

Warnings to surface: weekend landings, items with null dates (skipped), items already Complete (skipped by default, with an override checkbox), and items with `has_date_constraint = true` (imported constraint — warn that we're overriding a customer-fixed date).

### 8.5 Undo

Every bulk write gets a `batch_id`. The success toast holds an **Undo** for 30 seconds and the audit log keeps a permanent per-batch revert action. Given how easy it is to shift the wrong 47 rows, this is required, not nice-to-have.

---

## 9. API

REST, matching existing ampOS conventions.

```
GET    /api/sites/:siteId/scheduled-tests
       ?view=due|ready|schedule|equipment
       &start_from=&start_to=&finish_from=&finish_to=
       &equipment_status=&testing_status=&result=
       &substation=&equipment_type=&building=
       &q=&group_by=&sort=&page=&per_page=

POST   /api/sites/:siteId/scheduled-tests            # single
POST   /api/sites/:siteId/scheduled-tests/batch      # array; used by batch schedule modal
GET    /api/scheduled-tests/:id
PATCH  /api/scheduled-tests/:id
DELETE /api/scheduled-tests/:id                      # soft

POST   /api/sites/:siteId/scheduled-tests/bulk-dates
       { ids[] | filter{}, op: "set_start"|"set_finish"|"shift",
         date?: "2026-10-19", days?: 5, unit?: "working"|"calendar",
         direction?: "later"|"earlier",
         skip_complete: true, dry_run: false }
       → { batch_id, affected, skipped[], warnings[], preview[] }

POST   /api/sites/:siteId/scheduled-tests/bulk-status
POST   /api/batches/:batchId/undo
```

`dry_run: true` powers the §8.4 preview and returns the identical payload without writing. One code path, no drift between what's previewed and what's committed.

---

## 10. P6 import (Phase 2.5 — spec'd now)

Not in the first build, but the schema in §5.1 already carries the columns so this ships as a feature, not a migration.

### 10.1 Parsing the export

The hierarchy is encoded as **leading spaces in the Activity ID column**, not as a real column:

| Indent | Meaning | Action |
|---|---|---|
| 0 | `Total` | Skip |
| 2 | Month rollup (`  Aug  2026`) | Skip |
| 4 | Week rollup (`    03-Aug-26 00:00`) | Skip |
| 6 | Activity | Import |

Algorithm:

1. Read sheet 1. Locate the header row by matching `Activity ID` in column A.
2. For each subsequent row, compute `indent = len(A) - len(A.lstrip())`. Keep only `indent == 6`.
3. `activity_id = A.strip()`, `activity_name = B`.
4. Dates: if the cell is a datetime → truncate to date. If it is a **string** ending in `*` → parse `DD-MMM-YY HH:MM`, set `has_date_constraint = true`. If null → leave null.
5. `remaining_duration` (E) is informational; do not derive finish from it — trust the finish date.
6. Ignore `Activity Count` (F) — always 1 on activity rows.
7. Reject rows where both dates are null.

Expected yield on the reference file: **262 activities**, 246 fully dated, 16 constraint/milestone rows.

### 10.2 Mapping activities to assets

This is the hard part and it needs a human in the loop. Proposed three-tier match against the site's assets:

1. **Exact** — activity name contains an asset identifier verbatim (`Set MVG-C1 (N)` → asset `MVG-C1`; `PDM-0147-A - Set, Fitout, Tie-in` → asset `PDM-0147-A`).
2. **Normalized** — strip punctuation/case, match tokens (`1102-A-MOD` → `1102A-MOD`).
3. **Unmatched** — everything else (e.g. `DC7 DH 1100 - Installation of EAP Lighting & Spiderboxes`, which is a construction activity with no ampOS asset).

Import wizard flow:

```
Upload .xlsx → Parse & preview (262 activities found)
  → Choose schedule type: ( ) Set dates   (•) Test dates
  → Review matches:  198 matched · 41 need review · 23 no asset
  → Resolve: per-row asset picker for the 41; bulk-ignore the 23
  → Choose Work Scheduled: map activity name patterns → report templates
  → Import → creates/updates scheduled_test rows, tagged with external_batch_id
```

Re-importing a revised schedule matches on `(site_id, external_activity_id)` and **updates dates in place** rather than duplicating — that unique index in §5.1 is what makes the second import safe. Show a diff before commit: *"18 activities moved later, 3 added, 1 removed from the customer's schedule."*

### 10.3 Set dates vs test dates

Tag each import with a schedule type. Set-date imports are stored but do not create test records — they populate a per-asset `set_date` that, in item **H**, auto-flips Equipment Status from Not Installed → Ready for Testing when the set date passes. That single link is what would make View 2 self-maintaining instead of hand-updated, and it's the strongest argument for doing the importer soon after Phase 2 ships.

---

## 11. Permissions

| Role | Can |
|---|---|
| Viewer | Read tracker, all views, export |
| Technician | Update testing status, result via report, notes on own items |
| PM / Scheduler | Full CRUD on scheduled tests, all bulk operations, import |
| Admin | Above + delete, undo any batch |

Bulk date operations should be PM-and-up. A tech shifting 47 items by accident is a worse outcome than a tech having to ask.

---

## 12. Acceptance criteria

**Asset tab**
- [ ] Action row shows exactly four controls: Add report, Schedule test, Edit ▾, Duplicate
- [ ] Delete and Unlink live inside Edit ▾, with Delete visually separated and confirmed
- [ ] Add report modal offers both "New from template" and "Link existing"
- [ ] Schedule test modal creates a scheduled test with template or free-text scope
- [ ] Scheduling a parent asset offers to include its children, checked by default
- [ ] Multi-select + batch schedule creates one scheduled test per selected asset

**Project Tracker**
- [ ] All nine required columns present, sortable, filterable
- [ ] Four preset views behave per §7.2; Due & Past Due is the default landing view
- [ ] Past-due items are visually distinct without expanding or filtering
- [ ] Equipment status accepts blank; testing status defaults to Not Started
- [ ] Result populates from the linked report and is not hand-editable when a report is linked
- [ ] Grouping by Equipment Type / Substation / Building shows counts in group headers
- [ ] Row click opens the detail drawer with report link

**Dates**
- [ ] Change start / change finish / shift dates work on single and multi selection
- [ ] Shift preserves each item's duration independently
- [ ] Working days is the default unit and never lands an item on a weekend
- [ ] Preview shows before/after and all warnings before any write
- [ ] Undo reverts a full batch
- [ ] Finish date cannot be set before start date

**General**
- [ ] Tracker loads under 1s for a 500-row site
- [ ] All writes appear in the audit log with user and timestamp
- [ ] Works on the tablet widths techs actually use in the field

---

## 13. Open questions for Ethan

1. **"Not Require"** — confirming this is *Not Required*.
2. **Multiple tests per asset.** A breaker realistically gets several scopes (insulation resistance, contact resistance, primary injection) on different dates. The model above allows N scheduled tests per asset. Do you want the tracker to default to one row per test (current spec) or roll them up per asset with an expander?
3. **Equipment status ownership** — is that a property of the *asset* (one value, shown on the tracker) or of the *scheduled test* (can differ per row)? Spec currently puts it on the scheduled test, which allows drift. Asset-level is cleaner if it's really a physical fact.
4. **Result granularity** — if an asset has three scheduled tests and one fails, is the asset's overall result FAIL? Do you need an asset-level rollup result, or is per-test enough?
5. **Who owns dates** — is the customer's P6 export authoritative, or does AMP maintain its own dates that can diverge? Affects whether re-import overwrites local edits or flags conflicts (§10.2).
6. **Working-day default** — confirming Mon–Fri is right, and whether site holidays matter enough to pull item **J** forward.
7. **Constraint dates** — the `*` rows are customer-fixed. Should ampOS block shifting those, or just warn?
8. **Report template ↔ equipment type** — do templates already carry an equipment-type association? If not, the Work Scheduled picker can't filter intelligently and we should add it.
9. **Notification appetite** — email/digest when items go past due? Not in this phase, but worth knowing if it's next.
10. **Priority order** — my proposed build order is §14. Push back if the tracker views matter more to you than the bulk date tools; I'd sequence differently.

---

## 14. Build order

Rough sequencing. Each milestone is independently demoable, which matters for getting Ethan's feedback early rather than at the end.

| # | Milestone | Contents | Rough size |
|---|---|---|---|
| **M1** | Data foundation | Migration, enums, model, service layer, API CRUD, seed data | 2–3 days |
| **M2** | Schedule from asset | Action-bar refactor, Add report merge, Schedule test modal (single + parent children) | 2–3 days |
| **M3** | Tracker v1 | Tab, table, all 9 columns, sort/filter/search, row drawer | 3–4 days |
| **M4** | Views & grouping | Four preset views, grouping with rollup headers, saved custom views | 2–3 days |
| **M5** | Batch & dates | Multi-select on both tabs, batch schedule, bulk date ops with preview + undo | 3–4 days |
| **M6** | Polish | Empty states, tablet layout, permissions, audit log surfacing, perf pass | 1–2 days |
| **M7** | *(2.5)* P6 import | Parser, match wizard, re-import diff, set-date → equipment status link | 4–5 days |

M1–M6 is the Phase 2 deliverable. Ship M2 and M3 to Ethan as soon as they're standing — feedback on the tracker's column and view behavior before M4 is built is worth more than a polished guess.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Scheduling granularity is wrong (per-test vs per-asset) and we discover it after M3 | Resolve Q2 before M1 closes — it's a schema question |
| Bulk shift lands dates wrong and nobody notices for a week | Mandatory preview + undo + audit log (§8.4, §8.5) |
| Asset↔activity matching in the importer is worse than expected | Human-in-the-loop wizard by design; never auto-import unreviewed matches |
| Tracker becomes a second place to update status that drifts from reports | Result is report-derived and read-only when linked (§5.3) |
| Scope creep into Gantt/resource planning | Explicitly deferred (§3 G, J); revisit after Ethan uses the table for a month |

---

*Prepared for review — Jack Lyons, 05 Aug 2026*
