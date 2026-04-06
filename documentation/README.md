# Documentation

All project documentation organized by category.

**Last Updated**: January 2025

---

## 📌 Quick Links - Latest Updates

| Document | Description |
|----------|-------------|
| [HELP_CENTER_PDF_UPLOAD.md](./Feature%20Documentation/HELP_CENTER_PDF_UPLOAD.md) | **NEW** - Help Center PDF upload feature documentation |
| [HELP_CENTER_UPDATES_JAN_2025.md](./Migration%20&%20Fixes/HELP_CENTER_UPDATES_JAN_2025.md) | **NEW** - Help Center updates and fixes summary |
| [RESOLVED_FEATURES_FIXES.md](./RESOLVED_FEATURES_FIXES.md) | Complete list of 50+ resolved features and fixes |
| [jan3log.md](./devlogs/jan3log.md) | Latest devlog (Week of Jan 3, 2025) |
| [CHANGELOG.md](../CHANGELOG.md) | Project changelog with all notable changes |

---

## 📁 Folder Structure

### `/Setup Guides/`
Configuration and setup instructions for automated systems.

| Document | Description |
|----------|-------------|
| `AUTOMATED_EMAILS_REFERENCE.md` | Complete reference for all automated email notifications |
| `DAILY_EMAIL_SETUP.md` | Daily review notification setup |
| `DAILY_READY_TO_BILL_SETUP.md` | Ready-to-bill daily report setup |
| `READY_TO_BILL_EMAIL_SETUP.md` | Instant billing notification setup |
| `WEEKLY_REPORTS_SETUP.md` | Weekly PO and jobs status reports |
| `WEEKLY_REPORTS_QUICK_START.md` | Quick start guide for weekly reports |
| `job-notifications.md` | Job notification system |
| `QUICKBOOKS_SETUP.md` | QuickBooks API integration setup |
| `SECURITY_GUIDE.md` | Environment variable security best practices |
| `NETLIFY_SECRETS_EXPLAINED.md` | Netlify environment variable security |

### `/Feature Documentation/`
Documentation for major application features.

| Document | Description |
|----------|-------------|
| `Deliverables-System.md` | Complete deliverables workflow documentation |
| `sla-tracking.md` | SLA management and violation tracking |
| `KEYBOARD_NAVIGATION.md` | Global keyboard navigation system |
| `AGENTS.md` | AI agent configuration and code style guidelines |
| `RUNWAY_MEETING_GUIDE.md` | EOS Level 10 meeting system |
| `BACK_TO_JOB_BUTTON.md` | Navigation enhancement |
| `README-task-master.md` | Task master documentation |
| `HELP_CENTER_PDF_UPLOAD.md` | **NEW** - Help Center PDF upload feature documentation |
| `SIGNATURE_PROFILES.md` | Signature profiles system for executive summaries |
| `EQUIPMENT_TABLES.md` | Equipment tables and categories system |
| `REPORT_EQUIPMENT.md` | Report equipment table integration |
| `SCOPE_QUANTITY_CHANGES.md` | Scope quantity functionality for proposals |
| `LETTER_PROPOSAL_CHANGES.md` | Letter proposal system and recent changes |
| `EXECUTIVE_SUMMARY.md` | Executive summary pages documentation |
| `RECENT_FEATURES_SUMMARY.md` | Quick reference guide to all recent features |

### `/Technical Reference/`
Technical implementation details and guides.

| Document | Description |
|----------|-------------|
| `CROSS_SCHEMA_QUERIES.md` | Working with multiple database schemas |
| `default-job-files.md` | Default file configurations |
| `REPORT_STANDARDIZATION_PLAN.md` | Report standardization initiative |
| `storage-buckets-setup.md` | Supabase storage configuration |
| `supabase-document-storage.md` | Document storage patterns |
| `update_frontend_guide.md` | Frontend update procedures |

### `/Database & Schema/`
Database structure and relationship documentation.

| Document | Description |
|----------|-------------|
| `schema_relationships.md` | Table relationships and foreign keys |
| `schema.dbml` | Database schema in DBML format |
| `README.md` | Database documentation index |

### `/Custom Reports/`
Custom form builder system documentation.

| Document | Description |
|----------|-------------|
| `CUSTOM_FORMS_README.md` | Main custom forms documentation |
| `CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md` | Implementation guide |
| `CUSTOM_FORMS_CONTEXT.md` | Context and background |
| `CUSTOM_FORMS_SUMMARY.md` | Feature summary |
| `CUSTOM_FORMS_FILES_CREATED.md` | Files created for custom forms |
| `QUICK_START.md` | Quick start guide |
| `TODO.md` | Remaining implementation tasks |

### `/Migration & Fixes/`
Database migrations and fix instructions.

| Document | Description |
|----------|-------------|
| `SCHEMA_MIGRATION.md` | Schema migration procedures |
| `REPORT_SAVING_FIX_INSTRUCTIONS.md` | Report saving fixes |
| `SENT_STATUS_MIGRATION_INSTRUCTIONS.md` | Status migration guide |
| `README.md` | Migration documentation index |

### `/Troubleshooting/`
Problem resolution guides.

| Document | Description |
|----------|-------------|
| `manual_fix_instructions.md` | Manual fix procedures |
| `README.md` | Troubleshooting index |

### `/Windows Compatibility/`
Windows-specific documentation.

| Document | Description |
|----------|-------------|
| `WINDOWS_MATCHING_STRATEGY.md` | Windows compatibility approach |
| `WINDOWS_PRINT_FIX.md` | Print fixes for Windows |
| `WINDOWS_TEST_CHECKLIST.md` | Windows testing checklist |
| `README.md` | Windows documentation index |

