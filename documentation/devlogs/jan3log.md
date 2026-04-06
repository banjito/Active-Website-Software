# Development Log - Week of January 3, 2025

## Overview
This week marks a significant milestone in ampOS development with **50+ features and issues resolved** since late October 2024. This devlog documents the comprehensive work completed, covering everything from new report types to UI improvements and critical bug fixes.

---

## 🎯 Summary Statistics

| Category | Count |
|----------|-------|
| Feature Requests Resolved | 15+ |
| Issues/Bugs Fixed | 35+ |
| New Database Tables | 8+ |
| New Report Types | 3+ |
| UI/UX Improvements | 20+ |

---

## 🆕 Major Features Implemented

### 1. Asset Urgency System (December 2024)
**Request**: "We need to be able to classify what items are hot / due immediately"
- Added urgency field to projects/assets
- Database migration: `add-asset-urgency.sql`
- Visual indicators for urgent items
- Integration with ampOS notification system

### 2. After Action Report Form (December 2024)
**Request**: Two-page form system - one for technicians, one for review
- New database table: `after_action_reports`
- Component: `AfterActionReportForm.tsx`
- Dual-form workflow implementation
- Database migration: `create_after_action_reports_tables.sql`

### 3. Job Notes / Chat / Updates Tab (December 2024)
**Request**: "We need somewhere to put updates and notes for jobs"
- New `job_notes` table created
- Real-time updates capability
- Threaded discussion support
- Database migration: `create_job_notes_table.sql`

### 4. Estimating Presets System (November 2024)
**Request**: "Add a page for estimating pre-sets and have the estimates pull from those"
- New presets management page
- Reusable estimate templates
- Database migration: `create_estimating_presets_table.sql`
- Integration with estimate creation workflow

### 5. Approved Reports Shortcut on Home Page (December 2024)
**Request**: "Summary view on the home page in the same format as Review Shortcuts"
- New dashboard widget for approved reports
- Quick access navigation
- Status filtering

### 6. Features & Fixes Enhancements (December 2024)
Multiple enhancements to the issue tracking system:
- ✅ Sort by priority
- ✅ Filter by type (Issue vs Feature)
- ✅ "Created by" field
- ✅ Edit functionality after submission
- ✅ Priority change capability

### 7. New "Type of Work" Field for Opportunities (December 2024)
**Request**: "Opportunity Type" field with four options
- HIGH priority implementation
- New field added to opportunities table
- Dropdown options configured
- Database migration: `add_opportunity_type.sql`

### 8. Manually Adjustable "Sent" Date for Reports (December 2024)
**Request**: Allow team leads and admins to change the sent date manually
- Permission-based date editing
- Audit trail for changes
- Role restrictions (Fire Team Leads, Project Managers, Admin)

### 9. Customer Navigation Improvements (December 2024)
**Request**: "Go to any page directly from a Google-style search"
- Quick customer/contact search
- Direct navigation links
- Alphabetical sorting for customers (ascending/descending)

### 10. Duplicate Estimates Feature (November 2024)
**Request**: "Button to duplicate an estimate within an opportunity"
- One-click estimate duplication
- Scope splitting support
- All line items copied

### 11. Estimate Status Indicator (November 2024)
**Request**: "Status visible when the estimate is open"
- Visual status indicator near top of estimate
- Real-time status updates

### 12. Letter Proposal Generation Toggles (November 2024)
**Request**: "Toggles or checkboxes to show or not show certain sections"
- Section visibility controls
- Customizable proposal output
- User preference saving

---

## 🐛 Critical Bug Fixes

### URGENT Priority Fixes

1. **Cannot change opportunity type or save opportunity** (12/30/2024)
   - Fixed: Large/Small acceptance dropdown issue
   - Root cause: State management conflict
   - Resolution: Refactored opportunity form handling

2. **PDF report not displaying cal dates** (12/19/2024)
   - Affected: 7.1.2 Panelboard Assemblies Test Sheet ATS 25
   - Fixed: Cal date rendering in PDF conversion
   - Verified: All date fields now display correctly

3. **GFI Trip Test Report Not in Report Review** (12/16/2024)
   - Added: Report to review workflow
   - Updated: Report routing configuration
   - Verified: Now visible in report review

4. **Low Voltage Breaker "FAIL" showing green** (11/17/2024)
   - Affected: Low Voltage Circuit Breaker Electronic Trip Unit
   - Fixed: FAIL evaluation now correctly shows RED
   - Updated: Color logic for all PASS/FAIL displays

