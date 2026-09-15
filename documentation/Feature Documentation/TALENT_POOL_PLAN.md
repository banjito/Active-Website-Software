# Talent Pool (Recruiting Prospects)

**Status:** Draft scope; not built. HR decisions and security prerequisites remain open.
**Requested by:** HR (Dionne, Harra)
**Source data:** `NETA Candidates .xlsx` (Google Sheet shared with Jack)

Sheet counts and data observations below come from the original scoping notes. Reconfirm them against the exact workbook used for the import dry run.

## The ask

> Can you create a database for me and Harra to load candidates into in ampOS? When we hire those candidates, could they then flow over to the HR section? I would like to keep these 2 data sets separate until we hire them.

## Summary

Add a **Talent Pool** page under HR → Recruiting for sourced prospects. It is a separate table from applicants and employees. A prospect moves forward only through explicit hand-offs:

```
Talent Pool (prospect) ──Promote──▶ Candidate Tracking (candidate)
common.recruiting_prospects        common.candidates
NEW                               EXISTS
                                      │
                                      │ Offer accepted / hired; manual HR actions
                                      ▼
                               Onboarding tracking + links to an existing ampOS user
                               EXISTS; not automatic employee/account creation
```

This project builds the first hand-off plus the page, tables, and reviewed one-time import. Existing downstream actions remain manual, including separate candidate and onboarding account links.

**Delivery:** MVP includes manual prospect entry and the one-time import script. A reusable XLSX/CSV import dialog is Phase 2, not a launch requirement.

---

## What already exists

HR → Recruiting → **Candidate Tracking (ATS)**, `src/pages/hr/recruiting/CandidateTracking.tsx`, backed by `common.candidates` via `src/services/hr/candidatesService.ts`.

- Statuses: `new`, `screening`, `interview`, `offer`, `offer_sent`, `offer_accepted`, `hired`, `rejected`
- Once a candidate is `offer_accepted` or `hired`, the detail view shows:
  - **Send to Onboarding**: `onboardingService.createOnboardingFromCandidate()` creates a pending `common.onboarding_tracking` row; it does not create a login or assign a packet
  - **Assign Work Account**: `candidatesService.linkUser()` links the candidate to an **existing** ampOS user
  - **Transfer documents**: `candidatesService.transferDocumentsToEmployee()` copies supported files (resume, uploaded cover letter, signed offers) to the employee file; it does not move/delete the originals or transfer prospect notes
- Onboarding has its own account link through `onboardingService.linkUserToTracking()`. Linking the candidate does **not** also link the onboarding record; HR must complete both, particularly when application and work email differ.

The existing model separates applicants from employees, but is not an automatic conversion on hire. Confirm that HR wants Talent Pool → Candidate Tracking → these manual onboarding steps. The immediate gap is that the spreadsheet does not fit `common.candidates`.

## Why the sheet does not fit `common.candidates`

| Sheet | Rows | Contents |
|---|---|---|
| Sheet1 | 393 | Actively worked prospects: status, action taken, availability, Dionne's notes, Harra's notes, empty Texted/Emailed/Called/Interviewing/Sent to Manager/Offer columns |
| Sheet2 | 50 | LinkedIn export: name, location, email, phone, current title, current org |
| Sheet3 | 1,840 | Raw sourcing list: name, title, country, email, LinkedIn URL, source |

1. **Required fields are missing.** Candidates require `first_name`, `last_name`, `email`, `position_applied`, and `source`. Email coverage is 152/393 in Sheet1 and 50/1,840 in Sheet3; promotion must collect missing values rather than invent placeholders.
2. **Different status vocabulary.** The sheet tracks outreach (Interested, Not interested, Future roles), not an application pipeline.
3. **Fields with no home.** LinkedIn URL, current employer, availability, per-recruiter notes, outreach touches.
4. **Volume and noise.** 2,283 source rows before deduplication would bury real applicants on a card-based page that loads everything, and would skew recruiting analytics and EEO reporting, which read `common.candidates`.
5. **Possible duplicates.** 121 names appear in both Sheet1 and Sheet3; 10 in both Sheet2 and Sheet3. Name overlap is a review signal, not proof that two rows represent the same person.

---

## MVP scope

### 1. Database

