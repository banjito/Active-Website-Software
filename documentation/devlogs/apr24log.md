# Dev Log — Week ending Friday, April 24, 2026

## Focus
Follow-up fixes on the recent Opportunities / Customers / Contacts division-tagging
rollout, plus two noisy regressions that surfaced when opening the Jobs →
Scavenger page.

---

## Issues reported

1. **Duplicate contact creation.** A user created a contact and it was inserted
   twice.
2. **Divisions cannot be assigned to contacts.** During contact creation or edit
   there was no way to tag a contact with a division.
3. **Jobs Scavenger page throwing 400 / 403 in console on load:**
   - `GET /rest/v1/job_notifications?...&select=*,job:job_id(id,deleted_at)` →
     **400 PGRST200** "Could not find a relationship between 'job_notifications'
     and 'job_id' in the schema cache".
   - `GET /rest/v1/user_preferences?select=notification_preferences&user_id=eq.…`
     → **403 42501** "permission denied for table users".
4. Jobs Scavenger page eventually loaded but was slow (caused by the repeated
   failed requests above).

---

## Root causes

### Duplicate contact
`ContactList.handleSubmit` (and the add-contact dialog on `CustomerDetail`) had
no in-flight guard and no disabled state on the submit button. A double-click —
easy to do when the DB is slow — would run the insert twice.

### No divisions on contacts
Tagging was added to `common.customers` (column `divisions text[]`) in the
previous week's work, but the `common.contacts` table was never given the same
column, and the contact forms never exposed a picker. The contact list's
division tabs worked indirectly by filtering to customers whose `divisions`
array overlapped — contacts had no way to express their own.

### `job_notifications` 400 error
`notificationService.getUserNotifications` was embedding `job:job_id(id,deleted_at)`
via PostgREST. `job_notifications` lives in the `common` schema; `jobs` lives
in `neta_ops`. PostgREST's schema cache doesn't resolve foreign keys across
exposed schemas, so every page that renders `JobNotifications` was firing a 400.

### `user_preferences` 403 error
The RLS policy on `common.user_preferences` (or an attached trigger) was
referencing the `users` table that the `authenticated` role doesn't have
SELECT on, so every request returned 42501.

---

## Fixes shipped

### Code

| File | Change |
| --- | --- |
| `src/components/customers/ContactList.tsx` | Added `isSubmitting` guard + disabled/"Saving…" state on Add/Edit contact submit. Added **Divisions** picker to the form. Extended `fetchContacts` to filter by contact-level `divisions` OR fall back to the customer's divisions. Graceful 42703 fallback if the DB migration hasn't been run yet. |
| `src/components/customers/ContactDetail.tsx` | Added `divisions: string[]` to the edit form, added a picker in edit mode, show division badges in read-only view. `isSaving` guards the submit. 42703 fallback on save. |
| `src/components/customers/CustomerDetail.tsx` | Add-contact dialog: `isSubmittingContact` guard + disabled button, new **Divisions** picker, 42703 fallback on insert. |
| `src/services/notificationService.ts` | Removed the cross-schema PostgREST embed `job:job_id(…)`. Now fetches notifications first, then looks up deleted job IDs from `neta_ops.jobs` in a bounded `IN (...)` query. Applied to both `getUserNotifications` and `getUnreadNotificationCount`. Silenced `42501`/`42P01`/`PGRST301` in `getUserNotificationPreferences` so they no longer spam the console on every page load. |

### Database

| File | Purpose |
| --- | --- |
| `Database Scripts/Setup & Configuration/add_divisions_to_contacts.sql` | Adds `divisions text[]` + GIN index to `common.contacts`. Mirrors the customers migration. |
| `Database Scripts/Setup & Configuration/fix_user_preferences_permissions.sql` | Creates `common.user_preferences` if missing, drops any existing policies, re-creates SELECT/INSERT/UPDATE/DELETE policies scoped to `auth.uid()` (no `users` table lookup), grants schema + table access to `authenticated`, and does `NOTIFY pgrst, 'reload schema'`. |

---

## Deployment / next steps

1. Run `add_divisions_to_contacts.sql` in Supabase SQL editor.
2. Run `fix_user_preferences_permissions.sql` in Supabase SQL editor.
3. After both migrations, the 400/403/42501 console noise on the Scavenger
   Jobs page should disappear, and the Contact edit/create dialogs should
   show the Divisions picker that actually persists.
