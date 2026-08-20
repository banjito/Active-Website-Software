# Dev Log — August 20, 2026

## Report Approvals list now matches the Reports tab

**Problem:** The Report Approvals list showed each report as a card with the asset identifier as its headline, but most reports showed no identifier at all. Only the ones whose saved name happened to include it did. Everything else fell back to the report type, so a substation full of "LV Circuit Breaker ATS 25" rows was impossible to tell apart. The card layout also looked nothing like the Reports tab sitting next to it.

**Fix:** Two changes.

The identifier is now read off the saved report itself when the asset name does not carry it, using the same lookup the Reports tab uses. That lookup rides along with the PASS/FAIL check that already runs, so it costs no extra queries, and each report is resolved once until the list is refreshed.

The list is now a table with the same columns, in the same order, as the Reports tab: Report Type, Identifier, Urgency, Status, Result, Submitted, and actions. Approved and Sent date columns appear only when reports in view actually have those dates, so the Pending tab stays narrow while the Approved and Sent tabs keep their timestamps.

**Why it matters:** Reviewers can tell one breaker report from another without opening them, and moving between the Reports tab and Report Approvals no longer means reading two different layouts.

**Notes:** Urgency shows as a read-only badge here rather than the editable dropdown on the Reports tab, since approvals is a review view. Files touched: `src/components/reports/ReportApprovalWorkflow.tsx`, `src/lib/reportEvaluations.ts`.