New migration in `database/migrations/`, mirrored into `database/bootstrap/02_schema.sql` per the [new instance playbook](../NEW_INSTANCE_PLAYBOOK.md). Include all constraints, indexes, triggers, authorization helpers, RPCs, policies, and grants/revokes—not only the tables. Verify both an existing-instance upgrade and a fresh bootstrap; bootstrap is not an upgrade script.

**`common.recruiting_prospects`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `first_name` | text not null | Trimmed, non-empty |
| `last_name` | text | Nullable; preserve single-name prospects until HR resolves promotion requirements |
| `email` | text | Nullable; trimmed and lowercase |
| `phone` | text | Preserve international prefixes and extensions; do not force all numbers into US formatting |
| `linkedin_url` | text | Canonical HTTPS LinkedIn profile URL; normalize host/profile identifier, remove query/fragment/trailing slash, reject non-profile URLs |
| `job_title` | text | Their current or listed title |
| `current_org` | text | |
| `location` | text | Free text: city/state or country |
| `source` | text not null default `'other'` | Constrained to `linkedin`, `indeed`, `referral`, `other`; retain unrecognized original values in import provenance |
| `status` | text not null default `'new'` | Constrained to the statuses below |
| `availability` | text | Free text ("txt 9/1", "2 wk on 1 wk off") |
| `needs_follow_up` | boolean not null default false | From the sheet's "Action Taken" column; scheduling/reminders are deferred |
| `owner_id` | uuid FK → `auth.users(id)` | Nullable; `ON DELETE SET NULL`; assignee must be an eligible recruiter |
| `last_contact_date` | timestamptz | Latest known `occurred_at` of a call/text/email, not the last edit or note |
| `candidate_id` | uuid FK → `common.candidates(id)` | Set only by promotion; `ON DELETE RESTRICT` so candidate deletion cannot silently break the hand-off |
| `promoted_at` | timestamptz | Set with the candidate link in the promotion transaction |
| `import_refs` | jsonb not null default `'[]'` | Source workbook checksum, sheet, row, original name/status/source for each contributing row; empty for manual entries |
| `created_by` | uuid FK → `auth.users(id)` | `ON DELETE SET NULL`; authenticated actor, not a caller-supplied author |
| `created_at`, `updated_at` | timestamptz not null default `now()` | Maintain `updated_at` with `common.update_updated_at_column()` |

Normalize blank optional text to `NULL`, and enforce canonical email/LinkedIn values on database writes as well as in import helpers. Indexes: partial unique on `lower(email)` where not null, partial unique on `linkedin_url` where not null, plus `status`, `owner_id`, and `candidate_id`. Identifier conflicts require review; do not silently overwrite or merge records to satisfy a unique constraint.

Enforce that `status = 'promoted'` iff both `candidate_id` and `promoted_at` are populated; otherwise both are null. Promotion fields cannot be set through ordinary create/update/bulk/import-merge operations.

**`common.recruiting_prospect_activity`**

