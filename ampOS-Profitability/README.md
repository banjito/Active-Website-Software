# AMP Job Profitability Tracker — Handoff Package

Everything needed to integrate native job-profitability tracking into ampOS.

## Start here
1. **`AMP_Job_Profitability_Integration_Guide.docx`** (or `.md`) — the complete spec:
   data model, the ampOS↔QuickBooks join, every calculation and category mapping,
   the UI spec, and a step-by-step native-integration plan. **Read this first.**
2. **`AMP Job Dashboard.html`** — open in any browser. The working reference dashboard
   (130 jobs, quote vs actual by category, projected margin vs 40%, click-to-drill).
   This is what we're recreating natively in ampOS.

## What each thing is
| Item | Purpose |
|---|---|
| `AMP_Job_Profitability_Integration_Guide.(docx/md)` | The master technical spec & integration plan |
| `AMP Job Dashboard.html` | Working reference dashboard (self-contained, real data) |
| `AMP Job Profitability Model.xlsx` | Excel overview: all bids, pipeline/win-loss, quote line items |
| `AMP Job Tracker - Prototype.xlsx` | Excel per-job tracker (budget vs actual, EAC) |
| `reference-code/` | The runnable Python pipeline (the executable spec) |

## reference-code/
| File | Role |
|---|---|
| `build_dashboard.py` | Builds the dashboard — **all calculations & UI logic live here** |
| `build_all.py` | One-command daily refresh orchestrator |
| `pull_ampos.py` + `ampos_auth.py` | Pull ampOS bid data (unattended via Supabase refresh token) |
| `pull_all_qbo.py` + `qbo_load.py` | Pull & parse QuickBooks actuals per job |
| `build_model.py`, `build_tracker_prototype.py` | The Excel builders |
| `refresh_dashboard.bat` | Windows Task Scheduler entry point (daily 6 AM) |
| `.env.example` | Names of the config values (no secrets) |

## How the reference runs (to reproduce / validate numbers)
```
python ampos_auth.py seed <ampOS refresh token>   # one-time
python build_all.py                               # ampOS + QBO + rebuild HTML
```
- ampOS access: anon key (public) + access token minted from a stored refresh token.
- QBO access: shared CLI `…\FocusCFO\AI\QBO\qbo.js --client ampqes` (read-only Accounting).
- No secrets are included in this package. See `.env.example` for the value names.

## The one high-value ask for ampOS
Populate **`neta_ops.jobs.quickbooks_project_id`** (currently empty) when a job is
created/converted, so the QuickBooks join is an exact key instead of name-matching.
Details in §4 and §11 of the guide.
