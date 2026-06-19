# ampOS Customer Portal — Build Plan

**Status:** v2.0 — living roadmap (phase progress tracked in §8)
**Owner:** Jack Lyons
**Last updated:** June 19, 2026

> **Progress at a glance:** Phase 0 ✅ · Phase 1 ✅ (real-PDF pipeline live; a few follow-ups open) · Phase 2 ⬜ (oil reports, not started) · Phase 3 ⬜ (billing, deferred). Full checklist in §8.

> **Re-grounding note (v1.0):** v0.1 of this plan was drafted from "MVA Diagnostics" oil-lab assumptions (DGA gases, oil quality, samples, syringes, Duval triangles). A full pass over this repo shows **ampOS is a NETA electrical field-testing CRM** — it manages `jobs → assets → technical_reports` and produces *electrical test reports*. There is **no** code for oil chemistry, samples, DGA, syringes, or a diagnostics status engine (`OilAnalysisReport.tsx` is a 40-line stub). This version replaces the unbuildable oil-lab framing with a plan that is **airtight and buildable on today's data**, and adds a forward-compatible framework for customer-viewable **oil test reports** as a future workflow. The original oil-diagnostics vision is preserved in §10.

---

## 1. What this is

A **brand-new, standalone, customer-facing web portal** (separate app, separate login) that lets AMP's end-clients sign in and **view the reports for the jobs they've given AMP** — read-only, scoped strictly to their own account.

The visibility chain is simple and is the heart of the product:

```
report  →  job  →  customer (the signed-in account)
```

At launch a customer can:
- See **their jobs** (the work AMP did for them).
- See the **assets** tested on those jobs.
- View and **download the finished reports** (electrical test reports today; AMP oil test reports in a later phase).

Out of scope at launch: invoices/billing, self-service ordering, write-back into ampOS, and any in-portal diagnostics/status engine.

### Key enabling discovery

**The customer-portal security foundation already exists in this repo** — tenancy tables, RLS policies, identity helpers, and invite/accept edge functions are all built and target `customer.ampos.io`. The hard part (tenant isolation) is done; this project is primarily a **frontend plus two well-scoped backend gaps**. See §4.

---

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Domain framing | Build on **real ampOS** (`jobs/assets/technical_reports`); add a path for customers to view **oil sample reports** via a new, separate framework. |
| Codebase | **Brand-new standalone SPA** at `customer.ampos.io`, separate from the staff app, with its own **customer login**. |
| Launch scope | **Read-only.** Customers view/download reports for their jobs. No write-back. |
| Invoices/billing | **Deferred** to a future phase. |
| Tenant isolation | Enforced by **Postgres RLS that already exists** — never by the client. |

---

## 3. Architecture

- **New app:** a separate **Vite + React + TypeScript** SPA, deployed at **`customer.ampos.io`** — the redirect target already hardcoded in the existing invite edge function. Reuse the staff app's UI stack (Tailwind + shadcn/Radix, `#f26722` brand, dark-mode `ThemeProvider`) so components and look-and-feel can be copied over.
- **Same Supabase project** as the staff app (Postgres + Auth + Storage + Edge Functions). The portal authenticates with the **anon key** via Supabase Auth (PKCE), exactly like the staff app (`@supabase/supabase-js`).
- **No BFF / no custom API server.** The portal queries Supabase directly; **RLS** guarantees it can only ever read its own customer's `approved`/`sent` records.
- **Read-only:** the portal issues `SELECT` only. Existing RLS grants customers `SELECT` (and nothing else) on the relevant tables.

---

## 4. What already exists — reuse, do NOT rebuild

All in `Database Scripts/Setup & Configuration/customer_portal_security.sql` and `supabase/functions/`:

- **Tenancy tables**
  - `common.customer_users` — `auth_user_id` (UNIQUE) → `customer_id`. Binds one login to exactly one customer account.
  - `common.customer_invites` — `email, customer_id, token, expires_at, accepted_at/by, revoked_at`. Drives org invites.
- **Identity helpers (SECURITY DEFINER)**
  - `common.current_customer_id()` — resolves the caller's customer from the JWT.
  - `common.is_employee_user()` — distinguishes AMP staff (`@ampqes.com` / role list) from customers.
