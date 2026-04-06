# Changelog

All notable changes to the ampOS project.

---

## [Late December 2024 - January 2025]

### 🆕 New Features

#### Asset Urgency System
- New urgency classification for projects and assets
- Database migration: `add-asset-urgency.sql`
- Visual indicators for hot/urgent items
- Integration with notification system

#### After Action Report Form
- Two-page form system for technicians and review
- Database table: `neta_ops.after_action_reports`
- Database migration: `create_after_action_reports_tables.sql`

#### Job Notes / Chat / Updates Tab
- New `job_notes` table for job communication
- Real-time updates and threaded discussions
- Database migration: `create_job_notes_table.sql`

#### Estimating Presets System
- Reusable estimate templates and presets
- New presets management page
- Database migration: `create_estimating_presets_table.sql`

#### Opportunity Type Field
- New "Type of Work" field for opportunities
- Database migration: `add_opportunity_type.sql`

#### Approved Reports Dashboard Widget
- Home page shortcut for approved reports
- Quick access navigation with status filtering

#### Enhanced Features & Fixes System
- Sort by priority
- Filter by type (Issue vs Feature)
- "Created by" field tracking
- Edit functionality after submission
- Priority change capability with permissions

#### Customer Navigation Improvements
- Quick Google-style search for customers/contacts
- Direct navigation links
- Alphabetical sorting (A-Z and Z-A)

#### Estimate Enhancements
- Duplicate estimates feature
- Estimate status indicator
- Drag-and-drop estimate reordering

#### Letter Proposal Improvements
- Duplicate letter proposal capability
- Section visibility toggles
- Rename cover letter button

### 🐛 Critical Bug Fixes

| Issue | Priority | Fix |
|-------|----------|-----|
| Cannot change opportunity type or save opportunity | Urgent | Fixed state management conflict |
| PDF report not displaying cal dates (7.1.2 Panelboard) | Urgent | Fixed cal date rendering |
| GFI Trip Test Report Not in Report Review | Urgent | Added to review workflow |
| Low Voltage Breaker "FAIL" showing green | Urgent | Fixed color logic |
| Not Saving the Inspection Results | Urgent | Fixed state persistence |
| Issue Creating a Job (wrong folder) | Urgent | Fixed folder assignment logic |
| Edit/save button on Features & Fixes doesn't work | High | Fixed save functionality |
| Not able to change issue/feature priority | Normal | Fixed permissions |
| ATS Panelboard Sheet - incorrect test equipment | High | Removed Hi-Pot from sheet 7.1.2 |
| Weekly Jobs Status Report showing wrong status | Normal | Fixed "Billed" vs "Active" filtering |

### 📊 Database Changes

#### New Tables
```sql
neta_ops.job_notes
neta_ops.after_action_reports
neta_ops.estimating_presets
neta_ops.liquid_filled_xfmr_ats25_reports
neta_ops.small_lv_dry_type_transformer_ats25_reports
neta_ops.vendors
neta_ops.vendor_pos
neta_ops.subcontractor_agreements
```

#### Schema Updates
- `opportunity_type` field added to opportunities
- Urgency fields added to assets/projects
- `created_by` field added to features_fixes
- Issue priority permissions fixed

---

## [December 2024]

### 🆕 New Features

#### GFI Trip Test Report
- New specialized report for Ground Fault Trip Testing
- Database table: `neta_ops.gfi_trip_test_reports`
- Component: `src/components/reports/GFITripTestReport.tsx`
- Includes: Job info, test equipment, manufacturer data, results, PASS/FAIL status
- Full print support with professional formatting

#### Deliverables System Enhancements
- **DeliverableViewer** (`src/components/jobs/DeliverableViewer.tsx`)
  - Combined PDF generation with cover letter, executive summary, and all reports
  - Image-to-base64 conversion for reliable printing
  - Print mode detection for proper table rendering
  - Progress indicators during PDF generation
- **Document Locking** - Cover letters lock when deliverables are approved/sent
- **Report Selection** - Track which reports are included in each deliverable

#### Automated Email System
| Email | Schedule | Purpose |
|-------|----------|---------|
| Daily Ready-to-Bill Report | 8 AM CST | Summary of jobs ready for billing |
| Weekly Jobs Status Report | Monday 8 AM | Jobs grouped by status |
| Weekly PO Report | Monday 8 AM | Purchase orders summary |

#### Current Transformer Reports
- **12-CurrentTransformerTestATSReport.tsx** - CT ATS testing
- **12-CurrentTransformerTestMTSReport.tsx** - CT MTS testing
- Enhanced ratio/polarity tables with print optimization
- Column width adjustments for better print output

#### Voltage/Potential Transformer Reports
- **13-VoltagePotentialTransformerTestMTSReport.tsx** - PT MTS testing
- Database table: `voltage_potential_transformer_mts_reports`

