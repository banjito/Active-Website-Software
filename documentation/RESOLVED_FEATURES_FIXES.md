# Resolved Features & Fixes Summary

**Last Updated**: January 7, 2025

This document provides a comprehensive summary of all resolved features and issues in ampOS, organized by category and date.

---

## 📊 Statistics Overview

| Metric | Count |
|--------|-------|
| **Total Resolved Items** | 55+ |
| **Feature Requests** | 16+ |
| **Bug Fixes** | 36+ |
| **Urgent Priority** | 7 |
| **High Priority** | 10 |
| **Normal Priority** | 26+ |
| **Low Priority** | 4 |

---

## 🎯 Feature Requests (Resolved)

### January 2025

| Title | Priority | Date | Reporter | Description |
|-------|----------|------|----------|-------------|
| User Preferences Migration to Supabase | Normal | 1/7 | Internal | Migrated user preferences (filters, drafts, UI state) from localStorage to Supabase `user_preferences` JSONB column. Includes cross-tab sync via BroadcastChannel, caching, and automatic migration. See `devlogs/jan7log.md` |

### December 2024

| Title | Priority | Date | Reporter | Description |
|-------|----------|------|----------|-------------|
| Add Asset "Urgency" to projects | Normal | 12/18 | Ethan Thoenes | Classify items as hot/due immediately, push through ampOS |
| After Action Report Form | Normal | 12/18 | Ethan Thoenes | Two forms - one for technicians, one for review |
| Add features to "Features & Fixes" list | Normal | 12/17 | Ethan Thoenes | Sort by priority, view list by priority level |
| Quickly navigate customers & contacts | Normal | 12/16 | Ethan Thoenes | Google-style search for direct page navigation |
| Add alphabetical sort to Customers | Normal | 12/16 | Ethan Thoenes | Ascending and Descending sort for all customers |
| New "Type of Work" field within Opportunity | **High** | 12/15 | Ethan Thoenes | "Opportunity Type" field with four options |
| Manually adjust "Sent" Date for reports | Normal | 12/11 | Ethan Thoenes | Team leads, PMs, and admin can manually change sent date |
| Each job needs a notes/chat/updates tab | Normal | 12/10 | Ethan Thoenes | Place to put updates and notes for jobs |
| Approved Reports Shortcut on Home Page | **High** | 12/8 | Ethan Thoenes | Summary view like "Review Shortcuts" and "Issues" |

### November 2024

| Title | Priority | Date | Reporter | Description |
|-------|----------|------|----------|-------------|
| Duplicate Estimates | Normal | 11/26 | Ethan Thoenes | Button to duplicate an estimate within an opportunity |
| Estimate Status | Normal | 11/26 | Ethan Thoenes | Status visible when estimate is open |
| Generating Letter Proposals | Normal | 11/26 | Ethan Thoenes | Toggles/checkboxes to show or not show sections |
| Add Estimating Presets | Low | 11/21 | Ethan Thoenes | Page for estimating pre-sets that estimates pull from |

---

## 🐛 Bug Fixes (Resolved)

### Urgent Priority

| Title | Date | Reporter | Description | Resolution |
|-------|------|----------|-------------|------------|
| Opportunities Infinite Loading Bug | 1/7/2025 | Brian Rodgers | Opportunities page stuck on loading spinner forever for users with saved search filters | Fixed loading state management - `finally` block now clears both `loading` and `searchLoading` states. Root cause: when `debouncedSearch` was set from saved filters, only `searchLoading` was cleared but render checked `loading` which stayed `true`. See `devlogs/jan7log.md` |
| Medium Voltage Cable ATS/MTS PDF printing gap | 1/2025 | User | Huge page-long gap between header and content, pushing all sections to page 2 | Restructured layout, moved JobInfoPrintTable outside wrapper, removed all spacing/gaps, fixed page breaks. See `PDF_PRINTING_SPACING_FIX.md` |
| Cannot change opportunity type or save opportunity | 12/30 | Ethan Thoenes | Only shows Large/Small acceptance options | Fixed state management |
| pdf report not displaying cal dates | 12/19 | Ryan Marthaler | 7.1.2 Panelboard Assemblies ATS 25 cal dates missing | Fixed PDF rendering |
| GFI Trip Test Report Not in Report Review | 12/16 | Ethan Thoenes | Cannot view report in report review | Added to review workflow |
| Low Voltage Breaker "FAIL" showing green | 11/17 | Ethan Thoenes | FAIL should be red, not green | Fixed color logic |
| Not Saving the Inspection Results | 11/12 | Zach Freeborn | Visual and mechanical inspection results not saving | Fixed state persistence |
| Issue Creating a Job | 11/6 | William Sasser | Job created in wrong folder | Fixed folder assignment |