- **Visibility gates** — all require the record belong to the caller's customer **and** be in status `approved`/`sent`:
  - `common.customer_can_select_job(job_id)`
  - `common.customer_can_select_asset(asset_id)`
  - `common.customer_can_select_technical_report(report_id)`
- **RLS policies** already live on `neta_ops.jobs`, `neta_ops.assets`, `neta_ops.technical_reports`, `neta_ops.asset_reports`: employees manage everything; **customers can only `SELECT` their own company's `approved`/`sent` records.** Per-type report tables (e.g. `liquid_filled_xfmr_ats25_reports`) are locked to employees only.
- **Invite flow edge functions**
  - `supabase/functions/customer-portal-invite/index.ts` — employee-only; creates an invite and calls `auth.admin.inviteUserByEmail` with `redirectTo = CUSTOMER_PORTAL_URL/accept-invite?token=…`.
  - `supabase/functions/customer-portal-accept-invite/index.ts` — validates the token, creates the `customer_users` link, stamps `app_metadata.account_type='customer'` + `customer_id`.
- **Verification SQL:** `Database Scripts/Verification & Testing/customer_portal_rls_verification.sql`.

**Conclusion:** tenancy, invites, customer login, and tenant isolation are already implemented at the data layer. The portal frontend can rely on them as a trusted contract.

---

## 5. The data chain the portal renders

```
common.customers                       (the account)
  └─ neta_ops.jobs                      (jobs.customer_id = common.current_customer_id())
       └─ neta_ops.asset_reports / job_assets
            ├─ neta_ops.assets          (status approved|sent)
            └─ neta_ops.technical_reports (status approved|sent, report_data JSONB)
```

A logged-in customer sees their **jobs**, the **assets** tested on those jobs, and the **technical reports** for those jobs — but only once a report (and its asset) is `approved` or `sent`. This is exactly what the existing RLS enforces, so the portal needs **no new scoping logic** for electrical reports.

Reference files: `src/types/supabase.ts` (jobs/customers types), `src/lib/services/reportService.ts` (report lifecycle + `markReportAsSent()`), `Database Scripts/Setup & Configuration/manual-setup-technical-reports.sql` (`technical_reports` + `asset_reports` schema).

---

## 6. Gaps to build

### Gap 1 — A customer-downloadable report artifact (required for MVP)

Today, electrical reports are **React components rendered at staff-app routes** and turned into PDFs via browser print (`src/services/pdfExportService.ts`, `headlessPrint()`), or manually uploaded to the `job-documents` Storage bucket. There is **no stored, customer-accessible PDF** tied to a `technical_report`. The standalone portal can't re-render the staff report components, so it needs a stored artifact.

Build:
1. **On publish/send (staff side):** when a report is marked `sent`/`approved`, generate a PDF and store it in a private Storage bucket, e.g. `customer-reports/{customer_id}/{job_id}/{report_id}.pdf`. Reuse the existing `pdfExportService` print path, or wire the already-installed `puppeteer` into an edge function for a server-side render. Hook this into `markReportAsSent()` in `src/lib/services/reportService.ts`.
2. **Signed-URL edge function** `customer-report-download`: takes a `report_id`, verifies `common.customer_can_select_technical_report(report_id)` for the caller, and returns a short-lived signed URL. **The bucket stays private** — never public — so the artifact rides the identical security path as the metadata.
3. Persist the artifact path on the report (e.g. a `published_pdf_path` column on `neta_ops.technical_reports`, or reuse `neta_ops.generated_documents`).

### Gap 2 — Oil Test Report framework (forward-compatible, future workflow)

Future workflow: a technician uploads a third-party **MVA oil PDF**, ampOS produces a branded **AMP Oil Test report**, and the customer views it in the portal.

**Airtight modeling decision: represent oil reports as `neta_ops.technical_reports` rows** with `report_type = 'oil_analysis'`, attached to a `job_id` (and optionally an asset via `asset_reports`). Because of this, oil reports **ride the exact same RLS, visibility gates, and `approved`/`sent` workflow** already trusted for electrical reports — the customer portal lists and downloads them with **zero new security code**. The `report_data` JSONB holds parsed/structured oil values; the source MVA PDF and the generated AMP PDF live in the same `customer-reports` bucket.

