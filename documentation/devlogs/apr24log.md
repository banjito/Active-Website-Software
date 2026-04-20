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