Replaces the fixed "Dionne's notes" / "Harra's notes" and Texted/Emailed/Called columns with a log.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()`; imports/retryable creation use a stable, preassigned ID |
| `prospect_id` | uuid not null FK → `common.recruiting_prospects(id)` | `ON DELETE CASCADE`; prospect deletion is a separate, confirmed action |
| `type` | text not null | Constrained to `note`, `call`, `text`, `email`, `status_change`, `promoted` |
| `body` | text | Required for notes; render as plain text |
| `occurred_at` | timestamptz | Known event time, including backdated outreach; nullable for imported history with unknown dates |
| `original_author` | text | Original spreadsheet note author; does not impersonate the importing user |
| `import_ref` | jsonb | Workbook checksum, sheet, row, and column for an imported activity |
| `created_by` | uuid FK → `auth.users(id)` | `ON DELETE SET NULL`; actual authenticated actor/import operator |
| `created_at` | timestamptz not null default `now()` | Audit insertion time, not assumed historical contact time |

Index `(prospect_id, created_at, id)` for a paginated log. Activity is append-only through normal APIs; only controlled status/promotion operations may create `status_change` and `promoted` events. Enforce at most one `promoted` event per prospect.

Logging a call/text/email requires a known `occurred_at` and updates `last_contact_date` atomically to the latest contact time. Backdated events cannot move it backward. Notes, status changes, promotion, and undated imported history never advance it.

**Statuses**

| Value | Label | Badge |
|---|---|---|
| `new` | New | blue |
| `contacted` | Contacted | yellow |
| `interested` | Interested | green |
| `future_roles` | Future roles | orange |
| `not_interested` | Not interested | red |
| `promoted` | In pipeline | purple |

Interview, offer, and hired are deliberately **not** prospect statuses. Those stages live in Candidate Tracking so there is one source of truth once someone is in process.

**Security and privacy prerequisites**

- Enable RLS on both tables. The intended audience is Admin / Super Admin, matching the narrow `isHrFullAccess` gate in `HrLayout.tsx`; HR Rep / Office Admin are not automatically included.
- Before implementation, identify and verify a **server-controlled role source** for database authorization. The UI currently reads `user_metadata.role`; user-editable metadata is not sufficient authority for RLS. Do not reuse a broader HR/employee helper without checking its semantics. Missing or untrusted role information must deny access.
- Explicitly revoke access from `anon` and `PUBLIC`, check default privileges, and grant authenticated users only the operations supported by each table. Do not use `GRANT ALL` (which includes `TRUNCATE`). Apply both visibility and write checks; a hidden nav item is not security.
- Database functions must enforce the same role gate, restrict execution grants, and use a safe search path with qualified objects if privileged. Ordinary callers cannot forge actor IDs, mutate promotion fields, or insert system activities directly. The one-time import's administrative credentials stay outside the browser and source control.
- Enforce promoted-record read-only behavior in the database, including activity, deletion, bulk updates, and import merges—not just in the UI. Normal deletion is limited to unpromoted records, requires confirmation, and removes their activity; any retention/privacy deletion involving promoted records needs a separate reviewed administrative procedure.
- HR must confirm retention/deletion handling and how to record do-not-contact requests before loading sourced contact data. `not_interested` must not be assumed to mean consent to future outreach.

> **Candidate access is a release prerequisite for promotion.** The bootstrap grants broad access to `common.candidates`, including `anon`, and no RLS was found for that table. This confirms a repository concern, not live production exposure. Verify live grants, RLS/policies, and API schema exposure before promotion is enabled; if exposure is confirmed, resolve it as a separate security prerequisite. Keep detailed recruiter activity in Talent Pool—never automatically copy the full log into candidate notes. Even an approved summary and promoted contact data need an appropriately protected destination.

### 2. Service

`src/services/hr/prospectsService.ts`, following the existing HR service conventions:

- `list({ search, status, source, owner, followUp, page, pageSize, sort })` with server-side filtering, exact filtered totals, and `.range()` paging. Do not depend on loading the full dataset within PostgREST's response cap. Whitelist sort fields and use `id` as a stable tie-breaker.
- `getCounts({ search, source, owner, followUp })` uses server-side aggregation, not a capped client list. Counts respect the non-status filters and include every status, including promoted; the table defaults to excluding promoted until explicitly selected.
- `create`, `update`, `delete`, `bulkUpdateStatus`, `bulkAssignOwner`; status changes and their events commit together. Bulk status changes cannot promote/reopen prospects. Reject ineligible/promoted selections with an actionable result rather than silently partially applying them.
- `getActivity(prospectId, { page, pageSize })`, `addActivity(prospectId, { type, body, occurred_at })`; public composer types are only `note`, `call`, `text`, `email`. Contact-time rules are enforced in the database.
- `findDuplicates(rows)` returns confident matches, possible name matches, and conflicting identifiers separately. Shared pure normalization/matching helpers support the one-time script and later UI importer.
- `promoteToCandidate(prospectId, { first_name, last_name, email, position_applied, source, requisition_id?, existing_candidate_id?, summary? })` calls the atomic promotion operation described below. Validate required nonblank values and candidate column limits server-side, not only in the dialog.
- Use `describeSupabaseError` for actionable errors without logging contact data or note bodies. Use `withWriteRetry` only for operations that are demonstrably repeat-safe. Generated-ID inserts must not be blindly retried; preassign stable IDs or use a transactional idempotent operation.

### 3. Page: HR → Recruiting → Talent Pool

- Route `/hr/recruiting/talent-pool`, wrapped in `RequireAuth` + `HrLayout` like the other recruiting routes in `src/App.tsx`
- Nav entry in the `recruiting` section of `menuSections` in `src/components/ui/HrLayout.tsx`, placed directly **above** "Candidate Tracking (ATS)" since it is the top of the funnel
- Not added to `HR_LIMITED_ALLOWED_PATHS`
- Follow the existing recruiting route/import conventions in `src/App.tsx` (these pages are currently statically imported); do not refactor unrelated routes

**Features**

- Search across name, email, phone, title, org, LinkedIn
- Filters: status, source, owner, "Needs follow-up"
- Sortable, paginated table (50 per page)
- Row checkboxes with bulk actions: change status, assign owner; selection is current-page only and clears on filter/page changes. Promoted rows are not selectable
- Add / edit prospect dialog
- Detail panel with contact info, quick actions (copy phone, open LinkedIn, mailto), status, owner, and the activity log with an "Add note / Log call / Log text / Log email" composer
- No upload/import button in MVP; the reviewed one-time script loads the initial data. The reusable import dialog is Phase 2
- **Promote to Candidate** button (see below)

### 4. Promote to Candidate

1. Dialog reviews all required candidate values: `first_name`, `last_name`, `email`, `position_applied`, and `source`. Collect missing values without fabricated surnames/emails. An optional open requisition may supply the position title. Carry over valid phone/source information; detailed sourcing history remains in Talent Pool.
2. Search for existing ATS matches before creating an application. Candidate email is not unique and one person can apply to multiple roles: HR must explicitly choose a suitable existing application or confirm a distinct new one. Never auto-link by name. Recheck matches inside the promotion transaction and return unresolved conflicts for review.
3. In **one database transaction/RPC**, authorize the caller, lock the prospect, validate input, then create a candidate with `status = 'screening'` or link the explicitly selected existing candidate. Linking must not overwrite that candidate's status, contact details, or notes. Set `candidate_id`, `promoted_at`, `status = 'promoted'`, and create exactly one promotion event before committing. Any failure rolls back the entire hand-off.
4. The operation is idempotent: repeat calls, network retries, and concurrent attempts on the same prospect return its already-linked candidate. Disable the button while pending for usability, but do not rely on that for integrity. Concurrent requests for different prospects with overlapping identifiers must be serialized/rechecked so a new duplicate application is not silently created.
5. Do not seed candidate notes from the full activity log. For a new candidate, optionally include an HR-reviewed summary and a minimal Talent Pool reference after the destination-access prerequisite is satisfied. Do not expose private recruiter notes in that summary by default.
6. Show a toast and persistent link to `/hr/recruiting/candidate-tracking?candidateId=…`. Add query-parameter handling to Candidate Tracking to load/open that candidate even if not in its current list; handle unavailable/unauthorized IDs without exposing details.
7. Downstream interview/offer/onboarding actions remain manual. After offer acceptance/hire, HR sends to onboarding, links the existing work account on the candidate **and** onboarding record, assigns onboarding material as needed, and explicitly transfers supported documents. Promotion itself never creates a login, onboarding record, interview, or offer.

Promoted prospects stay in Talent Pool (database-enforced read-only, "In pipeline" badge, link to candidate) and are hidden in the default table view. Candidate status becomes authoritative; rejection does not automatically reopen the prospect. Reopening/reapplication automation is out of scope.

### 5. One-time import of the Google Sheet

Script in `scripts/`, reviewed before running against production. Import only the tabs approved by HR; retain the original workbook securely, outside source control.

**Matching and merge rules**

- Normalize LinkedIn/email, then compare all available strong identifiers together. A matching identifier is a confident match only when other populated identifiers do not conflict.
- If email matches one record and LinkedIn another, or otherwise conflicting identifiers suggest different people, stop that row for manual review. Check both within the workbook and against existing prospects; surface existing ATS matches before any promotion.
- **Never automatically merge on exact name.** Name-only matches are possible duplicates requiring HR confirmation, even when only one existing record has that name.
- For confirmed same-person rows in the initial workbook, Sheet1's populated worked fields take priority and other tabs may fill blanks. Identifier conflicts and contradictory advanced stages still require review. Append distinct notes with their attribution; do not discard them under "Sheet1 wins."
- Merging into an existing ampOS prospect fills approved blanks only by default. Overwriting populated fields requires an explicit field-level decision. Do not modify promoted prospects; report them for review.

**Source transformations**

- Preserve the original `NAME` in `import_refs`, suggest a first/last split, and flag ambiguous names. Single-name records may remain prospects; HR must resolve required names before promotion.
- Sheet1 has two `EMAIL` columns (G, I): choose the first non-empty valid address when they agree or only one is present. Two distinct populated addresses require review; preserve their source references rather than silently discarding one.
- Sheet2 includes numeric phones such as `3.608886757E9`. Read the underlying cell value and format as `360-888-6757` only when it is an exact valid North American number. Preserve international prefixes/extensions and flag truncated, fractional, or ambiguous values; do not invent missing digits.
- One Sheet1 row reportedly has a LinkedIn URL in `SOURCE`: validate/move it to `linkedin_url`, set source to `linkedin`. Map unknown sources to `other` while preserving the original source value.
- `DIONNE'S NOTES` and `HARRA'S NOTES` become separate `note` activities with `original_author` set accordingly. `created_by` identifies the authenticated import operator, not the original author. Unknown historical dates stay null; the import timestamp is only `created_at`.
- `ACTION TAKEN = NEEDS TO FOLLOW UP` sets `needs_follow_up`; do not infer a follow-up date or recent contact from it.

**Execution safeguards**

- Dry-run by default; require an explicit apply option and a reviewed manifest tied to the workbook checksum and target environment. Reconfirm row counts and mappings during dry run. A changed workbook requires a new review.
- Persist the restricted manifest before writes, including contributing sheet/row/column references, planned operations, stable prospect/activity IDs, and merge decisions. Keep manifests/error reports containing PII out of git and general logs.
- Apply each row/confirmed merge group transactionally with its activities and provenance. Initial-state checks reject records edited since review instead of overwriting newer work. Permit only one apply of a manifest at a time.
- Rerunning/resuming the same manifest must not duplicate prospects, notes, or promotion events—even for rows with neither email nor LinkedIn. Resolve already-applied operations by stable IDs and use the same idempotent promotion operation as the UI.
- Produce created/merged/unchanged/skipped/blocked/failed totals and actionable row-level reasons. Failures must not be reported as success. Partial runs resume from the manifest; corrections require a new reviewed dry run, not blind deletion of records that may now be in use.

**Status mapping (Sheet1)**

| Sheet value | Count | Maps to |
|---|---|---|
| (blank) | 314 | `new` |
| INTERESTED | 44 | `interested` |
| NOT INTERESTED | 13 | `not_interested` |
| CAN BE CONSIDERED FOR FUTURE ROLES | 10 | `future_roles` |
| CONTACTED BY DIONNE | 2 | `contacted` |
| EXISTING CONTACT DETAILS | 1 | `contacted` |
| INTERVIEW SCHEDULED | 5 | promote, candidate `interview` |
| OFFERED | 1 | promote, candidate `offer` |
| TERMS SENT | 1 | promote, candidate `offer_sent` |
| HIRED | 2 | promote, candidate `hired` |

The nine advanced-stage rows require HR review of missing names/emails/positions/sources and existing ATS matches before promotion. Block unresolved rows from apply rather than inventing required values or silently resetting them to `new`.

For **new** candidates only, the reviewed import path may supply the mapped initial status within the same atomic promotion operation; it must not create a `screening` candidate and then update its status separately. Linking an existing candidate preserves its stage and requires any discrepancy to be resolved by HR.

These mappings represent **historical stage only**. They do not create interview appointments, offer documents, sent communications, onboarding records, or employee links. Preserve known original dates where supported; never invent historical dates. If the ATS records import-time `applied_date`, identify that fact in the import record and have HR review the reporting impact.

Unmatched rows from Sheets 2 and 3 import as `new`; matched rows follow the reviewed merge rules rather than resetting an existing status.

### Phase 2: reusable UI importer

Upload XLSX or CSV, select a worksheet, map columns, preview validation/duplicate flags, resolve field-level conflicts, and confirm. Show progress and row-level results with safe retry/resume behavior. Use the same normalization, matching, provenance, and idempotency rules as the one-time script.

Reuse the installed `xlsx` / `papaparse` dependencies and the mapping/preview interaction patterns in `src/components/assets/BulkAssetImportDialog.tsx`; do not introduce a second matching implementation. General file mapping and merge resolution are a separate deliverable, not a half-day addition to MVP.

---

## Design: match the HR section

Build from the same primitives and class patterns already used in `CandidateTracking.tsx` and `JobRequisitions.tsx`. Reuse the existing visual language; feature-specific compositions are fine.

**General**

- Components: `Card` / `CardHeader` / `CardContent`, `Button`, `Input`, `Select`, `Textarea`, `Dialog`, `LoadingSpinner`, `toast`
- Square corners everywhere (`rounded-none`)
- Neutral palette only (`neutral-*`, `dark-*`); no `gray-*` or `zinc-*`
- Brand color via `bg-brand` / `text-brand` / `ring-brand`, never a hex value
- Icons from `lucide-react` at `h-4 w-4`
- Full dark mode parity on every element
- Build any toolbar or panel chrome with `<div>`, not `<nav>` / `<header>`

**Page header** (same as Candidate Tracking)

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Talent Pool</h1>
    <p className="text-neutral-600 dark:text-neutral-400 mt-2">
      Sourced prospects not yet in the hiring pipeline
    </p>
  </div>
  {/* MVP: Add Prospect (bg-brand); Phase 2 adds Import (outline) */}
</div>
```

