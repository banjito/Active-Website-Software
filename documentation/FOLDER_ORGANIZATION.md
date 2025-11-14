# Project Organization Guide

This document explains the complete folder structure and organization of the Active Website Software project.

---

## 📁 Root Directory

Essential configuration files and core application folders only.

### Core Application
- `src/` - Source code (React components, utilities, services)
- `public/` - Static assets (images, PDFs, service workers)
- `dist/` - Production build output
- `database/` - **Active** database migrations used by the app
- `supabase/` - Supabase edge functions
- `scripts/` - Build and utility scripts
- `node_modules/` - Dependencies

### Configuration Files
- `package.json` - Dependencies and scripts
- `vite.config.*`, `tsconfig.*` - Build and TypeScript configuration
- `tailwind.config.cjs` - Tailwind CSS configuration
- `eslint.config.js` - Linting rules
- `netlify.toml` - Deployment configuration
- `components.json` - Component library config

---

## 📚 Documentation

**Location:** `/Documentation/`

All project documentation consolidated and organized by category.

### `/Setup Guides/`
Email automation, reports, notifications, and billing configuration.

**Files:**
- AUTOMATED_EMAILS_REFERENCE.md
- DAILY_EMAIL_SETUP.md
- DAILY_READY_TO_BILL_SETUP.md
- READY_TO_BILL_EMAIL_SETUP.md
- WEEKLY_REPORTS_SETUP.md
- WEEKLY_REPORTS_QUICK_START.md
- job-notifications.md

### `/Feature Documentation/`
Feature-specific guides and configuration.

**Files:**
- AGENTS.md - AI agent configuration
- BACK_TO_JOB_BUTTON.md - Navigation feature
- KEYBOARD_NAVIGATION.md - Keyboard shortcuts
- README-task-master.md - Task Master system
- RUNWAY_MEETING_GUIDE.md - Meeting management
- sla-tracking.md - SLA tracking

### `/Technical Reference/`
Technical implementation details for developers.

**Files:**
- CROSS_SCHEMA_QUERIES.md - Database query patterns
- default-job-files.md - Job file structure
- REPORT_STANDARDIZATION_PLAN.md - Report guidelines
- storage-buckets-setup.md - Storage configuration
- supabase-document-storage.md - Document storage
- update_frontend_guide.md - Frontend updates

### `/Database & Schema/`
Database structure and relationships.

**Files:**
- schema_diagram.dbml - Visual schema
- schema_relationships.md - Table relationships

### `/Custom Reports/`
Custom Form Builder documentation.

**Files:**
- CUSTOM_FORMS_CONTEXT.md - Complete implementation context
- CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md - Step-by-step guide
- CUSTOM_FORMS_README.md - Feature overview
- CUSTOM_FORMS_FILES_CREATED.md - File inventory
- CUSTOM_FORMS_SUMMARY.md - Feature summary
- QUICK_START.md - Development quick start
- TODO.md - Outstanding tasks

### `/Migration & Fixes/`
Migration guides and fix procedures.

**Files:**
- SCHEMA_MIGRATION.md - Schema migration process
- SENT_STATUS_MIGRATION_INSTRUCTIONS.md - Status migration
- REPORT_SAVING_FIX_INSTRUCTIONS.md - Report fixes

### `/Troubleshooting/`
Manual fix procedures and repair guides.

**Files:**
- manual_fix_instructions.md - Manual procedures

### `/Windows Compatibility/`
Windows-specific issues and fixes.

**Files:**
- WINDOWS_MATCHING_STRATEGY.md - Compatibility strategy
- WINDOWS_PRINT_FIX.md - Print fixes
- WINDOWS_TEST_CHECKLIST.md - Testing checklist

### Root Documentation Files
- `README.md` - Documentation index
- `FOLDER_INDEX.md` - Detailed file listings
- `FOLDER_ORGANIZATION.md` - This file

---

## 🗄️ Database Scripts

**Location:** `/Database Scripts/`

All SQL files organized by purpose.

### `/Fixes & Maintenance/`
Constraint fixes, schema repairs, and permission updates.

