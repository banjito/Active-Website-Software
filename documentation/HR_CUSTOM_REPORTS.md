# HR Custom Reports

## Overview

The **Custom Reports** page at **HR → Analytics → Custom Reports** provides five report categories with Excel and CSV export. Reports use shared filters (as-of date, department, location) where applicable.

## Report Categories

| Report | Key outputs | Data source | Output |
|--------|-------------|-------------|--------|
| **Headcount & Turnover** | Active headcount, by dept/location/role, terminations (voluntary vs involuntary), turnover rate | `common.profiles` | Monthly snapshot Excel/CSV |
| **New Hires & Terminations (Rolling 12)** | New hires by month, terminations by month, tenure at exit, new-hire turnover, promotions | `common.profiles` | Rolling 12-month Excel/CSV |
| **Open Requisitions & Time-to-Fill** | Open requisitions + aging, time-to-fill, offer acceptance rate, pipeline stages | `common.job_requisitions`, `common.candidates` | Excel/CSV |
| **Certification & Compliance** | Active certs, expirations 30/60/90 days, missing docs, completion % | `common.employee_certifications` | Excel/CSV |
| **PTO Balances & Liability** | PTO by employee, accrued vs used, liability (hours/dollars), high-risk | `hr.leave_allocations`, `hr.leave_types` | Month-end Excel/CSV |

## Customization

### Filters (in-app)

- **As-of date** – Month used for “snapshot as of month-end” (Headcount, PTO).
- **Department** – Restrict Headcount, New Hires/Terminations, and Open Requisitions by department.
- **Location** – Restrict Headcount by location.

### Database fields for reports

Run the migration **once** so reports have termination and labor-type data:

- **File:** `Database Scripts/Setup & Configuration/add_hr_analytics_fields.sql`
- **Adds on `common.profiles`:** `hire_date`, `termination_date`, `termination_type`, `termination_reason`, `employment_status`, `labor_type`, `location`
- **Adds on `common.job_requisitions`:** `hiring_manager_id`
- **Adds on `common.candidates`:** `offer_status`

After running it, maintain:

- **Headcount / New Hires & Terminations:** Set `hire_date`, `termination_date`, `termination_type`, `termination_reason`, `employment_status`, `labor_type`, `location` on profiles (e.g. from Employee Data or termination workflows).
- **Open Requisitions:** Set `hiring_manager_id` and use `offer_status` on candidates for acceptance rate.

### Extending reports

- **Add columns:** Edit the `headers` and row mapping in `src/pages/hr/analytics/HrCustomReports.tsx` for the corresponding `run*` function (e.g. `runHeadcountTurnover`).
- **New report type:** Add a new entry to `REPORT_DEFS`, add a `run*` handler that fetches data and calls `downloadExcel` / `buildCsv` + `downloadCsv` from `src/lib/hr/exportReports.ts`.
- **Scheduled exports:** Use the same run handlers from a backend job (e.g. Netlify/Supabase cron) that generates the file and emails or stores it; filters can be passed as parameters (e.g. previous month-end date).

## Output preferences

- **Excel** – Preferred for monthly/rolling reports and finance (Headcount, New Hires/Terminations, PTO, Requisitions, Certifications).
- **CSV** – Alternative for the same data; use when downstream tools expect CSV.

## Related files

- Page: `src/pages/hr/analytics/HrCustomReports.tsx`
- Export helpers: `src/lib/hr/exportReports.ts`
- Migration: `Database Scripts/Setup & Configuration/add_hr_analytics_fields.sql`
