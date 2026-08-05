# Asset Tracking in ampOS — Phase 1

## Status: built, awaiting migrations

Everything below is implemented. **Manual step:** run these in the Supabase SQL editor, in
order:

1. `database/migrations/create_asset_tracking_tables.sql`
2. `database/migrations/add_equipment_asset_parent.sql` (sub-assets)
3. `database/migrations/add_equipment_asset_nameplate_data.sql` (nameplate fields)

Each is independent and degrades on its own: an instance missing #3 shows no nameplate
fields, one missing #2 shows a flat asset list, and one missing all three shows a "not set
up yet" notice on the Assets tab while every other page is unaffected. Queries degrade on
`42P01`/`42703` rather than throwing.

### Nameplate data on the asset

Nameplate values are the same for ATS, MTS and a plain visual inspection, so they belong to
the equipment, not to each report. `equipment_assets.nameplate_data` (JSONB) holds them,
and which fields appear is driven by the asset's equipment type via
`src/lib/assetNameplateSchema.ts`. Every field list in that catalog was lifted from the
matching report form, so what you record is what the report asks for.

Equipment type stays free text: a type with no entry in the catalog simply shows no extra
fields, and nothing is locked to a report template. 16 types have schemas today (breakers,
transformers, switchgear, panelboards, ATS, switches, CT/PT, cable, busway, generator,
motor starter).

Changing an asset's equipment type keeps values the new type also has a field for and warns
before dropping the rest, naming each one.

Reports can be unlinked from an asset: expand a row's report count and hit the unlink icon
next to the report. The report itself is kept and stays on the job; it just stops claiming
to describe that piece of equipment. Use it to move a report attached to the wrong asset.

Report prefill (identifier, substation, location **and** the type-specific nameplate
values) plus equipment linking is wired into 6 report types so far:
Switchgear ATS, LV Breaker Electronic Trip ATS, LV Breaker Thermal-Magnetic ATS,
Large Dry Type Transformer, Automatic Transfer Switch ATS, Panelboard ATS.
The remaining ~62 keep working untouched; each is the same three-part edit
(import the hook, add the prefill `useEffect`, call `setReportAssetEquipmentLink` after
the asset insert). Tell me which others you need for ATL2 and I'll add them.

## Context

We're running QTS ATL2 DC7 (job 26078) and want the whole project tracked in ampOS instead
of spreadsheets. Today you cannot record a piece of equipment without first creating and
saving a report.

**Why that is:** `neta_ops.assets` is not an equipment table — it's a *document pointer*
(`name` + `file_url` = `report:/jobs/{jobId}/{slug}/{reportId}`). Equipment identity is
crammed into the `name` string as `"<Report Type> - <identifier>"`, then re-parsed at page
load (`splitAssetName`, `src/components/reports/reportMappings.ts:100`). Substation and
equipment location live inside each report's own JSON, under ~6 different key spellings
across 3 storage patterns — which is why `JobDetail.tsx:4814-5150` is a 330-line heuristic
scraper that fires one query per asset on every job page load.

There is also **no sites/facilities table anywhere**. Site is free text on the job
(`jobs.site_address`, `jobs.location`).

**Outcome of this phase:** a real asset registry — **Site → Asset** — that you can populate
before any report exists, bulk-load from an Excel file, and reuse across every job at that
site. Reports get linked to an asset; an asset with linked reports can't be deleted.

### The hierarchy: Site → Asset. Customer is deliberately *not* in it.

We have worked for **multiple customers at the same jobsite, on the same equipment**. A
breaker at ATL2 is the same breaker no matter who is paying for the maintenance this year.
So:

- An asset belongs to a **site only**. It has no customer.
- **Customer stays on the job**, where it already is (`jobs.customer_id`) — a
  project-specific variable, exactly like it is today.
- A job points at a site (`jobs.site_id`) *and* a customer, independently. Two jobs at ATL2
  for two different customers both read and write the same ATL2 asset list.

Other decisions: Site = the facility (ATL2), with Building/Area (DC7) as a field on the
asset. Equipment type is free text with autocomplete. Excel/CSV import, duplicate×N, and
adopt-existing-reports are all in scope.

---

## 1. Database

One new migration: `database/migrations/create_asset_tracking_tables.sql`.
Follow the house style in `database/migrations/create_device_catalog_table.sql` — header
comment, `IF NOT EXISTS` everywhere, RLS at the bottom. Applied by hand in the Supabase SQL
editor (there is no working migration runner; `npm run migrate` is dead).

