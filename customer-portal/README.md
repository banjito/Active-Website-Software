# ampOS Customer Portal

Standalone, customer-facing portal for ampOS. Customers sign in and **view/download the reports for the jobs they've given AMP**. Read-only.

It is a separate Vite + React app from the staff app, but runs against the **same Supabase project**. Tenant isolation is enforced entirely by Postgres **RLS** (see `../Database Scripts/Setup & Configuration/customer_portal_security.sql`) — this app holds no secrets beyond the public anon key.

## Local development

```bash
cd customer-portal
cp .env.example .env        # fill in the SAME VITE_SUPABASE_URL / ANON_KEY as the staff app
npm install
npm run dev                 # http://localhost:5174
```

### Getting a customer login to test with

**Full invite flow:** in the staff app, invite a customer email (the `customer-portal-invite` edge function). The email link opens `/accept-invite?token=…` here, which calls `customer-portal-accept-invite` to link the account. For local testing, set the function's `CUSTOMER_PORTAL_URL` to `http://localhost:5174`, or paste the link manually using a token from `common.customer_invites`.

**Shortcut for dev:** in the Supabase dashboard, create an auth user, set its `app_metadata` to `{ "account_type": "customer", "customer_id": "<a real common.customers.id>" }`, and insert a matching row in `common.customer_users`. Then sign in directly.

## Backend setup (run once, in Supabase SQL Editor)

1. `../Database Scripts/Setup & Configuration/customer_portal_security.sql` — tenancy + RLS (already present).
2. `../Database Scripts/Setup & Configuration/customer_portal_report_artifacts.sql` — adds `technical_reports.published_pdf_path` + the private `customer-reports` bucket.

Edge functions used (deploy under `../supabase/functions/`):
- `customer-portal-invite`, `customer-portal-accept-invite` — login/invite (existing).
- `customer-report-download` — mints signed download URLs after re-checking RLS (new, Gap 1).

## What it shows

- **My Jobs** — the customer's jobs (`neta_ops.jobs`, RLS-scoped).
- **Job detail** — reports + assets tested for that job.
- **Reports** — all published (`approved`/`sent`) reports across the account, with type filter + download.

Reports become downloadable once the staff app writes `published_pdf_path` (and uploads the PDF to the `customer-reports` bucket) when a report is approved/sent. Oil-analysis reports (`report_type = 'oil_analysis'`) ride the exact same path — no separate handling here.

## Deployment

Deploy as a **separate Netlify site** with Base directory `customer-portal`, then point `customer.ampos.io` at it. See `netlify.toml`.
