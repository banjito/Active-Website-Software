# Development Log – Week of March 17-21, 2026

## Summary

This week focused on major enhancements to the estimating system, specifically around labor hours tracking, pricing flexibility, and letter proposal generation.

---

## New Features & Enhancements

### Saturday & Sunday/Holiday Labor Hours Tracking Tables
- Added two alternate labor hours tracking tables for **Saturday** and **Sunday/Holiday** work scenarios in addition to the existing Monday-Friday table.
- Each table allows the estimator to manually allocate hours across Straight Time (RT), Overtime (OT), and Double Time (DT) — the same scope items are shared across all three scenarios, only the labor allocation changes.
- **Show/Hide toggle buttons** added to the M-F table header so the Saturday and Sunday tables only appear when needed, keeping the UI clean for simpler estimates.
- Each alternate table includes a **"Copy from M-F"** button to quickly populate from the weekday allocation as a starting point.
- Hours counter on each table compares allocated hours against quoted work hours with color-coded feedback (green = under, red = over, gray = exact match).
- Saturday table styled with orange accent, Sunday/Holiday with red accent for visual distinction.

### Travel Hours in Labor Hours Tracking Table
- **Moved travel labor hours** from the travel section into the Labor Hours Tracking table. Previously, travel time was calculated separately with its own rate in the travel section, making it easy to miss rate mismatches.
- Travel hours now appear as a "TRAVEL LABOR" sub-section in each labor tracking table (M-F, Saturday, Sunday) with their own RT/OT/DT allocation, using the same rates as work labor.
- Travel labor cost is still included in the **Total Travel Cost** display, which now shows a breakdown of travel labor vs. non-labor costs.
- The travel section's driving/air travel time tables still calculate total travel hours (trips, one-way hours, etc.), but the rate/cost is now controlled by the labor tracking table.

### Payment Terms Toggle for Letter Proposals
- Added a **payment term selector** (NET 30 / NET 60 / NET 90) to both the single-quote and combined-letter proposal generation dialogs.
- The letter proposal now shows pricing for the selected payment term with day-type breakdowns:
  - Monday - Friday price
  - Saturday price (when Saturday table is enabled)
  - Sunday/Holiday price (when Sunday table is enabled)
- Replaced the previous three-option format (Option 1/2/3 for NET 30/60/90) with a cleaner single-term format showing work schedule variations.

### Updated Financial Summary
- The **CUSTOMER TOTAL COST** table now shows columns for M-F, Saturday, and Sunday/Holiday pricing across all payment terms when those scenarios are enabled.
- SUB TOTAL and FINAL labels updated to indicate "M-F" when alternate day-type tables are active.
- Copy-paste quote text section updated to show all day-type pricing grouped by payment term.

---

## Technical Details

### Data Structure Changes
- Added `travelStraightTimeHours`, `travelOvertimeHours`, `travelDoubleTimeHours` to the `hoursSummary` object in `EstimateData`.
- Added optional `saturdayHoursSummary` and `sundayHoursSummary` objects to `EstimateData` with the same RT/OT/DT + travel structure.
- New state variables: `showSaturdayHours`, `showSundayHours`, `letterPaymentTerm`, manual hour flags for each day-type.
- All new data is persisted in the existing `data` JSON blob on the `business.estimates` table — no database schema changes required.

### Financial Calculation Refactoring
- Extracted `getMaterialExpenseBase()`, `getWorkLaborCost()`, `getTravelLaborCost()`, `getTravelNonLaborCost()` helper functions for cleaner calculation reuse.
- Added `getSaturdayFinalValue()` and `getSundayFinalValue()` functions that share the material/expense base with the M-F scenario but use their own labor allocations.
- `getTotalTravelCost()` now returns travel labor (from labor tracking table) + non-labor (from travel section) instead of pulling labor from the travel section's own rate field.

---

## Files Modified
- `src/components/estimates/EstimateSheet.tsx` — All changes in this file