### `common.sites` — facilities, standalone
No customer FK. This is the whole point.
```
id,
name text NOT NULL,          -- 'QTS ATL2'
address, city, state, notes text,
status text DEFAULT 'active',
created_at, updated_at, created_by
UNIQUE INDEX (lower(name), lower(coalesce(city,'')), lower(coalesce(state,'')))
```
The unique index is what stops "ATL2" being created five times — the duplicate-site problem
is exactly what we're trying to kill.

### `neta_ops.jobs.site_id`
`ALTER TABLE ... ADD COLUMN site_id uuid REFERENCES common.sites(id)`. Nullable — existing
jobs keep working untouched. `customer_id` is not changed.

### `neta_ops.equipment_assets` — the registry
Named to avoid collision with `neta_ops.assets` (report docs), `neta_ops.job_assets` (link
table), and `neta_ops.equipment` (AMP's own tool inventory).
```
id,
site_id → common.sites(id) ON DELETE RESTRICT,   -- the only parent
building_area        text,   -- 'DC7'
substation           text,   -- 'Substation 3'
identifier           text NOT NULL,   -- 'CB-101'
equipment_location   text,   -- 'Electrical Room 2'
equipment_type       text,   -- free text
manufacturer, model, serial_number text,   -- nameplate, optional
notes text,
status text DEFAULT 'active',     -- active | removed
created_at, updated_at, created_by, updated_by, deleted_at
UNIQUE INDEX (site_id, coalesce(building_area,''), coalesce(substation,''), lower(identifier))
  WHERE deleted_at IS NULL
```
No `customer_id`, by design.

### `neta_ops.job_equipment_assets` — the per-project skeleton
An asset lives at the site forever; a job covers a subset of it. This is what lets job 26078
and next year's job for a different customer share one ATL2 asset list.
```
id, job_id → neta_ops.jobs(id) ON DELETE CASCADE,
equipment_asset_id → neta_ops.equipment_assets(id) ON DELETE CASCADE,
created_at, created_by
UNIQUE (job_id, equipment_asset_id)
```

### `neta_ops.equipment_types` — autocomplete suggestions
`id, name text NOT NULL UNIQUE, created_at`. Same free-text-with-saved-suggestions pattern
as `neta_ops.neta_sections` and `neta_ops.equipment_locations`. Seed ~20 NETA types (LV
Circuit Breaker, MV Circuit Breaker, Dry-Type Transformer, Liquid-Filled Transformer,
Switchgear, Panelboard, ATS, MV Cable, LV Cable, CT, PT, Busway, Generator, Grounding
System, MV Switch, Motor Starter, …).

### `neta_ops.assets.equipment_asset_id`
`ALTER TABLE neta_ops.assets ADD COLUMN equipment_asset_id uuid
 REFERENCES neta_ops.equipment_assets(id) ON DELETE RESTRICT`.

`ON DELETE RESTRICT` is what gives you **"cannot delete an asset that has a linked report"**
enforced by the database, not just the UI. Index it — it's the join for every asset row.

### RLS
Match the convention on `neta_ops.assets` (`02_schema.sql:26121`):
`USING (common.is_employee_user()) WITH CHECK (common.is_employee_user())`, plus a read
policy for `authenticated`. Not exposed to the customer portal in this phase — and note
that a shared site means one customer's portal must never see another's asset list.

---

## 2. Services

New thin service modules matching `src/services/ampContactsService.ts` (direct
`supabase.schema(...).from(...)`, throw on error, `42P01` → return empty):

- `src/services/sitesService.ts` — `fetchSites`, `fetchSite`, `upsertSite`, `deleteSite`
  (blocked when the site has assets).
- `src/services/equipmentAssetsService.ts` — `fetchAssetsForSite`, `fetchAssetsForJob`,
  `upsertEquipmentAsset`, `bulkInsertEquipmentAssets`, `deleteEquipmentAsset`,
  `linkAssetsToJob`, `unlinkAssetFromJob`, `fetchLinkedReportCounts(assetIds)`,
  `fetchEquipmentTypes` / `createEquipmentType`.

`fetchAssetsForJob` joins through `job_equipment_assets` and returns a linked-report count
per asset via one grouped query on `neta_ops.assets` by `equipment_asset_id` — not N+1.

---

## 3. UI

### Top-level "Sites" section
New route `/sites` and `/:division/sites` (list) plus `/sites/:siteId` (detail) in
`src/App.tsx`, wrapped in `RequireAuth` + `Layout` like every other route.

Nav entry in `src/components/ui/Layout.tsx` immediately after the Customers link
(`Layout.tsx:584-599`) — same `<Link><Button variant="ghost" leftIcon={...}>` shape,
``to={`${basePath}/sites`}``, `Building2` icon from lucide. Build any sub-navigation with
`<div>`, never `<nav>`/`<header>`.

- **`SitesListPage`** — table of sites (Name, City/State, Assets count, Notes) with the
  standard add/edit Dialog. Copy the pattern from
  `src/components/office/AmpContactsManager.tsx` — the cleanest DB-backed example in the
  repo (Card → Table → one `<Dialog open={creating || !!editing}>`, `toast` feedback,
  `usePermissions` gate on the Add button).
- **`SiteDetailPage`** — the master asset registry for that facility. Same asset table and
  dialogs as the job tab below, minus the job-link column. **This is where a bulk Excel
  import normally happens**: load all of ATL2 once, then each job pulls from it.

### Job detail — new "Assets" tab
`src/components/jobs/JobDetail.tsx` is 13,010 lines. **Do not add more inline JSX to it.**
Add the tab button to the existing tab strip (`:8936-9070`) and render a new self-contained
`src/components/assets/JobAssetsTab.tsx`. Leave the existing "Reports" tab
(`activeTab === "assets"`, confusingly) exactly as it is.

The tab contains:

- **Site selector** at the top. If `job.site_id` is null, pick an existing site or create
  one. Writes `jobs.site_id`. Customer is untouched and shown read-only for contrast.
- **"Add assets from site"** — the main flow once a site is populated. A picker listing the
  site's assets (filter by building/substation/type, select-all) that inserts
  `job_equipment_assets` rows. This is how job 26078 gets its DC7 subset.
- **Table**: Building/Area · Substation · Identifier · Equipment Location · Equipment Type ·
  Reports (count) · Actions. Sortable, with substation filter and text search. Reuse
  `compareAlphanumericLabels` (already in `JobDetail.tsx`) so CB-2 sorts before CB-10.
- **Add Asset** → `src/components/assets/EquipmentAssetDialog.tsx`. Fields: Building/Area,
  Substation, Identifier*, Equipment Location, Equipment Type (combobox), plus a collapsed
  "Nameplate (optional)" section for manufacturer / model / serial. Building, Substation and
  Location are free-text-with-suggestions drawn from the site's existing assets. Creating
  from the job page creates the asset **on the site** and links it to the job in one go.
- **Equipment Type combobox** — copy `FormBuilder.tsx:160-235` (`fetchNetaSections` /
  `createNetaSection`): type anything, pick a saved suggestion, new values save back to
  `neta_ops.equipment_types`.
- **Duplicate ×N** on a row — takes `CB-101` and a count, produces `CB-102 … CB-1NN` by
  incrementing the trailing number. Preview before commit.
- **Adopt from existing reports** — one-time-per-job button. Reuses the identifier and
  substation `JobDetail` already scrapes for each existing report asset
  (`JobDetail.tsx:4814-5150`) — far more accurate than re-parsing name strings offline —
  dedupes by identifier, creates `equipment_assets` on the site, links them to the job, and
  backfills `neta_ops.assets.equipment_asset_id`. Preview + confirmation, safe to re-run.
- **Remove from job** vs **Delete asset** are separate actions. Removing unlinks from the
  job. Deleting is blocked when the report count is > 0; the DB `RESTRICT` is the backstop.

### Bulk import from Excel
`src/components/assets/BulkAssetImportDialog.tsx`. Available from both the site page
(creates assets) and the job tab (creates + links).

`xlsx` (SheetJS) is **already a dependency** — see `src/components/office/VendorManagement.tsx`
and `src/lib/hr/exportReports.ts` for existing usage. `papaparse` is there too for CSV.

Flow: drop or browse a `.xlsx` / `.xls` / `.csv` (or just paste TSV from the clipboard) →
sheet picker if the workbook has several → header row auto-detected → column-mapping
dropdowns (Building/Area, Substation, Identifier, Equipment Location, Equipment Type,
Manufacturer, Model, Serial) with fuzzy auto-match on the header names → preview table that
flags rows already existing at the site and rows missing an identifier → insert in chunks
of 200 with a progress count. Parse entirely in the browser; nothing is uploaded.

### Create a report from an asset
Each asset row gets a **Create Report** action. It opens the same report-template picker
already in `JobDetail.tsx:10348` — extract that into
`src/components/jobs/ReportTemplatePicker.tsx` so both places share it (it reads
`defaultAssets` at `JobDetail.tsx:1910`) — and navigates to
`/jobs/:id/<slug>?equipmentAssetId=<uuid>`.

Equipment type does not filter the picker — it's free text, so the full list shows.

---

## 4. Linking reports back to assets

Two shared pieces, so each of the 68 report components needs only a small identical edit:

- `src/services/reportAssets.ts` → `createReportAsset({ jobId, reportSlug, reportId,
  identifier, templateType, equipmentAssetId, userId })`. Does the `assets` + `job_assets`
  insert every report currently hand-rolls (see
  `EmergencySystemsEngineGeneratorATS25Report.tsx:622-667`, the newest and cleanest
  version), now also writing `equipment_asset_id`.
- `src/components/reports/useEquipmentAssetPrefill.ts` → reads `?equipmentAssetId` (or
  resolves it from the report's existing `assets` row), fetches the asset, returns
  `{ equipmentAssetId, prefill: { identifier, substation, eqptLocation } }`.

**Rollout in this phase:** wire both into the report types actually used on ATL2 DC7 — tell
me which and I'll do that batch. Every remaining report is then the same two-line change,
done as they come up. Nothing breaks meanwhile: `equipment_asset_id` stays null and
behaviour is exactly as today.

**Bonus once linked:** the Reports tab's substation folder grouping (`getFolder()`,
`JobDetail.tsx:11084`) and its identifier column should prefer the linked asset's values and
fall back to the existing scraper. That starts retiring the 330-line heuristic and its
per-asset query without a risky big-bang rewrite.

---

## 5. Files

**New**
- `database/migrations/create_asset_tracking_tables.sql`
- `src/services/sitesService.ts`, `src/services/equipmentAssetsService.ts`,
  `src/services/reportAssets.ts`
- `src/components/sites/SitesListPage.tsx`, `SiteDetailPage.tsx`, `SiteDialog.tsx`
- `src/components/assets/JobAssetsTab.tsx`, `EquipmentAssetsTable.tsx`,
  `EquipmentAssetDialog.tsx`, `BulkAssetImportDialog.tsx`, `AddAssetsFromSiteDialog.tsx`,
  `AdoptExistingReportsDialog.tsx`
- `src/components/jobs/ReportTemplatePicker.tsx` (extracted from `JobDetail.tsx:10348`)
- `src/components/reports/useEquipmentAssetPrefill.ts`
- `src/lib/types/assetTracking.ts`

**Modified**
- `src/App.tsx` — `/sites`, `/sites/:siteId`, `/:division/sites` routes
- `src/components/ui/Layout.tsx` — Sites nav entry after Customers
- `src/components/jobs/JobDetail.tsx` — one tab button, one render line, extract the picker
- A first batch of `src/components/reports/*.tsx` — prefill + `equipment_asset_id` on save

Style: `Button` from `@/components/ui` with `leftIcon` (never an icon as a child),
`rounded-none`, `bg-brand` / `text-brand` — never `#f26722` — full `dark:` coverage,
`neutral-*` Tailwind neutrals (no `gray-*` / `zinc-*`), and `<div>` for nav, never `<nav>`.

---

## 6. Verification

1. **Migration** — paste `create_asset_tracking_tables.sql` into the Supabase SQL editor:
   ```sql
   select table_name from information_schema.tables
    where table_schema in ('common','neta_ops')
      and table_name in ('sites','equipment_assets','job_equipment_assets','equipment_types');
   ```
   Confirm `equipment_assets` has **no** `customer_id` column.
2. **Delete guard** — insert an `assets` row with an `equipment_asset_id`, then try to delete
   that equipment asset. Postgres must raise a foreign-key violation.
3. **End to end** (`npm run dev` — you run it):
   - Sites → add "QTS ATL2", Atlanta GA.
   - Site detail → Bulk import: drop your real ATL2 `.xlsx`, map the columns, import.
     Spot-check counts and the duplicate warnings.
   - Add one asset by hand: DC7 / Substation 3 / CB-101 / Electrical Room 2 / LV Circuit
     Breaker. Confirm it saves with **no report created**.
   - Duplicate ×24 → CB-102…CB-125 appear.
   - Job 26078 → Assets tab → pick site ATL2 → "Add assets from site", filter to DC7,
     select all, add. Only that subset shows on the job.
   - **The key test:** create a second job at ATL2 with a *different customer*. Its Assets
     tab must offer the same ATL2 asset list, and both jobs' reports must attach to the same
     `CB-101` row.
   - Adopt from existing reports on a job that already has reports; verify counts and that a
     second run creates nothing.
   - Create Report from CB-101 → identifier / substation / equipment location pre-filled;
     save; the asset's report count becomes 1; Delete is now blocked with a clear message.
4. **No regressions** — the existing Reports tab, report approval workflow and PDF upload
   behave exactly as before for assets with a null `equipment_asset_id`.
5. `npx tsc --noEmit` (you run it) must be clean.

---

## Not in this phase

Asset-level status/progress rollup across jobs, a read-only "sites worked" list on the
customer page, nameplate autofill from `common.device_catalog`, retiring the scraper
entirely, and customer-portal visibility of the registry.