### High Priority

| Title | Date | Reporter | Description | Resolution |
|-------|------|----------|-------------|------------|
| ATS Panelboard Sheet - Hipot issue | 12/16 | Zach Freeborn | Sheet 7.1.2 has Hi-Pot in test equipment | Removed from equipment list |
| Edit/save button on Features & Fixes | 12/15 | Ethan Thoenes | Editing doesn't save changes | Fixed save functionality |
| Create Duplicate Letter proposal | 11/5 | Ethan Thoenes | Need ability to duplicate from popup | Added duplicate button |
| Issue vs. feature requests | 11/25 | Ethan Thoenes | Need to differentiate between types | Added type field |
| Add T&M Opportunity creation permissions | 11/21 | Ethan Thoenes | Specific users need T&M permissions | Added role permissions |
| No Customer or contract creation in T&M Jobs | 11/21 | Ethan Thoenes | Missing add customer/contact buttons | Added creation buttons |
| Fall of potential sheet | 11/14 | Mason Motes | Missing input boxes for 80%, 60%, 40% | Added input fields |

### Normal Priority

| Title | Date | Reporter | Description | Resolution |
|-------|------|----------|-------------|------------|
| Change to Weekly Jobs Status Report | 12/29 | Ethan Thoenes | "Billed" jobs showing as "Active" | Fixed status filtering |
| Not able to change issue/feature priority | 12/15 | Ethan Thoenes | Cannot change priority after creation | Fixed permissions |
| GFI Trip Test Report not printing results | 12/15 | Ethan Thoenes | Long text not showing in print preview | Fixed print rendering |
| Prompt after saving letter | 11/24 | Ethan Thoenes | Unnecessary prompt after save | Removed redundant prompt |
| Estimates not re-arrangable | 11/18 | Ethan Thoenes | Can't reorder estimates | Added drag-and-drop |
| Quarterly/6 Monthly Views - Dashboard | 11/18 | Jack Lyons | Only shows 2-4 months | Fixed view range |
| Generated Proposals wrong address | 11/17 | Ethan Thoenes | Wrong address at END OF LETTER | Fixed address mapping |
| Opportunity sorting refresh | 11/17 | Ethan Thoenes | Defaults to letter number sort | Fixed sort persistence |
| Opportunity table sorting query | 11/17 | Ethan Thoenes | Old opportunities not included | Fixed query scope |
| Add "Deliverables" Tab | 11/17 | Ethan Thoenes | Need deliverables functionality | Added tab/functionality |
| Add "Status" to cover letters | 11/17 | Ethan Thoenes | Need status for saved items | Added status field |
| Add edit/save to Cover Letter | 11/17 | Ethan Thoenes | Need editing after save | Added edit functionality |
| Rename cover letter button | 11/17 | Ethan Thoenes | Need to rename existing items | Added rename button |
| Estimates save issue | 11/17 | John Chambers | Save creates new instead of updating | Fixed save logic |
| Liquid filled MTS transformer report | 11/14 | Zach Freeborn | Name not saving when PDFing | Fixed data persistence |
| Page Breaks (Cover, Summary, TOC) | 11/13 | Ryan Marthaler | Need page break adjustments | Added proper page breaks |
| Comment | 11/12 | Chad Woodard | Explain/correct comment | Resolved |
| Add "created by" to Features & Fixes | 11/4 | Ethan Thoenes | See who reported issue | Added field |
| Edit issue from Features & Fixes | 11/4 | Ethan Thoenes | Edit after submission | Added edit capability |
| Dielectric Withstand Table | 11/4 | Ethan Thoenes | Move units title down one space | Adjusted layout |
| Show/Hide Preview Button | 11/4 | Ethan Thoenes | Button not working | Fixed toggle |