**Stat cards**: same grid of small `Card`s as the Candidate Tracking pipeline stats (`grid grid-cols-2 md:grid-cols-6 gap-4`, `text-xs` label, `text-2xl font-bold` count). One per status. Clicking a card sets the status filter.

**Filter bar**: one `Card` with the search input (left `Search` icon, `pl-10`) and `select`s using the exact classes from Candidate Tracking:
`border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 focus:ring-2 focus:ring-brand`.

**Table**: use the Job Requisitions list-view table, not the Candidate Tracking card list. Cards do not scale to 2,000 rows.

- `Card` with `CardContent className="p-0"` and an `overflow-x-auto` wrapper
- `thead`: `bg-neutral-50 dark:bg-dark-100 border-b`, headers `text-xs font-medium uppercase tracking-wider text-neutral-500`, sortable headers with `ArrowUpDown`
- `tbody`: `bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-dark-200`, rows `hover:bg-neutral-50 dark:hover:bg-dark-100`
- Columns: checkbox, Name (with title / org as the second line, same two-line cell as Job Requisitions), Contact (phone, email, LinkedIn icon), Location, Source, Status badge, Owner, Last contact, Actions
- Pagination footer inside the card: "Showing 1-50 of N" with prev/next

**Status badges**: same pill style and color scale as `getStatusColor` in Candidate Tracking:
`px-2 py-1 rounded-none text-xs font-medium bg-{color}-100 text-{color}-800 dark:bg-{color}-900 dark:text-{color}-200`.

