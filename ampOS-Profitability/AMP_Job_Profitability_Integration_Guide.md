# AMP Job Profitability Tracker — Integration Guide

**Prepared for:** Jack (ampOS) — to integrate native job-profitability tracking into ampOS
**Prepared by:** Jeremy Smith (Fractional CFO), with build support
**Date:** 2026-06-30
**Status:** Working reference implementation complete; this document is the spec to rebuild it natively in ampOS.

---

## 1. What this is and why

A live **"are we ahead or behind the quote?"** tracker for every AMP (AMPQES) job. For each job it compares, **by cost category**:

- **The QUOTE / budget** — what was bid (from ampOS estimates)
- **The ACTUALS to date** — real revenue, cost, and **to-the-day labor hours** (from QuickBooks)

…and reports **gross margin vs the 40% target**, projected to completion (so an early-stage job isn't flattered), with **click-any-number drill-down** to the underlying records.

A fully working reference implementation exists today (Python + a self-contained HTML dashboard, refreshed daily). **This guide gives you everything to rebuild it *inside* ampOS**, where the bid data already lives and only the QuickBooks actuals need to be brought in.

The headline business goal: **watch gross margin, target 40%**, and catch jobs trending below it *while they're still running.*

---

## 2. Architecture / data flow

```
   ampOS (Supabase)                         QuickBooks Online (AMPQES)
   ─────────────────                        ──────────────────────────
   business.opportunities  ┐               Customer (Job=true sub-customers)
   business.estimates      │  BID/BUDGET    TimeActivity   (to-the-day hours + cost rate)
   neta_ops.jobs           │                Invoice        (billed / collected)
   common.customers        ┘                ProfitAndLossDetail by customer (cost by account)
            │                                          │
            └──────────────┬───────────────────────────┘
                           │  JOIN on job number
                           ▼
                 Per-job profitability model
            (budget vs actual by category, EAC margin)
                           │
                           ▼
                 Dashboard UI (per job)
```

**The whole trick is the join:** an ampOS **job number** (e.g. `26011`) equals the prefix of the QBO **sub-customer name** (`26011 - DC Blox ATL-1B Tenant Fit Out`). See §4.

**For ampOS, the bid side is already in your database.** The integration work is: (a) bring in the QBO actuals keyed by job, (b) implement the calculations in §5–6, (c) build the UI in §7.

### 2.1 Native (your) access vs. the reference's external access — important
The reference implementation reaches ampOS **from outside** (anon key + a user access token minted from a Supabase refresh token + the `Accept-Profile` header). **You do not need any of that.** You are *inside* ampOS: the quote/bid tables (`business.opportunities`, `business.estimates`, `neta_ops.jobs`) are your own database — query them directly with your normal server/Supabase privileges. **The quote data does NOT need to be re-sourced through the external API; it already works for you.**

So from your side:
- **Quote/budget side → already native.** Reuse the field map and JSON shapes in §3 and the formulas in §6.1; ignore `ampos_auth.py` / `pull_ampos.py` (those exist only so an *external* tool could read your DB).
- **Actuals side → the real new build.** QuickBooks data is not in ampOS today. Sync `TimeActivity` / `Invoice` / `ProfitAndLossDetail` per job (§11, step 2).

Bottom line: the only genuinely new data integration is QuickBooks. Everything on the quote side is reading tables you already own.

---

## 3. Data sources & fields

### 3.1 ampOS (Supabase project `vdxprdihmbqomwqfldpo`)

PostgREST exposes multiple Postgres schemas; set the schema per request with the `Accept-Profile` header (REST) or `db.schema` (supabase-js). **You already own this data** — listed here so the field semantics are unambiguous.

| Table | Schema | Fields used | Notes |
|---|---|---|---|
| `opportunities` | `business` | `id, quote_number, title, quoted_amount, total_man_hours, status, opportunity_type, amp_division, customer_id, contact_id, job_id, awarded_date, prepared_by, probability` | The bid. **`quoted_amount` is the authoritative bid revenue.** `status`: awareness/interest/quote/decision/awarded/lost/no quote. `opportunity_type`: large_acceptance/small_acceptance/maintenance/engineering/time_materials/other. |
| `estimates` | `business` | `id, opportunity_id, status, created_at, data (JSONB), travel_data` | **The quote breakdown lives in `data`** (see §3.3). Use the latest estimate per opportunity (`ORDER BY created_at DESC`). |
| `jobs` | `neta_ops` | `id, job_number, title, budget, estimated_man_hours, opportunity_id, status, division, customer_id, quickbooks_project_id, quickbooks_project_name` | The won/active job. **`opportunity_id` links back to the bid.** `status`: pending/in_progress/ready_to_bill/progress_billing/billed/completed/cancelled. **`quickbooks_project_id` / `_name` exist but are currently EMPTY — see §4 recommendation.** |
| `customers` | `common` | `id, name, company_name` | For display names. |
| `contacts` | `common` | `id, customer_id, first_name, last_name, email` | Optional. |

### 3.2 Important: `estimates.data.calculatedValues` is UNRELIABLE for dollars
The estimate JSON stores a `calculatedValues` block whose `grandTotal` / labor figures **do not reconcile** with the actual quoted price (they store labor *hours* in a labor-$ field, etc. — see the existing "Estimator Labor Bug" memo). **Do not use it for money.** Use `opportunities.quoted_amount` for revenue and derive budget cost from the line items + hours (§6.1).

### 3.3 `estimates.data` (JSONB) — the quote breakdown
```jsonc
{
  "sovItems": [                       // scope-of-value line items
    { "item": "Low Voltage Panelboard PDP", "quantity": 1,
      "materialPrice": 0, "expensePrice": 0,
      "laborMen": 2, "laborHours": 3, "notes": "PDP-J/1" }
  ],
  "hoursSummary": {                    // labor hours roll-up (RELIABLE)
    "men": 2, "hoursPerDay": 8, "daysOnsite": 6.3,
    "workHours": 64,        // onsite SOV labor hours
    "nonSovHours": 4,
    "travelHours": 12.16,
    "totalHours": 80.16,
    "straightTimeHours": 50.6, "overtimeHours": 0, "doubleTimeHours": 0
  },
  "travel_data": {
    "travelExpense": [ { "trips": 5, "totalMiles": 250, "rate": 3, "vehicleTravelCost": 750 } ],   // mileage cost
    "travelTime":   [ { "grandTotalTravelHours": 10, "rate": 240, "totalTravelLabor": 2400 } ],     // travel labor
    "perDiem":      [ { "numDays": 0, "firstDayRate": 65 } ]
  },
  "hourlyRates": { "straightTime": 240, "overtime": 360, "doubleTime": 480 },   // BILLING rate, not cost
  "mobilizationFactors": { "base": 0, "over100k": 0.10, "over500k": 0.05, "over1m": 0.05 },
  "paymentTermFactors":  { "net30": 1, "net60": 1.06, "net90": 1.09 },
  "materialMarkup": 0
}
```
Note `hourlyRates` (ST $240) is the **billing** rate used to price the quote — it is *not* labor cost. Actual labor cost comes from QBO (§3.4).

### 3.4 QuickBooks Online (AMPQES — realm `123145887114114`, Accounting API, read-only)

| Entity | Fields used | Purpose |
|---|---|---|
| `Customer` (where `Job=true`) | `Id, DisplayName, FullyQualifiedName` | Jobs are **sub-customers** named `"<jobnumber> - <title>"`. The join key. |
| `TimeActivity` | `TxnDate, EmployeeRef, CustomerRef, Hours, Minutes, CostRate, Description` | **To-the-day labor hours and cost.** Labor cost = `Hours × CostRate`. ~51,800 rows company-wide. |
| `Invoice` | `TxnDate, DocNumber, TotalAmt, Balance, CustomerRef` | Billed (`TotalAmt`) and collected (`TotalAmt − Balance`) revenue per job. |
| `ProfitAndLossDetail` report, `customer=<Id>`, `accounting_method=Accrual` | rows by account | **Authoritative job cost by category** (materials, travel, per diem, *and* job-costed wages where present). |

### 3.5 QuickBooks connection — the ONE credential you must set up (where the token goes)

This is the **only** token you need to add. The ampOS/quote side is native (no token — see §2.1); QuickBooks is the one external system.

> **Do not reuse the reference's QuickBooks access.** The reference reads QBO through Jeremy's shared CLI (`AI\QBO\qbo.js --client ampqes`) with his OAuth app and tokens in `~/.qbo-tokens/.env`. That is *Jeremy's personal external setup* — **not** what ampOS uses. ampOS needs its **own** server-side QBO connection.

**Set up an OAuth2 connection from the ampOS backend to the AMPQES QuickBooks company:**

1. **App credentials (Client ID + Secret).** Use AMP's existing Intuit Developer app if there is one, otherwise create one at developer.intuit.com (Production keys). Store the **Client ID/Secret as backend secrets** (env vars / secret manager) — e.g. `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`. Never in client-side code.
2. **Scope:** `com.intuit.quickbooks.accounting` (read-only is sufficient for this tool).
3. **Company / realm:** AMPQES = realm **`123145887114114`**. An AMPQES QuickBooks **admin authorizes once** via the OAuth2 consent flow; the callback returns the `realmId` + an authorization code you exchange for tokens.
4. **Tokens (this is "where the token goes"):** the exchange returns an **access token (~1 hour)** and a **refresh token (~100 days, rotates on each use)**. Store both **server-side** (a secrets table / secure config keyed by realm), **refresh the access token on demand**, and **persist the rotated refresh token each time** (same pattern as the ampOS refresh-token flow in `ampos_auth.py`, and as Jeremy's `qbo.js` does). If the refresh token ever expires/revokes, an admin re-authorizes.
5. **Then call** the Accounting API (`/v3/company/123145887114114/query` and the `…/reports/ProfitAndLossDetail` endpoint) with `Authorization: Bearer <access token>` — the exact queries are in §12.

So: **one token to wire up (QuickBooks), stored and refreshed in the ampOS backend.** The quote/bid side needs none.

**QBO COGS / job-cost accounts** (from the AMPQES chart of accounts):

| Account | Category |
|---|---|
| 5006 Direct Cost – Wages, 5030 Direct Cost – Payroll, 6003 Taxes, 6010 Retirement Co Match | **Labor (W-2 + burden)** |
| 5008 Direct Cost – Contract Labor | Contract Labor |
| 5004 Direct Cost – Travel & Lodging | Travel & Lodging |
| 5002 Direct Cost – Fuel | Fuel / Mileage |
| 6390 Per Diem, 6270 Meals & Entertainment 50%, 5003 Meals | Per Diem / Meals |
| 5001 Direct Cost – Job Materials | Materials |
| 5007 Direct Cost – Rental Equipment | Rental Equipment |
| 5009 Third Party Testing, 5005 Postage, 5050 Insurance | Other |

---

## 4. The join (ampOS job ↔ QBO actuals) — and the one fix that makes it bulletproof

**Today:** match `jobs.job_number` to the **leading number** of the QBO sub-customer `DisplayName`:
`regexp '^\s*(\d{5})'` → that 5-digit job number → `Customer.Id`. This matched **132 of 145** jobs; the other 13 had naming differences (no number, typos, or not yet created in QBO).

**Recommended permanent fix (high value, low effort):**
> **Populate `neta_ops.jobs.quickbooks_project_id` (and `_name`) with the QBO sub-customer / Project Id when a job is created or converted from an opportunity.** The columns already exist and are empty. Once populated, the join is an exact foreign key instead of fragile name-matching, and the 13 unmatched jobs disappear. This is the single most valuable integration step.

QBO also exposes a native **Projects** feature (`ProjectRef` on TimeActivity, e.g. `587957375`); either the sub-customer Id or the Project Id can be stored — be consistent.

---

## 5. Methodology (confirmed with Jeremy)

- **Primary KPI: per-job GROSS MARGIN = (Revenue − fully-burdened direct cost) ÷ Revenue. Target = 40% (a floor).** Flag any job whose *projected* gross margin is below 40%.
- **Secondary: net margin after overhead**, allocating company overhead at **% of revenue** (see §6.4).
- **Progress / "ahead or behind" is projected to completion** using **billing % complete** so in-progress jobs aren't flattered (see §6.3).

**Company context (AMPQES YTD Jan–Jun 2026, from QBO P&L):** Revenue $3,398,268 · COGS $1,362,049 → **gross 59.9%** · OpEx $1,679,004 → **net operating 10.5%**. So 40% is a per-job *gross* floor; the company runs well above it at gross but overhead is the drag on net. The tracker's job is to surface the individual jobs that erode the gross.

---

## 6. Calculations (the heart — implement exactly)

### 6.1 Budget (quote) side — per job
From the latest estimate's `data`:
```
realized_rate   = actual_labor_cost / actual_worked_hours   # job's own QBO cost/hr (see 6.2); fallback ~$45
budget_labor    = (workHours + nonSovHours) * realized_rate
budget_travel   = travelHours * realized_rate  +  Σ travel_data.travelExpense[].vehicleTravelCost
budget_perdiem  = Σ travel_data.perDiem[].numDays * firstDayRate
budget_material = Σ sovItems[].quantity * materialPrice
budget_COGS     = budget_labor + budget_travel + budget_perdiem + budget_material
budget_revenue  = opportunities.quoted_amount
budget_GM%      = (budget_revenue − budget_COGS) / budget_revenue
```
> Valuing budget labor at the job's *realized* cost rate makes budget-vs-actual labor a clean **hours** comparison. (Alternatively use a fixed company loaded rate; just be explicit.)

### 6.2 Actual side — per job
```
# Revenue
billed     = Σ Invoice.TotalAmt        (CustomerRef = job)
collected  = Σ (Invoice.TotalAmt − Invoice.Balance)

# Labor (to-the-day) from TimeActivity
worked_hours    = Σ Hours  where CostRate > 0        # exclude $0-rate per-diem markers (see §8)
labor_TimeAct   = Σ Hours * CostRate
labor_PNL       = Σ ProfitAndLossDetail amount in accounts {5006,5030,6003,6010}
actual_labor    = max(labor_PNL, labor_TimeAct)      # see double-count rule below

# Non-labor actual cost by category, from ProfitAndLossDetail (EXCLUDING the labor accounts above)
actual_other    = Σ P&L expense rows grouped by category map in §3.4
actual_COGS     = actual_labor + actual_other
```
**Double-count rule (critical):** some jobs have wages job-costed in the P&L (account 5006 present) and some do not (wages not tagged to the sub-customer). To get a consistent, complete labor figure without double counting:
- Take **labor = `max(P&L labor accounts, TimeActivity Hours×CostRate)`**.
- Build **non-labor cost from the P&L *excluding* accounts 5006/5030/6003/6010** (so labor is never counted twice).
- Always use **TimeActivity for hours** (and for the daily/monthly curve).

### 6.3 Projected margin at completion (EAC) — "ahead or behind"
```
pct_complete = 1.0                              if status ∈ {billed, ready_to_bill, completed, progress_billing}
             = min(billed / quoted_amount, 1)   elif billed > 0
             = null                             else  (in-progress, nothing billed → cannot project)

proj_total_cost = actual_COGS / pct_complete
proj_GM%        = (quoted_amount − proj_total_cost) / quoted_amount     # <-- compare THIS to 40%

# pace check (is cost outrunning the margin budget right now?)
cost_budget_for_40 = quoted_amount * (1 − 0.40)
expected_cost_now  = cost_budget_for_40 * pct_complete
cost_pace_variance = actual_COGS − expected_cost_now     # +ve = over budget pace (margin eroding)
```
**Do not** compare cost-to-date against the *full* quote — that flatters early-stage jobs (a known trap; this is why EAC exists). Caveat: billing-% EAC assumes cost and billing move together; if a job is front-loaded on billing it under-states final cost — cross-check with report-completion % (§10).

### 6.4 Net margin after overhead (secondary)
```
overhead_rate = company_OpEx / company_revenue        # ≈ 0.494 YTD
net_margin%   = proj_GM% − overhead_rate
```

---

## 7. Dashboard UI spec

One job at a time. **Searchable job picker** (click → list all jobs with status; type → filter). Active jobs (in_progress / ready_to_bill / progress_billing) sorted first.

- **Summary (top):** Status · Quoted · Billed · Collected · % complete · Budget COGS · Actual COGS · Projected final cost · **Budget GM%** · **Projected GM% (flagged green ≥40% / red <40%)** · Hours budget→actual · Net margin after overhead.
- **Quote (left) and Actuals (right):** same category rows — **Revenue**, then COGS by category (Labor, Contract Labor, Travel & Lodging, Fuel/Mileage, Per Diem/Meals, Materials, Rental Equipment, Other), then **Total COGS** and **Gross margin %**.
- **Monthly view (bottom):** cost (incurred) vs billed, by month — reveals front-loaded billing and burn pace.
- **Drill-down: every number is clickable** to the underlying records:
  - Quote numbers → estimate SOV line items / `travel_data`.
  - Actual labor → **TimeActivity rows** (date, employee, hours, cost rate, cost).
  - Actual cost categories → the **ProfitAndLossDetail transactions** in that category.
  - Actual revenue → **invoices**.
  - Monthly bar → that month's transactions + time.

The reference HTML (`AMP Job Dashboard.html`) implements all of this; open it to see the exact behavior and styling.

---

## 8. Reference implementation (included in this package)

A runnable Python pipeline that produces the dashboard. Use it to validate your native build against known-good numbers.

| File | What it does |
|---|---|
| `ampos_auth.py` | Unattended ampOS auth via Supabase **refresh token** (stored outside OneDrive, auto-rotated). |
| `pull_ampos.py` | Pulls the 5 ampOS tables → `data/*.json`. |
| `pull_all_qbo.py` | Maps every job to its QBO sub-customer; pulls TimeActivity / Invoice / P&L-detail per job (`node qbo.js`). |
| `qbo_load.py` | Parsers + roll-ups for the QBO JSON (TimeActivity, P&L detail, invoices). |
| `build_dashboard.py` | Builds `AMP Job Dashboard.html` (all calcs in §6, the UI in §7). **This is the executable spec.** |
| `build_all.py` | Orchestrates a full daily refresh (ampOS → map → QBO → HTML). |
| `build_model.py`, `build_tracker_prototype.py` | Excel versions (overview model + per-job tracker prototype). |

QBO access uses the shared CLI at `…\FocusCFO\AI\QBO\qbo.js` (`--client ampqes`), Accounting scope, read-only. ampOS access uses the anon key (public, baked in the app) + a user access token minted from the refresh token.

### Quickstart (reproduce the reference)
```
# QBO tokens already configured for ampqes in ~/.qbo-tokens/.env
python ampos_auth.py seed <refresh_token_from_browser_localStorage>   # one-time
python pull_ampos.py        # ampOS bid data
python pull_all_qbo.py      # QBO actuals (a few minutes)
python build_dashboard.py   # -> AMP Job Dashboard.html
# or just: python build_all.py
```

---

## 9. Automation / refresh (reference implementation)

- **Cadence: once daily** is correct (QBO posts over hours/days).
- `build_all.py` refreshes ampOS, remaps new jobs, re-pulls **active** jobs' actuals (completed jobs stay cached), and regenerates the HTML.
- Scheduled via Windows Task Scheduler ("AMP Job Dashboard", 6:00 AM) → `refresh_dashboard.bat` → `refresh.log`.
- Tokens auto-refresh (QBO via `qbo.js`; ampOS via `ampos_auth.py`), so it runs unattended.

In a native ampOS build you'd replace the daily file pull with a **QBO sync job** writing actuals into your own tables (see §11).

---

## 10. Data-quality findings & caveats (read before trusting numbers)

1. **`estimates.data.calculatedValues` is wrong for dollars** — use `quoted_amount` + line items (§3.2). Worth fixing the estimator so the stored totals are correct.
2. **Per-diem time entries inflate hours.** Many `TimeActivity` rows are per-diem/day markers; some carry `$0 CostRate`. Count **worked hours as `CostRate > 0`** (labor *cost* is already correct since $0-rate rows add nothing). Even so, techs annotate real paid hours "Per diem", so don't filter on the description.
3. **Revenue isn't always tagged to the job sub-customer.** Some jobs show cost but $0 invoices (billed via parent, or not yet invoiced). Always compare against the **quote**, not just billed.
4. **Billing is often front-loaded** (invoice ahead of cost) — the monthly view shows this; it makes billing-% EAC optimistic. Consider an ampOS-native **report-completion %** (jobs already track report counts, e.g. 173 of 279 sent) as an independent progress signal and cross-check.
5. **`amp_division` values are inconsistent** (`Alabama` vs `north_alabama`, etc.) — normalize.
6. **13 of 145 jobs didn't match QBO** by name — fixed permanently by populating `quickbooks_project_id` (§4).
7. **40% is a *gross* (direct-cost) floor**, not net. Jobs commonly run 60–90% gross; the value is catching the low ones and watching the company roll-up vs overhead.

---

## 11. Recommended native-ampOS integration plan (for Jack)

1. **Bind jobs to QBO** — populate `jobs.quickbooks_project_id`/`_name` on job creation/conversion (§4). Backfill existing jobs once (the name-match map in the reference covers 132/145; finish the rest by hand).
2. **Add a QBO sync** (ampOS already has Supabase + a backend) — set up the server-side QuickBooks OAuth connection per **§3.5** (the one token to wire up), then on a daily job pull per active job fetch: `TimeActivity`, `Invoice`, and `ProfitAndLossDetail (customer=…)`. Store into new tables, e.g. `neta_ops.qbo_time`, `qbo_invoice`, `qbo_job_cost` (account, category, amount, date). Keep completed jobs cached.
3. **Implement the calc** (§6) as a view/service: `job_profitability(job_id)` returning budget-by-category, actual-by-category, EAC, margins.
4. **Build the UI** (§7) as a **"Profitability" tab on the existing Job page** — quote vs actual table, summary, monthly chart, and drill-downs (you already have the estimate data; the QBO rows come from step 2).
5. **Surface the 40% flag** on job lists / the sales dashboard so leakers are visible at a glance.
6. (Optional) Fix the estimator `calculatedValues` bug (§10.1) so the quote's stored cost/margin are correct natively.

**Minimum viable version:** steps 1–4 for active jobs only. Everything needed is in this document and the reference code.

---

## 12. Appendix — exact queries

**ampOS (PostgREST, header `Accept-Profile: <schema>`):**
```
business: GET /rest/v1/opportunities?select=*&limit=10000
business: GET /rest/v1/estimates?select=id,opportunity_id,quote_number,status,created_at,data,travel_data
neta_ops: GET /rest/v1/jobs?select=*&deleted_at=is.null
common:   GET /rest/v1/customers?select=id,name,company_name
```
**QBO (Accounting API / `qbo.js`):**
```
query:  SELECT Id, DisplayName FROM Customer WHERE Job=true
query:  SELECT * FROM TimeActivity WHERE CustomerRef='<id>'
query:  SELECT * FROM Invoice      WHERE CustomerRef='<id>'
report: ProfitAndLossDetail customer=<id> accounting_method=Accrual start_date=YYYY-01-01 end_date=YYYY-12-31
report: ProfitAndLoss start_date=… end_date=… accounting_method=Accrual   (company roll-up / overhead rate)
```
QBO query quirks: `TimeActivity` has no `ORDER BY`; no `OR` / multi-`LIKE`; `Purchase` is **not** filterable by `CustomerRef` (use the P&L detail report for cost).

---

*Reference implementation, this guide, the Excel models, and a sample of the live dashboard are included in the **Handoff to Jack** package. Questions → Jeremy.*
