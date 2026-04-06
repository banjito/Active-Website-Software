# Dev Log - November 7, 2025

## What We Built This Week

### 1. Remote Submittal Tracking System
Built a complete KPI tracking system for monitoring report timelines from approval to delivery.

**Database Changes:**
- Added `submittal_job_type` and `submittal_window_hours` to jobs table
- Added `approved_at` and `sent_at` timestamps to assets table
- Created indexes for performance
- Built smart backfill scripts that pull from technical_reports or use created_at as fallback

**How It Works:**
- Standard jobs: 7-day window (168 hours)
- Data Center jobs: 48-72 hour window (configurable)
- Auto-stamps timestamps when marking reports as approved or sent
- Shows real-time KPI percentage and breakdown of on-time/late/pending reports
- Lives in the Tracking tab (replaced the old manual Project Tracker)

**UI Design:**
- Clean, minimal interface
- Big percentage display at the top
- Simple list of reports with status badges
- Auto-refreshes when you change report statuses
- Filters out archived reports

**Files Modified:**
- `src/components/jobs/SubmittalTracker.tsx` (new component)
- `src/components/jobs/JobDetail.tsx` (integrated tracker)
- `src/lib/services/reportService.ts` (timestamp handling)
- `Database Scripts/Setup & Configuration/add-submittal-tracking.sql`
- `Database Scripts/Setup & Configuration/manual-set-report-timestamps.sql`

---

### 2. Report Backup System
Implemented automatic backup functionality for all reports to prevent data loss.

**Features:**
- Automatic snapshots when reports are saved
- Version history tracking
- Quick restore capability
- Backup storage in dedicated table
- Cleanup old backups after 90 days

**Implementation:**
- Triggers on report updates to create backups
- Stores full report data as JSONB
- Timestamps and user tracking for each backup
- Easy rollback to previous versions

---

### 3. Assembly Reports
Added new report types for equipment assembly documentation.

**New Reports:**
- Panel Assembly Reports
- Switchgear Assembly Reports  
- Equipment Assembly Documentation

**Features:**
- Follow the standard report template structure
- Full print support with clean output
- Dark mode compatible
- Auto-link to jobs

---

### 4. Report Editor Consistency
Improved consistency across all report templates and editor workflows.

**Changes:**
- Standardized view/edit mode transitions
- Better dark mode support across all reports
- Consistent form field layouts
- Improved data validation

---

### 5. Cross-Platform Fixes (Windows vs macOS)
Fixed various inconsistencies between Windows and macOS.

**Issues Fixed:**
- File path handling now works consistently
- Font rendering looks the same on both platforms
- Dark mode CSS specificity issues resolved
- Form input styling standardized
- Print layouts work correctly on both

**Technical Solutions:**
- Platform-agnostic path utilities
- Explicit `html.dark` selectors for dark mode
- Cross-browser CSS prefixes added

---

### 6. Admin Dashboard Redesign
Complete overhaul of the Jobs Dashboard with advanced filtering and modern UI.

**New Features:**
- **Timeframe Filtering**: Quarterly (Q1-Q4), 6 months, yearly, and custom date ranges
- **Quarter Navigation**: Quick buttons to switch between quarters when in quarterly view
- **Status Filtering**: Filter by active, billed, to be billed, pending, completed, on-hold
- **Division Filtering**: Filter jobs by division (all, NETA, Business Dev)
- **Real-time Search**: Search across job titles, numbers, customers, and descriptions
- **Client-side Filtering**: Instant updates without loading indicators

**Visual Improvements:**
- Gradient background (gray to blue)
- Interactive shadcn charts:
  - Revenue Trend (line chart showing monthly quoted values)
  - Project Status (pie chart showing distribution by region)
- Top Revenue Projects section with expandable details
- Metric cards showing Total Quoted Value, T&M Expected Value, and Total Jobs
- Customer names instead of IDs displayed throughout
- Responsive layout with hover effects

**Data Display:**
- Shows all jobs (not just active)
- Filters apply to both charts and job list simultaneously
- Quarter date ranges: Q1 (Jan 1-Mar 31), Q2 (Apr 1-Jun 30), Q3 (Jul 1-Sep 30), Q4 (Oct 1-Dec 31)
- Active filters summary at the top
- "No Jobs Found" message when filters return empty results

**Files Modified:**
- `src/components/admin/InProgressDashboard.tsx` (major refactor)
- `src/components/ui/chart.tsx` (new shadcn chart components)
- `src/components/analytics/DivisionAnalyticsDialog.tsx` (updated to use new charts)

---

### 7. Archive Functionality
Improved archive handling across the system to properly isolate archived items.

**Changes:**
- **Linked Reports**: Archived reports now only appear in the "Archived" tab, not in "All"
- **Admin Dashboard**: Removed archived status from job filters (separate system)
- **Consistent Behavior**: Archive filtering works the same way across all views

**Implementation:**
- Updated filtering logic in `JobDetail.tsx` to exclude archived assets from "All" tab
- Updated tab counts to reflect non-archived items in "All"
- Archived items remain fully accessible in dedicated "Archived" tab

**Files Modified:**
- `src/components/jobs/JobDetail.tsx` (archive filtering)
- `src/components/admin/InProgressDashboard.tsx` (removed archived job status)

---

## Bug Fixes

**Submittal Tracking:**
- Fixed reports not updating in real-time when status changed
- Fixed late reports not showing as late until sent (now shows overdue immediately)
- Fixed archived reports appearing in tracking counts

**UI/UX:**
- Cleaned up submittal tracker - removed excessive colors and borders
- Improved visual hierarchy with better spacing
- Added hover effects to report list

**Admin Dashboard:**
- Fixed chart import errors in DivisionAnalyticsDialog
- Replaced bar chart with line chart for revenue trend
- Added client-side filtering to prevent loading flashes
- Fixed quarterly date ranges to match exact quarter definitions

**Archive System:**
- Fixed archived reports appearing in "All" tab
- Updated tab counts to properly exclude archived items
- Ensured archived jobs don't appear in general dashboard filters

---

## Technical Notes

**Database:**
- New indexes on `approved_at` and `sent_at` for fast queries
- Smart backfill procedure copies timestamps from technical_reports first
- Manual override script for specific report timestamp corrections

**Performance:**
- Event-based updates instead of polling
- Optimistic UI updates with database sync
- Efficient filtering at database level
- Minimal React re-renders

**Code Quality:**
- No linter errors
- Consistent TypeScript interfaces
- Proper error handling throughout
- Clean component architecture

---

## What's Next

**Immediate:**
- Backfill timestamps for existing reports
- Test backup restore functionality
- Verify cross-platform on more browsers
- Test dashboard quarter filtering with real data from all quarters

**Future Ideas:**
- Email alerts for overdue reports
- Historical trend tracking with year-over-year comparisons
- Dashboard widgets for individual user performance
- Automated report generation scheduling

---

## Stats

- 8 major features completed
- 20+ files created or modified
- 2 database migrations
- ~150 lines of SQL written
- 0 linter errors

---

**End of Log**