**Bulk action bar**: appears above the table when rows are selected. Thin `bg-brand/10 text-brand` strip, matching the active nav item treatment in `HrLayout`.

**Detail panel and dialogs**: existing `Dialog` component, same header / description / footer layout as the Add Candidate dialog. Activity log entries show author, event time, and a type icon (`Phone`, `Mail`, `MessageSquare`, `StickyNote`). Imported entries distinguish original author from import operator and show "Date unknown" when `occurred_at` is null; do not present import time as historical outreach time.

**Empty and loading states**: same as Candidate Tracking (centered `Users` icon, "No prospects found", "Try adjusting your search or filters"; `LoadingSpinner` in a `Card`).

**Mobile**: table scrolls horizontally inside its container; header, stats, and filters stack as they already do on the other recruiting pages.

---

## Out of scope

- Creating an ampOS login on hire. The existing flow links a hired candidate to an account that already exists; it does not create one.
- Two-way sync with the Google Sheet. After import, ampOS is the source of truth.
- Bulk email or texting from the Talent Pool.
- Changes to Candidate Tracking beyond accepting/linking promoted candidates and opening a candidate from its URL.
- Automatic synchronization of candidate/onboarding account links, onboarding creation on promotion, or broader repairs to existing ATS workflows. Any blocker found in end-to-end validation must be tracked and resolved before relying on that workflow.
- Reopening promoted prospects, automatic reapplication handling, follow-up scheduling/reminders, and resume/attachment storage in Talent Pool.
- General candidate-access remediation is a separate security task, but verified safe destination access is a prerequisite to enabling promotion—not a risk waived by this scope.

