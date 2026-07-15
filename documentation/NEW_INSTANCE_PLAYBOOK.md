# New Instance Playbook — stand up ampOS for a new customer

Step-by-step checklist for deploying a private ampOS copy for a buyer.
Everything company-specific is configuration — no code edits needed except
the two find-replaces called out in the database step.

Rough time budget: ~1 day the first time, half a day once practiced.

---

## 0. What the buyer must give you

- [ ] Company name (short + full legal name)
- [ ] Email domain(s) their staff will log in with (e.g. `@acme.com`)
- [ ] Two superuser emails (their owner/admin people)
- [ ] Phone, mailing address, ship-to address (appear on POs/proposals)
- [ ] Accounting email (vendor invoices) and purchase-orders email
- [ ] Logo files: full logo + small square mark (SVG or PNG)
- [ ] Brand color (or pick it from their logo on the Website Theme page)
- [ ] Default proposal signer name + title
- [ ] Their own QuickBooks Online account (admin login available)
- [ ] Legal review of `src/pages/EULA.tsx` / `Privacy.tsx` text for their entity
- [ ] Proposal terms/safety text review (defaults are AMP's wording)

## 1. Accounts to create (one set per customer)

| Service | Where | What you need from it | Cost |
|---|---|---|---|
| Supabase project | supabase.com → New project | Project URL, anon key, service-role key, DB password | Paid tier recommended (backups) |
| Netlify site (staff app) | netlify.com | Site + custom domain | Free tier works to start |
| Netlify site (customer portal) | netlify.com | Second site, e.g. `customer.<their-domain>` | Free tier |
| Postmark | postmarkapp.com | Server API token + verified sender domain (their domain!) | Paid, ~$15/mo |
| QuickBooks app | developer.intuit.com | Client ID + secret, redirect URI configured | Free |
| Browserless | browserless.io | API token (report PDF rendering) | Paid |
| DeepSeek | platform.deepseek.com | API key (custom-form AI generator — optional) | Pay-per-use |
| Google service account | console.cloud.google.com | JSON key (contacts sheet sync — optional, skip unless they want it) | Free |

## 2. Database

Follow `database/bootstrap/README.md` exactly:

1. Regenerate the schema snapshot if it's older than the last schema change.
2. Find-replace the AMP emails/domain per the README table.
3. Run `00` → `04` in the new project's SQL editor.
4. Create their first admin user (SQL in the README).

(The SVG-upload fix and the `app_settings` table are already baked into the
bootstrap export — no extra migrations needed.)

## 3. Edge functions (server side)

From the repo, with the Supabase CLI linked to the NEW project
(`supabase link --project-ref <new-ref>`):

```
supabase functions deploy   # deploys all functions in supabase/functions/
```

Then set the function secrets (Dashboard → Edge Functions → Secrets, or
`supabase secrets set NAME=value`):

**Company identity** (defaults are AMP's — set all of these)
- `COMPANY_NAME` — short name, e.g. `Acme`
- `COMPANY_FULL_NAME` — e.g. `Acme Testing Services`
- `COMPANY_ADMIN_EMAIL` — their admin notification inbox
- `COMPANY_OPS_EMAIL` — their ops inbox (default email sender + reports)
- `COMPANY_SUPERUSER_EMAILS` — comma-separated, same two as the DB step
- `COMPANY_EMPLOYEE_DOMAINS` — e.g. `@acme.com`
- `COMPANY_BRAND_COLOR` — hex, used in notification emails
- `ACCOUNTING_NOTIFICATION_EMAIL` — their accounting inbox

**Email** — `POSTMARK_API_KEY`, `POSTMARK_FROM` (must be on their verified domain)

**QuickBooks** — `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_ENVIRONMENT`
(`production`), `QB_REDIRECT_URI` (their staff-app URL +
`/auth/quickbooks/callback`), `QB_ENCRYPTION_KEY` (generate: 32+ random chars)

**Report PDFs** — `BROWSERLESS_URL`, `BROWSERLESS_TOKEN`,
`PRINT_TOKEN_SECRET` (generate: random string), `RENDERER_EMAIL` +
`RENDERER_PASSWORD` (create a dedicated `report-renderer@<their-domain>`
user in their instance), `STAFF_APP_URL` (their deployed staff-app URL)

**URLs** — `APP_URL`, `SITE_URL`, `CUSTOMER_PORTAL_URL`

**Optional** — `DEEPSEEK_API_KEY` (form AI), `GOOGLE_SERVICE_ACCOUNT_KEY` +
`AMP_CONTACTS_SHEET_ID` (contacts sheet sync)

## 4. Staff web app (Netlify)

New Netlify site from this repo, build command `npm run build`, publish
`dist` (netlify.toml already says this). Environment variables:

**Core**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — from the new project
- `VITE_QB_CLIENT_ID`, `VITE_QB_ENVIRONMENT`, `VITE_QB_REDIRECT_URI`,
  `VITE_QB_SCOPE=com.intuit.quickbooks.accounting`

**Company identity** (defaults are AMP's — set all)
- `VITE_COMPANY_NAME`, `VITE_COMPANY_FULL_NAME`, `VITE_COMPANY_LEGAL_NAME`
- `VITE_COMPANY_PHONE`, `VITE_COMPANY_ADDRESS`, `VITE_COMPANY_ADDRESS_FOOTER`
- `VITE_COMPANY_SHIPTO_ADDRESS`, `VITE_COMPANY_SHIPTO_CITY`,
  `VITE_COMPANY_SHIPTO_STATE`, `VITE_COMPANY_SHIPTO_ZIP`
- `VITE_COMPANY_ACCOUNTING_EMAIL`, `VITE_COMPANY_PO_EMAIL`,
  `VITE_COMPANY_SUPPORT_EMAIL`
- `VITE_COMPANY_WEBSITE`, `VITE_COMPANY_PRODUCT_URL`
- `VITE_COMPANY_EMAIL_DOMAINS` (comma-separated), `VITE_COMPANY_SUPERUSER_EMAILS`
- `VITE_COMPANY_SIGNER_NAME`, `VITE_COMPANY_SIGNER_TITLE`
- `VITE_COMPANY_BRAND_COLOR`, `VITE_COMPANY_BRAND_COLOR_DARK`
- `VITE_COMPANY_LOGO`, `VITE_COMPANY_FAVICON` (paths under `public/`)
- `VITE_COMPANY_SHOW_HR_HANDBOOK=false` (handbook text is AMP's)
- `VITE_COMPANY_OFFLINE_RELEASE_BASE` (only if they get the offline app)

Swap the logo files in `public/` (or skip — admins can upload logos on the
Website Theme page after launch; the favicon still comes from `public/`).

## 5. Customer portal (second Netlify site)

Deploy `customer-portal/` as its own site (its netlify.toml is inside that
folder). Set its `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_SUPPORT_EMAIL`. Point `customer.<their-domain>` at it, and make sure
the `CUSTOMER_PORTAL_URL` function secret matches.

## 6. Supabase dashboard settings (not in SQL)

- Authentication → URL Configuration: site URL = their staff-app URL;
  add redirect URLs for `/auth/callback` on both sites
- Authentication → Email templates: re-word (they say ampOS by default)
- Database → Backups: confirm daily backups are on

## 7. Branding polish (in the app)

Log in as their admin → Admin Dashboard → **Website Theme**: upload their
logos, pick brand color (suggestions appear from the logo), Save.

## 8. Smoke test (30 minutes)

- [ ] Log in with a `@their-domain` account; confirm an outside email is rejected at signup
- [ ] Create customer → create job → open job detail
- [ ] Generate a proposal: their name/address/signer/color throughout, no "AMP" anywhere
- [ ] Print a vendor PO: their header, remit email, phone
- [ ] Trigger a notification email (flag a report): their color/name/footer, sender on their domain
- [ ] Connect QuickBooks (their account) and pull a project
- [ ] Publish a report PDF (tests Browserless + renderer user)
- [ ] Customer portal: invite a test customer, log in, download the report
- [ ] Website Theme page: change color, reload, confirm it stuck

## Known limitations

- **Offline desktop app** still carries AMP branding (~2,100 hardcoded
  colors) — don't offer it to buyers until it's converted.
- `public/clear-cache.html` shows the default orange (static utility page).
- Email colors come from `COMPANY_BRAND_COLOR`, not the Website Theme page —
  if they re-theme in the app, update the secret to match.
- The HR employee handbook is AMP's legal text — leave
  `VITE_COMPANY_SHOW_HR_HANDBOOK=false` until they supply their own.
- About popup tells AMP's company story (`src/components/ui/AboutPopup.tsx`)
  — needs a per-instance rewrite or hiding if a buyer objects.