**Files:**
- FIX_ASSETS_CONSTRAINT.sql
- fix_chat_schemas_simple.sql
- fix_quoted_amount.sql
- fix_subcontractor_agreements_policies.sql
- fix-asset-reports-table.sql
- fix-foreign-key-constraints.sql
- disable_rls_subcontractor_agreements.sql
- step3_fix_permissions.sql

### `/Setup & Configuration/`
Table creation and workflow setup.

**Files:**
- asset-approval-workflow-setup.sql
- create_subcontractor_agreements.sql
- manual-setup-technical-reports-fixed.sql
- manual-setup-technical-reports.sql
- check_and_create_table.sql
- step1_check_table.sql
- step2_create_table.sql

### `/Report Tables/`
SQL for report-specific tables.

**Files:**
- automatic_transfer_switch_ats_reports.sql
- create_lv_cb_et_ats_table.sql
- current_transformer_test_ats_reports.sql
- current_transformer_test_mts_reports.sql
- low_voltage_panelboard_small_breaker_reports.sql
- medium_voltage_cable_vlf_test.sql
- medium_voltage_circuit_breaker_reports.sql
- medium_voltage_vlf_mts_reports.sql
- voltage_potential_transformer_mts_reports.sql

### `/Verification & Testing/`
Debugging and validation scripts.

**Files:**
- debug_job_status.sql
- verification_query.sql
- schema_access_verification.sql
- schema_access_verification_fixed.sql

### `/Historical Migrations/`
Archived migration scripts (68 files) for reference only.

**⚠️ Important:** These are historical. Active migrations are in `/database/migrations/`.

---

## 🛠️ Development Tools

**Location:** `/Development Tools/`

Testing utilities and import data.

### `/Test Scripts/`
Development and testing utilities.

**Files:**
- add-test-customer-fixed.mjs
- add-test-customer.js
- check-supabase.js
- check-supabase.mjs
- test-quick.js
- test-quick.mjs
- update_task.js
- wrap-portals.js

### `/Import Data/`

#### `/imports/` - CSV Data
- opportunities_export.csv
- quoted_amount_unmatched.csv
- quoted_amount_update_report.csv

#### `/json imports/` - JSON & Reports
- 40+ JSON data files
- 4 AMP report templates
- 4 Excel spreadsheets

---

## 🗃️ Archive

**Location:** `/.archive/`

Temporary, debug, and outdated files kept for reference.

**Contents:**
- `/temp/` - Temporary files
- temp_mts_report.tsx - Old component
- ts_errors.txt - Debug output
- ActualSchemaLayout.txt - Schema draft
- database-connections-prd.txt - Connection notes
- force_push_fireteam_changes.sh - Old script

**⚠️ Do not use** - Files may be outdated or replaced.

---

## 📋 Quick Reference

| Need | Location |
|------|----------|
| Documentation | `/Documentation/` + subfolder |
| SQL scripts | `/Database Scripts/` + subfolder |
| Test utilities | `/Development Tools/Test Scripts/` |
| Import data | `/Development Tools/Import Data/` |
| Old files | `/.archive/` |
| Source code | `/src/` |
| Active migrations | `/database/migrations/` |
| Build scripts | `/scripts/` |

---

## 🔄 Maintenance Guidelines

### Adding New Files

| File Type | Destination |
|-----------|-------------|
| Documentation | `/Documentation/` in appropriate subfolder |
| SQL script | `/Database Scripts/` in appropriate subfolder |
| Test utility | `/Development Tools/Test Scripts/` |
| Import data | `/Development Tools/Import Data/` |
| Temp/old files | `/.archive/` |
| Active migration | `/database/migrations/` (root) |

### Folder Rules

1. **READMEs inside folders** - Each organized folder has its own README
2. **No loose files at root** - Only essential config files at root level
3. **Categorize or Misc** - If it doesn't fit a category, use a Misc folder
4. **Specific folder names** - Avoid generic names like "docs" or "guides"
5. **Organized by purpose** - Group by what the files do, not file type

---

## ✅ Organization Benefits

- **Faster navigation** - Find files quickly by purpose
- **Better understanding** - Clear categorization shows intent
- **Easier onboarding** - New developers can find what they need
- **Cleaner git history** - Organized commits and changes
- **Professional structure** - Enterprise-grade organization

---

**Last Updated:** November 6, 2024  
**Organized by:** Project cleanup initiative