## Acceptance criteria and validation

- **Authorization:** test direct reads/writes and promotion RPC calls as anon, ordinary staff, HR Rep, Office Admin, Admin, Super Admin, and a demoted admin with an old token. User-editable role metadata cannot elevate access. Verify destination candidate access in the target environment before enabling promotion.
- **Lifecycle integrity:** direct writes, imports, and bulk actions cannot set promotion fields, edit/delete promoted records, append unauthorized system events, or forge authors. Test allowed unpromoted deletion and candidate-link deletion restrictions.
- **Promotion:** cover missing/blank required fields, column length limits, invalid requisitions, existing ATS matches, and historical initial statuses. Failure injection at each write leaves no partial hand-off. Double-clicks, concurrent attempts, and retries produce one link/event and return the same candidate; cross-prospect identity conflicts require review.
- **Activity:** only call/text/email events advance last contact; backdated activity cannot move it backward. Notes, imports with unknown dates, status changes, and promotion do not count as contact. Verify original-author versus import-operator display.
- **Import:** fixtures cover single/ambiguous names, same-name different people, cross-matched email/LinkedIn, blank identifiers, two email columns, international/scientific-notation phones, and conflicting statuses. Verify field-preserving merges, dry-run with no writes, concurrent-edit rejection, partial-failure reporting, and reruns without duplicate prospects/notes/promotions.
- **Scale and UX:** test more than 1,000 prospects, server-side filters/counts, stable ordering, empty pages, page-selection reset, promoted visibility, dark mode, and mobile scrolling. Verify candidate deep links on a fresh load and for records outside the current ATS list.
- **Database delivery:** run the migration against a representative existing database and test fresh bootstrap creation, including grants, policies, constraints, triggers, and RPC behavior.
- **Downstream hand-off:** in a non-production environment, promote → reach offer acceptance/hire → send to onboarding → link an existing work account separately on candidate and onboarding → verify employee access and supported document copies. Include different application/work emails. Confirm that promotion/import alone sends no communications and creates no accounts or onboarding records.
- **HR sign-off:** approve import scope, blocked-row resolutions, manual workflow, note-transfer policy, and retention/do-not-contact handling before production apply.