Build (staff side — can be a later phase; the portal only needs to *display* the result):
- A new, **separate staff page** to upload the MVA source PDF, capture/parse oil values into `report_data`, and generate the AMP-branded oil report PDF (flesh out the `src/components/reports/OilAnalysisReport.tsx` stub).
- Persist as a `technical_reports` row (`report_type='oil_analysis'`) + artifact in the `customer-reports` bucket.
- **No new RLS needed** — `customer_can_select_technical_report` already covers it.

The customer portal treats electrical and oil reports uniformly: both are `technical_reports` for the customer's jobs, filterable by `report_type`.

---

## 7. Customer portal pages (MVP, read-only)

Minimal, status-first, mobile-responsive. Copy UI primitives from staff `src/components/ui/*`.

1. **Auth** — login (email + magic link / password) and an `/accept-invite?token=…` page that calls the existing `customer-portal-accept-invite` edge function. Mirror the staff `AuthContext` / `RequireAuth` pattern; gate the app on `app_metadata.account_type === 'customer'`.
2. **Dashboard / "My Jobs"** — the customer's jobs (`neta_ops.jobs`, RLS-scoped): job number, title, site address, status, # reports available, date. Status-first; search by job number / site.
3. **Job detail** — job header + the **assets** tested and the **reports** available for that job (electrical + oil, by `report_type`). Each report row → download.
4. **Reports (all)** — flat, cross-job list of every available report for the account; filter by type / job / date; single + bulk download (zip). Downloads go through the `customer-report-download` signed-URL function.
5. **Report viewer** — MVP downloads the stored PDF (optional inline preview via `pdfjs`). No in-portal re-rendering of report components.
6. **Settings** — profile + (later) notification prefs (`common.profiles.portal_preferences` already exists).

Explicitly **out of MVP:** invoices, self-service ordering, write-back, the diagnostics/status engine, Locations-as-entity, and anything oil-sampling-specific (samples/syringes/Duval do not exist in ampOS).

---

## 8. Phased delivery (progress tracker)

Legend: `[x]` done · `[ ]` not done. Phase status: ✅ complete · 🟡 in progress · ⬜ not started.