5. **Not Saving the Inspection Results** (11/12/2024)
   - Affected: Visual and mechanical inspections
   - Fixed: State persistence issue
   - Verified: All inspection results now save correctly

6. **Issue Creating a Job** (11/6/2024)
   - Affected: Job creation from specific quotes
   - Fixed: Folder assignment logic
   - Verified: Jobs now create in correct location

### HIGH Priority Fixes

1. **ATS Panelboard Sheet - Hipot in test equipment** (12/16/2024)
   - Removed: Hi-Pot from test equipment used section in sheet 7.1.2
   - Verified: Correct equipment list now displays

2. **Edit/save button on feature & fixes doesn't work** (12/15/2024)
   - Fixed: Save functionality for feature requests
   - Added: Proper form validation
   - Updated: State management

3. **Not able to change issue/feature priority** (12/15/2024)
   - Fixed: Priority dropdown functionality
   - Added: Permission checks
   - Database: `fix_issue_priority_permissions.sql`

4. **Create Duplicate Letter proposal** (11/5/2024)
   - Added: Duplicate button in "Show Letter Proposals" popup
   - Maintains: All proposal settings and content

5. **Issue vs. feature requests differentiation** (11/25/2024)
   - Added: Type field to distinguish issues from features
   - Updated: Filter options
   - Improved: UI clarity

6. **T&M Opportunity creation permissions** (11/21/2024)
   - Added: Permission for specific users (Ethan Thoenes, etc.)
   - Updated: Role-based access control

7. **No Customer or contract creation in T&M Jobs** (11/21/2024)
   - Added: Customer/contact creation buttons
   - Matches: Standard opportunity workflow

8. **Fall of potential sheet** (11/14/2024)
   - Added: Input boxes for 80%, 60%, and 40% results
   - Fixed: Missing data entry fields

### NORMAL Priority Fixes

1. **Change to Weekly Jobs Status Report** (12/29/2024)
   - Fixed: "Billed" jobs showing as "Active"
   - Updated: Status filtering logic

2. **GFI Trip Test Report not printing results** (12/15/2024)
   - Fixed: Long text truncation in form view
   - Updated: Print preview rendering

3. **Prompt after saving letter** (11/24/2024)
   - Fixed: Unnecessary prompt to create another letter after saving

4. **Estimates not re-arrangable** (11/18/2024)
   - Added: Drag-and-drop reordering
   - Updated: "Show Estimates" view

5. **Quarterly / 6 Monthly Views - In-Progress Dashboard** (11/18/2024)
   - Fixed: Only showing 2-4 months at a time
   - Now shows: Full quarterly and 6-month views

6. **Generated Proposals have the wrong address** (11/17/2024)
   - Fixed: Address at end of proposal (END OF LETTER section)
   - Updated: Jobsite address mapping

7. **Opportunity sorting refresh** (11/17/2024)
   - Fixed: Table defaulting to letter number sort on open
   - Maintains: User's selected sort preference

8. **Opportunity table sorting doesn't query ALL opportunities** (11/17/2024)
   - Fixed: Old opportunities not included in sort
   - Updated: Query to include all records

9. **Deliverables Tab Addition** (11/17/2024)
   - Added: Dedicated deliverables tab/functionality
   - Enhanced: Job organization

10. **Status field for cover letters/summaries** (11/17/2024)
    - Added: Status tracking for saved cover letters
    - Enhanced: Workflow management

11. **Edit/save buttons for Cover Letter & Executive summary** (11/17/2024)
    - Added: Editing functionality post-save
    - Fixed: Read-only state issues

12. **Rename cover letter button** (11/17/2024)
    - Added: Rename functionality for existing Cover Letters / Executive summaries

13. **Estimates save issue** (11/17/2024)
    - Fixed: Clicking save and seeing estimate instead of creating new one

14. **Liquid filled MTS transformer report** (11/14/2024)
    - Fixed: Name not saving when PDFing
    - Updated: Data persistence

15. **Cover, Executive Summary and Table of Contents Page Breaks** (11/13/2024)
    - Added: Page break between Executive Summary and Table of Contents
    - Adjusted: Layout for professional output

16. **New customer creation from Opportunities** (11/21/2024)
    - Fixed: "Add New Customer" button copying user-typed name

17. **Dielectric Withstand Table Adjustments** (11/4/2024)
    - Moved: Units title and dropdown down one space
    - Improved: Table layout