4. The client-side code is backward-compatible — if the contacts migration is
   skipped, forms will silently drop the `divisions` key on 42703.

---

## Verification checklist

- [ ] Contact can be created/edited from ContactList with divisions and only
      inserts once when the button is clicked rapidly.
- [ ] Contact divisions visible as pills on `ContactDetail` view.
- [ ] Filtering the Contacts list by a division tab returns contacts tagged at
      the contact level **or** inherited from their customer.
- [ ] Scavenger Jobs page loads without 400/403 errors in console.
- [ ] Notification bell still renders correctly and hides notifications whose
      job has been soft-deleted.

---

## Org Chart — shared positions, searchable reporting, manager groups

### Problems
1. Visual gaps between cards and broken connector lines when siblings had
   different subtree widths.
2. Reporting selector was a scrollable checkbox list — unusable once the chart
   had more than ~15 people.
3. Business case: some technicians report to multiple project managers. We had
   no way to say "these two managers share reports" or to bulk-assign an
   employee to an entire pod at once.

### Fixes

| File | Change |
| --- | --- |
| `src/pages/hr/data/OrgChart.tsx` | Rewrote sibling connector row: cells are now contiguous with `px-4` per cell and the horizontal bus uses `w-full -mx-4` so bars bridge the padding between siblings. First/last children only render the inner half of the bar. Vertical drops are `3px` solid. |
| `src/pages/hr/data/OrgChart.tsx` | New `ManagerPicker` component replaces the scrollable checkbox list in both Add and Edit modals. Type-to-search against name + job title, selected managers shown as removable chips, popover list limited to 20 matches. |
| `src/pages/hr/data/OrgChart.tsx` | Dragging a person onto another person now opens a "Choose relationship" dialog: **Move Under** (current behavior, group-aware for the target) or **Group Together** (makes both managers peers in a shared manager group). Dropping on the empty top-level zone still moves straight to top-level. |
| `src/pages/hr/data/OrgChart.tsx` | `handleMoveUnder` expands the target to the full group when the target is in a manager group, so a single drop creates multi-manager reporting rows for every group member. |
| `src/pages/hr/data/OrgChart.tsx` | `handleGroupTogether` creates a new group, adds to an existing group, or merges two groups as needed. `handleUngroup` removes a profile and tears down the group if it falls below 2 members. |
| `src/pages/hr/data/OrgChart.tsx` | `FlowchartNode` cards in a manager group now render with a colored ring, a "Grouped manager (shares reports)" label, and an **Ungroup** button. Group color comes from the `common.org_chart_manager_groups.color` column. |
| `src/pages/hr/data/OrgChart.tsx` | Fetch path gracefully degrades: if `org_chart_manager_groups*` tables don't exist yet, `managerGroupsSupported` flips to `false`, the **Group Together** option disables itself with a message pointing at the migration. |

### Database

| File | Purpose |
| --- | --- |
| `Database Scripts/Setup & Configuration/enable_org_chart_manager_groups.sql` | Creates `common.org_chart_manager_groups` (id, name, color) and `common.org_chart_manager_group_members` (profile_id PK, group_id FK). One profile can belong to one group. Grants SELECT/INSERT/UPDATE/DELETE to `authenticated`, RLS disabled to match the rest of the org chart tables. |

### Deployment / next steps

1. Run `enable_org_chart_manager_groups.sql` in Supabase SQL editor.
2. Existing charts work unchanged — grouping is additive.
3. When dragging a tech onto a grouped manager, verify they get one row in
   `common.org_chart_assignments` per member of the group (needs the multi-manager
   migration from earlier in the week to also be applied).

### Verification checklist

- [ ] Sibling connector lines are continuous with no visual break across the
      horizontal bus, regardless of how many siblings.
- [ ] Add Person modal shows a search input with chips instead of a long
      checkbox list.
- [ ] Dragging Manager A onto Manager B opens the relationship dialog with both
      names filled in.
- [ ] "Group Together" with two non-grouped managers creates a new group
      (colored ring on both cards).
- [ ] "Group Together" when one party is already grouped joins the other into
      the existing group.
- [ ] Dropping a technician onto any member of a group creates multi-manager
      assignments for every group member.
- [ ] Ungroup button removes that profile from the group and dissolves the
      group if it had exactly 2 members.