### Low Priority

| Title | Date | Reporter | Description | Resolution |
|-------|------|----------|-------------|------------|
| New customer creation from Opportunities | 11/21 | Jack Lyons | Copy user-typed name to button | Fixed button behavior |
| Quoted amount bug | 11/3 | William Laidlaw | Amount not updating in combined proposal | Fixed calculation |

---

## 📁 Related Database Scripts

All database changes have corresponding migration scripts in:
`/Database Scripts/Setup & Configuration/`

| Script | Purpose |
|--------|---------|
| `add_opportunity_type.sql` | New opportunity type field |
| `add-asset-urgency.sql` | Asset urgency classification |
| `create_after_action_reports_tables.sql` | After action reports |
| `create_estimating_presets_table.sql` | Estimating presets |
| `create_job_notes_table.sql` | Job notes/chat system |
| `fix_issue_priority_permissions.sql` | Priority change permissions |

---

## 🔄 Implementation Timeline

### Week 1 (Nov 3-9, 2024)
- Features & Fixes table enhancements
- Dielectric Withstand Table adjustments
- Show/Hide Preview fix
- Job creation bug fix

### Week 2 (Nov 10-16, 2024)
- Inspection results save fix
- Page break adjustments
- Fall of potential sheet fix
- Liquid filled transformer report fix

### Week 3 (Nov 17-23, 2024)
- Deliverables tab
- Cover letter enhancements
- Opportunity sorting fixes
- T&M permissions and creation
- FAIL color fix

### Week 4 (Nov 24-30, 2024)
- Estimate enhancements (duplicate, status, reorder)
- Letter proposal toggles
- Issue vs feature differentiation

### December 2024
- Asset urgency system
- After Action Report Form
- Job notes/chat system
- Customer navigation improvements
- Approved reports dashboard widget
- GFI Trip Test Report fixes
- Opportunity type fix

### January 2025 (Week 1)
- **Critical Fix:** Opportunities infinite loading bug for users with saved search filters
- User preferences migration from localStorage to Supabase
- Cross-tab preference synchronization
- Lucide-react icon compatibility fix

---

## 📊 By Reporter

| Reporter | Items Resolved |
|----------|----------------|
| Ethan Thoenes | 35+ |
| Zach Freeborn | 3 |
| Ryan Marthaler | 2 |
| Jack Lyons | 2 |
| John Chambers | 2 |
| Brian Rodgers | 1 |
| Mason Motes | 1 |
| William Sasser | 1 |
| William Laidlaw | 1 |
| Chad Woodard | 1 |
| Jerry Burton | 1 |

---

## 📈 Resolution Metrics

### By Month
| Month | Resolved |
|-------|----------|
| November 2024 | 30+ |
| December 2024 | 20+ |
| January 2025 | 3+ |

### By Priority Distribution
| Priority | Count | Percentage |
|----------|-------|------------|
| Urgent | 6 | 12% |
| High | 10 | 20% |
| Normal | 30+ | 60% |
| Low | 4 | 8% |

---

## 🔍 Quick Reference

### Most Common Fix Areas
1. **Reports** - Print rendering, data saving, status
2. **Opportunities** - Sorting, type, creation
3. **Estimates** - Duplication, ordering, status
4. **UI/UX** - Buttons, toggles, navigation
5. **Permissions** - Role-based access, edit capabilities

### Key Database Tables Affected
- `opportunities` - New type field
- `features_fixes` - Type, created_by, priority
- `generated_documents` - Status, edit tracking
- `job_assets` - Urgency
- `job_notes` - New table

---

*For detailed technical implementation, see the weekly devlogs in `/documentation/devlogs/`*