18. **Show/Hide Preview Button not working** (11/4/2024)
    - Fixed: Preview toggle on report approval tab
    - Verified: Preview now shows/hides correctly

19. **Quoted amount bug** (11/3/2024)
    - Fixed: Amount not updating based on quantities in combined letter proposal

---

## 📊 Database Changes

### New Tables Created
```sql
-- Job Notes System
neta_ops.job_notes

-- After Action Reports
neta_ops.after_action_reports

-- Estimating Presets
neta_ops.estimating_presets

-- Enhanced Liquid Filled Transformer Reports
neta_ops.liquid_filled_xfmr_ats25_reports

-- Small LV Dry Type Transformer Reports
neta_ops.small_lv_dry_type_transformer_ats25_reports

-- Vendor Management
neta_ops.vendors
neta_ops.vendor_pos

-- Subcontractor Agreements
neta_ops.subcontractor_agreements
```

### Schema Updates
- Added `opportunity_type` to opportunities table
- Added urgency fields to assets/projects
- Added `created_by` to features_fixes table
- Enhanced generated_documents with additional status fields
- Updated issue priority permissions

### Migrations Run
```
Database Scripts/Setup & Configuration/
├── add_opportunity_type.sql
├── add-asset-urgency.sql
├── create_after_action_reports_tables.sql
├── create_estimating_presets_table.sql
├── create_job_notes_table.sql
├── create_liquid_filled_xfmr_ats25_reports.sql
├── create_small_lv_dry_type_transformer_ats25_reports.sql
├── create_vendors_tables.sql
├── create_vendor_pos_tables.sql
├── create_subcontractor_agreements.sql
└── fix_issue_priority_permissions.sql
```

---

## 🖥️ UI/UX Improvements

1. **Customer List Sorting** - Alphabetical A-Z and Z-A options
2. **Quick Navigation** - Google-style search for customers/contacts
3. **Features & Fixes Table** - Enhanced with filters, sorting, type icons
4. **Estimate Status Badge** - Visual indicator when estimate is open
5. **Letter Proposal Toggles** - Section visibility controls
6. **Dashboard Widgets** - Approved reports shortcut
7. **Job Notes Tab** - Chat/updates interface
8. **Priority Badges** - Color-coded Urgent/High/Normal/Low indicators
9. **Improved Print Styles** - Professional PDF output
10. **Dark Mode Consistency** - All new features support dark mode

---

## 📧 Automated Email Updates

### Weekly Jobs Status Report Fix
- **Issue**: Billed jobs were incorrectly showing as "Active"
- **Resolution**: Updated status filtering logic
- **Verified**: Correct status grouping in Monday reports

---

## 📝 Documentation Updates

- Updated `CHANGELOG.md` with all December 2024 changes
- Created comprehensive devlog (this document)
- Updated feature documentation
- Added migration instructions for new tables

---

## 🔜 Next Steps

### Remaining from Features & Fixes
- Continue monitoring for new issues
- User feedback collection on new features
- Performance optimization for large datasets

### Upcoming Focus Areas
1. Complete autosave rollout for remaining reports
2. Enhanced reporting analytics
3. Mobile-optimized views
4. Bulk operations support

---

## 📈 Impact Summary

### User Impact
- **Time Saved**: Reduced manual data entry with presets
- **Workflow Improved**: Better estimate/proposal management
- **Communication**: Job notes enable team collaboration
- **Organization**: Asset urgency helps prioritization

### System Reliability
- **Bugs Fixed**: 35+ issues resolved
- **Data Integrity**: Improved save/load reliability
- **Print Quality**: Professional PDF output
- **Permission Control**: Enhanced role-based access

---

## 🏆 Resolved Features & Fixes (Complete List)