#### Medium Voltage Reports
- **23-MediumVoltageMotorStarterMTSReport.tsx** - Motor starter MTS
- **23-MediumVoltageSwitchMTSReport.tsx** - MV switch MTS

### 📊 Database Changes

#### New Tables
```sql
neta_ops.gfi_trip_test_reports
neta_ops.current_transformer_test_ats_reports
neta_ops.current_transformer_test_mts_reports
neta_ops.voltage_potential_transformer_mts_reports
neta_ops.medium_voltage_vlf_mts_reports
```

#### Schema Updates
- **generated_documents**: Added `status`, `locked_at`, `locked_by` columns for document locking
- **generated_documents**: Added `selected_report_ids` array for tracking included reports
- **deliverables**: New table for deliverable packages with workflow status

#### RLS Policy Updates
- Fixed issue priority permissions (`fix_issue_priority_permissions.sql`)
- Updated generated_documents policies for update/delete operations
- All report tables have open RLS for authenticated users

### 🛠️ Improvements

#### Print Output
- Enhanced print CSS for all report types
- Proper table border rendering in print
- PASS/FAIL badge color preservation in print
- Hide interactive elements (dropdowns, buttons) in print
- Column width optimization for multi-column tables

#### Report System
- Standardized report wrapper component
- Consistent job info and test equipment sections
- Temperature correction factor (TCF) calculations
- Improved dark mode support across all reports

#### Deliverables Workflow
- Streamlined cover letter selection
- Executive summary support
- Report ordering maintained in PDF output
- Status tracking: draft → in_review → approved → delivered

### 📧 Edge Functions

New Supabase Edge Functions:
- `supabase/functions/daily-ready-to-bill-report/index.ts`
- `supabase/functions/weekly-jobs-status-report/index.ts`
- `supabase/functions/weekly-po-report/index.ts`

GitHub Actions workflows:
- `.github/workflows/daily-ready-to-bill-report.yml`
- `.github/workflows/weekly-reports.yml`

### 📝 Documentation Updates
- Comprehensive README.md update
- Reports system documentation (`src/components/reports/README.md`)
- Database scripts documentation (`Database Scripts/README.md`)
- Feature documentation updates
- Automated emails reference guide

---

## [November 2024]

### Features
- Runway Meeting System (EOS Level 10)
- Custom Form Builder framework
- SLA Tracking System
- Keyboard Navigation System
- Issue tracking with priorities

### Reports Added
- Large Dry Type Transformer MTS
- Low Voltage Switch Maintenance MTS
- Medium Voltage Circuit Breaker MTS
- Panelboard Assemblies ATS 25
- Switchgear Assemblies ATS 25

### Database
- SLA tables (definitions, tracking, violations)
- Custom forms tables (templates, instances)
- Meeting system tables

---

## [October 2024]

### Features
- Deliverables System (replaced Surveys)
- Generated Documents (cover letters, summaries)
- Report Approval Workflow
- Division-based dashboards

### Reports Added
- Automatic Transfer Switch ATS
- Grounding System Master
- Oil Inspection Report
- Various MTS reports

---

## [Earlier 2024]

### Core System
- Job Management System
- Customer Management
- Asset Management
- Equipment Tracking
- User Authentication
- Role-based Permissions
- Dark Mode Support

### Report Foundation
- 40+ ATS/MTS report types
- Print styling system
- Report mappings
- Report import system

---

## Migration Notes

### From November to December 2024

1. **Run Database Migrations**
   ```sql
   -- Run in order:
   /Database Scripts/Setup & Configuration/add_status_to_generated_documents.sql
   /Database Scripts/Setup & Configuration/add_report_selection_to_cover_letters.sql
   /Database Scripts/Report Tables/gfi_trip_test_reports.sql
   ```

2. **Deploy Edge Functions**
   - Deploy `daily-ready-to-bill-report`
   - Deploy `weekly-jobs-status-report`
   - Deploy `weekly-po-report`

3. **Set Environment Variables**
   - `POSTMARK_API_KEY` - for email sending
   - `WEEKLY_REPORT_EMAIL` - recipient for weekly reports

4. **Enable GitHub Actions**
   - Enable `daily-ready-to-bill-report.yml`
   - Enable `weekly-reports.yml`

---

## Known Issues

### Print
- Some browsers may not preserve colored backgrounds; use `-webkit-print-color-adjust: exact`
- Large reports may need print scaling adjustment

### Deliverables
- Combined PDF generation requires popup permissions
- Large deliverables with many reports may take 30+ seconds to generate

### Reports
- Some older reports may not have full MTS variants
- Print column widths may need adjustment for specific content

---

## Upcoming

### Planned Features
- Custom Form Filler completion
- Enhanced report templates
- Bulk report operations
- Mobile-optimized views
- Advanced analytics dashboard

### Database
- Performance indexes for large datasets
- Archive system for old data
- Audit logging expansion

