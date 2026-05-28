# Dev Log — Week ending May 29, 2026

## Autosave duplicate report fix

**Problem:** Employees saw many duplicate or “half duplicate” reports on jobs (e.g. 130+ copies of the same panelboard ATS report). DB evidence showed real separate report rows created milliseconds apart — not duplicate asset links.

**Root cause:** Autosave debounce (500ms) could fire a second save before the first `INSERT` returned. Code used async React state (`currentReportId`) to choose insert vs update, so both runs inserted.

**Fix:** Added synchronous refs on all autosave-enabled report components:
- `reportIdRef` — report id available immediately after first insert
- `creatingRef` — blocks concurrent inserts
- `pendingSaveRef` — runs one trailing autosave after insert if edits happened during the wait

**Files:** All `src/components/reports/*` components using `autoSaveTimerRef` / `isAutoSaveCreatedRef` (27 reports). Guide updated: `documentation/autosave-implementation-guide.md` (new “Concurrent-insert guard” section).

**Not in scope:** Deleting existing duplicate rows in Supabase — separate cleanup once confirmed with the field team.

**Verify:** Open a new panelboard ATS report, type rapidly for ~30s, confirm only one row appears in `assets` / report table for that session.