### Feature Requests ✅
| Title | Priority | Date | Reporter |
|-------|----------|------|----------|
| Add Asset "Urgency" to projects | Normal | 12/18/2024 | Ethan Thoenes |
| After Action Report Form | Normal | 12/18/2024 | Ethan Thoenes |
| Add features to "Features & Fixes" list | Normal | 12/17/2024 | Ethan Thoenes |
| Quickly navigate customers & contacts | Normal | 12/16/2024 | Ethan Thoenes |
| Add alphabetical sort to Customers | Normal | 12/16/2024 | Ethan Thoenes |
| New "Type of Work" field within each Opportunity | High | 12/15/2024 | Ethan Thoenes |
| Manually adjust "Sent" Date for reports | Normal | 12/11/2024 | Ethan Thoenes |
| Each job needs a notes / chat / updates tab | Normal | 12/10/2024 | Ethan Thoenes |
| Approved Reports Shortcut / Summary on Home Page | High | 12/8/2024 | Ethan Thoenes |
| Duplicate Estimates | Normal | 11/26/2024 | Ethan Thoenes |
| Estimate Status | Normal | 11/26/2024 | Ethan Thoenes |
| Generating Letter Proposals toggles | Normal | 11/26/2024 | Ethan Thoenes |
| Add Estimating Presets | Low | 11/21/2024 | Ethan Thoenes |

### Issues Fixed ✅
| Title | Priority | Date | Reporter |
|-------|----------|------|----------|
| Cannot change opportunity type or save opportunity | Urgent | 12/30/2024 | Ethan Thoenes |
| Change to Weekly Jobs Status Report | Normal | 12/29/2024 | Ethan Thoenes |
| pdf report not displaying cal dates | Urgent | 12/19/2024 | Ryan Marthaler |
| GFI Trip Test Report Not in Report Review | Urgent | 12/16/2024 | Ethan Thoenes |
| ATS Panelboard Sheet - Hipot in test equipment | High | 12/16/2024 | Zach Freeborn |
| Edit/save button on feature & fixes doesn't work | High | 12/15/2024 | Ethan Thoenes |
| Not able to change issue / feature priority | Normal | 12/15/2024 | Ethan Thoenes |
| GFI Trip Test Report not printing results | Normal | 12/15/2024 | Ethan Thoenes |
| Issue Creating a Job | Urgent | 11/6/2024 | William Sasser |
| Create Duplicate Letter proposal | High | 11/5/2024 | Ethan Thoenes |
| Issue vs. feature requests | High | 11/25/2024 | Ethan Thoenes |
| Prompt after saving letter | Normal | 11/24/2024 | Ethan Thoenes |
| New customer creation from Opportunities | Low | 11/21/2024 | Jack Lyons |
| Add T&M Opportunity creation permissions | High | 11/21/2024 | Ethan Thoenes |
| No Customer or contract creation in T&M Jobs | High | 11/21/2024 | Ethan Thoenes |
| Estimates not re-arrangable | Normal | 11/18/2024 | Ethan Thoenes |
| Quarterly / 6 Monthly Views - In-Progress Dashboard | Normal | 11/18/2024 | Jack Lyons |
| Generated Proposals have the wrong address | Normal | 11/17/2024 | Ethan Thoenes |
| Opportunity sorting refresh | Normal | 11/17/2024 | Ethan Thoenes |
| Opportunity table sorting doesnt query ALL opportunities | Normal | 11/17/2024 | Ethan Thoenes |
| Low Voltage Breaker "FAIL" showing green | Urgent | 11/17/2024 | Ethan Thoenes |
| Add "Deliverables" Tab | Normal | 11/17/2024 | Ethan Thoenes |
| Add "Status" to cover letters / summaries | Normal | 11/17/2024 | Ethan Thoenes |
| Add edit / save buttons to Cover Letter & Executive summary | Normal | 11/17/2024 | Ethan Thoenes |
| Add Feature - rename cover letter button | Normal | 11/17/2024 | Ethan Thoenes |
| Estimates | Normal | 11/17/2024 | John Chambers |
| Fall of potential sheet | High | 11/14/2024 | Mason Motes |
| Issue with the liquid filled MTS transformer report | Normal | 11/14/2024 | Zach Freeborn |
| Cover, Executive Summary and Table of Contents Page Breaks | Normal | 11/13/2024 | Ryan Marthaler |
| Not Saving the Inspection Results | Urgent | 11/12/2024 | Zach Freeborn |
| Comment | Normal | 11/12/2024 | Chad Woodard |
| Add "created by" field to Features & Fixes Table | Normal | 11/4/2024 | Ethan Thoenes |
| Edit issue from Features & Fixes | Normal | 11/4/2024 | Ethan Thoenes |
| Dielectric Withstand Table Adjustments | Normal | 11/4/2024 | Ethan Thoenes |
| Show / Hide Preview Button not working | Normal | 11/4/2024 | Ethan Thoenes |
| Quoted amount bug | Low | 11/3/2024 | William Laidlaw |

---

*Last Updated: December 30, 2024*