### `/devlogs/`
Development logs and notes (weekly updates).

| Document | Description |
|----------|-------------|
| `jan3log.md` | **NEW** Week of January 3, 2025 - 50+ resolved features & fixes |
| `nov15log.md` | November 15, 2024 - Autosave implementation |
| `nov7log.md` | November 7, 2024 - Initial development notes |

---

## 🔍 Quick Reference

### By Need

| Need | Location |
|------|----------|
| Set up automated emails | `/Setup Guides/AUTOMATED_EMAILS_REFERENCE.md` |
| Configure weekly reports | `/Setup Guides/WEEKLY_REPORTS_SETUP.md` |
| Set up QuickBooks integration | `/Setup Guides/QUICKBOOKS_SETUP.md` |
| Understand environment variable security | `/Setup Guides/SECURITY_GUIDE.md` |
| Understand deliverables | `/Feature Documentation/Deliverables-System.md` |
| Configure SLA tracking | `/Feature Documentation/sla-tracking.md` |
| Keyboard navigation help | `/Feature Documentation/KEYBOARD_NAVIGATION.md` |
| Database schema info | `/Database & Schema/schema_relationships.md` |
| Build custom forms | `/Custom Reports/CUSTOM_FORMS_README.md` |
| Run database migrations | `/Migration & Fixes/SCHEMA_MIGRATION.md` |
| Fix Windows issues | `/Windows Compatibility/` |
| Troubleshoot problems | `/Troubleshooting/` |
| Setup meetings system | `/Feature Documentation/RUNWAY_MEETING_GUIDE.md` |

### By Role

| Role | Start Here |
|------|------------|
| **Developer** | `/Feature Documentation/AGENTS.md` (code style) |
| **Admin** | `/Setup Guides/AUTOMATED_EMAILS_REFERENCE.md` |
| **DBA** | `/Database & Schema/` and `/Migration & Fixes/` |
| **QA** | `/Windows Compatibility/WINDOWS_TEST_CHECKLIST.md` |

---

## 📊 Feature Overview

### Core Features

#### Job Management
- Job lifecycle: pending → in-progress → completed → ready-to-bill → billed
- Customer association
- Division-based organization
- Resource allocation
- Cost tracking & profitability

#### Reports System (60+ Report Types)
- ATS (Acceptance Test Specifications) reports
- MTS (Maintenance Test Specifications) reports
- All NETA-compliant formats
- Professional print output
- Automatic job integration

#### Deliverables System
- Package multiple reports
- Auto-generate cover letters
- Executive summaries
- Combined PDF generation
- Review/approval workflow

#### SLA Tracking
- Define SLA templates
- Apply to jobs
- Monitor compliance
- Track violations
- Notifications

#### Automated Emails
- Daily review notifications
- Ready-to-bill alerts
- Weekly status reports
- Weekly PO reports

#### Runway Meetings
- EOS Level 10 format
- Scorecard tracking
- Rocks/goals management
- To-do integration
- Issue tracking

#### Custom Form Builder
- Drag-and-drop interface
- Pre-built components
- Reusable templates
- Print-ready output

---

## 📁 Root Documentation Files

| File | Description |
|------|-------------|
| `FOLDER_INDEX.md` | Detailed file listings |
| `FOLDER_ORGANIZATION.md` | Complete project structure |
| `autosave-implementation-guide.md` | Autosave feature guide |

---

## 📚 Related Documentation

| Location | Content |
|----------|---------|
| `/Database Scripts/README.md` | Database scripts organization |
| `/src/components/reports/README.md` | Report approval workflow |
| `/scripts/README.md` | Utility scripts documentation |
| `/Development Tools/README.md` | Development tool documentation |

---

## 🆕 Recent Updates (Late December 2024 - January 2025)

### 📊 Major Milestone: 50+ Resolved Items
See [RESOLVED_FEATURES_FIXES.md](./RESOLVED_FEATURES_FIXES.md) for complete details.

### New Features
- **Asset Urgency System** - Classify items as hot/due immediately
- **After Action Report Form** - Two-page form for technicians and review
- **Job Notes/Chat Tab** - Updates and notes for each job
- **Estimating Presets** - Reusable estimate templates
- **Opportunity Type Field** - New "Type of Work" classification
- **Customer Quick Navigation** - Google-style search
- **Alphabetical Customer Sorting** - A-Z and Z-A options
- **Duplicate Estimates** - One-click estimate duplication
- **Letter Proposal Toggles** - Section visibility controls
- **Approved Reports Dashboard** - Home page widget

### Critical Bug Fixes
- Cannot change opportunity type (URGENT)
- PDF report cal dates not displaying (URGENT)
- GFI Trip Test Report not in Review (URGENT)
- Low Voltage Breaker FAIL showing green (URGENT)
- Inspection results not saving (URGENT)
- Features & Fixes edit/save not working (HIGH)
- Weekly Jobs Status Report wrong status (NORMAL)

### Database Changes
- New tables: `job_notes`, `after_action_reports`, `estimating_presets`, `vendors`, `vendor_pos`
- Added `opportunity_type` to opportunities
- Added urgency fields to assets
- Fixed issue priority permissions

### Automated Emails
- Daily Ready-to-Bill Report (8 AM)
- Weekly Jobs Status Report (Monday) - Now correctly filtering "Billed" status
- Weekly PO Report (Monday)

---

See `FOLDER_INDEX.md` for detailed file listings and `FOLDER_ORGANIZATION.md` for the complete project structure.