### Phase 0 — Foundations & tenant isolation ✅
- [x] Tenancy tables, identity helpers, visibility gates, RLS (`customer_portal_security.sql`)
- [x] Invite + accept edge functions deployed (`customer-portal-invite`, `customer-portal-accept-invite`)
- [x] Standalone portal SPA (`customer-portal/`) with Supabase auth + `/accept-invite` page
- [x] Tenant isolation working (RLS scopes every read to the customer's own `approved`/`sent` records)
- [ ] Automated tenant-isolation test (A must never see B) — still verified manually

### Phase 1 — Read-only MVP: view & download real reports ✅
- [x] **My Jobs** list (RLS-scoped), with report counts and search
- [x] **Job detail** — reports grouped by substation; **Reports** page with search + status filter
- [x] `common.customer_report_assets()` RPC — asset-centric, approved/sent, customer-scoped
- [x] `neta_ops.assets.published_pdf_path` + private `customer-reports` storage bucket
- [x] `customer-report-download` signed-URL edge function (asset-aware; bucket stays private)
- [x] Staff **"Invite to Customer Portal"** button (handles existing users); clickable customer link on jobs
- [x] **Real-PDF pipeline** (see sub-tracker below)

#### Phase 1 sub-track — Real-PDF generation
- [x] Signed HMAC **print-token** scheme (shared by Node minter + Deno validator)
- [x] `report-print-auth` edge function — validates token → returns renderer session
- [x] `RequireAuth` print-token bootstrap (token → `setSession`; inert for normal staff)
- [x] **Local-puppeteer backfill** `scripts/publish-report-pdfs.mjs` — resumable; `--customer`/`--job`/`--limit`/`--force`
- [ ] Run the full backfill across existing sent/approved reports (~2000; resumable, in batches)
- [ ] `html2canvas` on-send fallback — **interim**, in place; to be removed once on-send real-PDF ships
- [ ] On-send **real** PDF via Browserless edge function (requires staff app deployed)
- [ ] Admin "refresh sent-reports backfill" page/button (approach TBD)
- [ ] Dial the `report-renderer@ampqes.com` account down from Super Admin to a plain employee user

### Phase 2 — Oil Test Report framework ⬜
- [ ] Staff page: upload third-party **MVA oil PDF** → parse values into `report_data` → generate AMP-branded oil report
- [ ] Persist as `technical_reports` with `report_type='oil_analysis'` (+ asset link) + PDF in `customer-reports`
- [ ] Flesh out the `src/components/reports/OilAnalysisReport.tsx` stub
- [ ] Portal displays oil reports automatically (no new portal/RLS code — rides the same path)
- [ ] Release-notification emails (reuse existing notification edge functions)

### Phase 3 — Billing & self-service ⬜ (deferred)
- [ ] Invoices / balances (QuickBooks integration)
- [ ] Self-service requests / write-back into ampOS
- [ ] Trends / analytics once structured oil `report_data` accumulates

---

## 9. Security / tenant isolation (non-negotiable)

- Every customer query relies on RLS keyed to `common.current_customer_id()` + `approved`/`sent` status. **Never** trust a client-supplied account id.
- Report artifacts are served **only** via signed URLs minted by an edge function that re-checks `customer_can_select_technical_report`. The bucket stays private.
- Per-type report tables (e.g. `liquid_filled_xfmr_ats25_reports`) remain **employee-only** (enforced by the discovery block in `customer_portal_security.sql`). The portal reads `technical_reports` + the stored PDF, not per-type tables.
- If "view as customer" / staff impersonation is added later, it must be audit-logged.

---

## 10. Future vision — oil diagnostics (parked)

The richer oil-diagnostics product from v0.1 (structured DGA per IEEE C57.104, oil quality per C57.106, ester scoring per C57.155, Duval triangle/pentagon, trend charts, a centralized status engine, fleet health dashboards) remains a worthwhile long-term direction. None of it exists in ampOS today, so it is intentionally **out of scope** for this build. The Gap 2 framework is the on-ramp: once AMP oil reports are flowing through `technical_reports` as structured `report_data`, that JSONB becomes the seed for trend charts and a status engine later — without re-architecting tenancy or visibility.

---

## 11. Verification

1. **RLS proof:** run `Database Scripts/Verification & Testing/customer_portal_rls_verification.sql`; add an automated test that signs in as a seeded customer and asserts (a) they see only their own `approved`/`sent` jobs/reports, (b) a draft/in-review report is invisible, (c) another customer's records return zero rows.
2. **Invite flow:** create an invite via `customer-portal-invite` (as staff), accept via the portal `/accept-invite` page, confirm the `customer_users` link + `app_metadata.account_type='customer'` + `customer_id` are set.
3. **Download path:** mark a report `sent` (staff `markReportAsSent()`), confirm the PDF artifact is generated and that `customer-report-download` returns a working signed URL for the owning customer and **403/empty** for a non-owning customer.
4. **Oil report (Phase 2):** upload a sample MVA PDF, generate an AMP oil report row (`report_type='oil_analysis'`, status `sent`), confirm it appears in the owning customer's portal and downloads — with no RLS changes.
5. Run the portal against the same Supabase project and manually walk the report → job → customer chain for a real seeded account.

---

## 12. Critical files

| File | Role |
|---|---|
| `Database Scripts/Setup & Configuration/customer_portal_security.sql` | Tenancy + RLS (already built; the contract the portal trusts) |
| `supabase/functions/customer-portal-invite/index.ts` | Staff-initiated invite (reuse as-is) |
| `supabase/functions/customer-portal-accept-invite/index.ts` | Token accept → creates `customer_users` link (reuse as-is) |
| `src/lib/services/reportService.ts` | Report lifecycle + `markReportAsSent()` (hook PDF-artifact generation here) |
| `src/services/pdfExportService.ts` | Existing PDF generation to reuse for the published artifact |
| `Database Scripts/Setup & Configuration/manual-setup-technical-reports.sql` | `technical_reports` / `asset_reports` schema (entity the portal renders; oil reports become rows here) |
| `src/components/reports/OilAnalysisReport.tsx` | Stub to flesh out for the AMP oil report (Phase 2) |
| `src/components/ui/*`, `tailwind.config.cjs`, `src/components/theme/*` | UI primitives / brand to copy into the new app |
| `Database Scripts/Verification & Testing/customer_portal_rls_verification.sql` | Tenant-isolation verification |