## Estimate and delivery sequence

The original ~5-day estimate did not allow enough time for safe matching, repeat-safe imports, transactional promotion, and authorization testing. The ranges below are planning estimates, not commitments; re-estimate after HR decisions, the source-data dry run, and the role-source/destination-access checks.

| MVP piece | Effort |
|---|---|
| Migration, authorization/RLS, invariants, bootstrap update | 1–2 days |
| Service, paging/counts, activity, bulk operations | 1 day |
| Talent Pool page (table, filters, detail, activity, dialogs) | 2 days |
| Atomic promotion, ATS matching, candidate deep link | 1–2 days |
| One-time import script, reviewed manifest, dry run/resume | 1–2 days |
| Acceptance tests, security checks, downstream validation | 1–2 days |
| **MVP total** | **~7–11 engineering days** |
| Phase 2: reusable UI importer and its validation | **~2–4 additional days** |

Build shared normalization/matching helpers during MVP so Phase 2 reuses the tested rules. Estimates exclude HR data cleanup/approval wait time and remediation of pre-existing role, candidate-access, or onboarding defects.

## Questions for HR

1. Load all 2,283 source rows before deduplication, or only the 393 on Sheet1 that are actively being worked? Reconfirm counts from the supplied workbook.
2. Confirm that IT will keep creating logins and HR will link the existing account separately in Candidate Tracking and Onboarding. Automatic account creation/synchronization is not in MVP.
3. Do Dionne and Harra both have Admin / Super Admin access? If not, resolve the access model separately rather than granting broad Admin privileges solely for this feature.
4. Is Candidate Tracking in use today? Confirm Talent Pool → Candidate Tracking → manual onboarding is the intended workflow rather than a single page.
5. Who will resolve missing names/emails/positions/sources and existing-candidate matches for the nine advanced-stage rows? Confirm that the imported stages are historical labels, not scheduled interviews or sent offers.
6. Who approves ambiguous duplicate matches and field-level conflicts? Can HR review the dry-run manifest before production apply?
7. Should any recruiter summary transfer to a new candidate, or should all notes remain in Talent Pool? Detailed activity will not be copied automatically.
8. What retention/deletion rules apply to sourced contacts, and how should recruiters record and honor do-not-contact requests distinctly from "Not interested"?
9. Is manual entry plus the reviewed initial import sufficient for launch, with the reusable XLSX/CSV importer delivered in Phase 2?
