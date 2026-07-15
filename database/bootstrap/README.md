# Database bootstrap — build an empty ampOS database from scratch

Builds a brand-new Supabase project into a working, empty ampOS database.
Exported from the AMP production instance on 2026-07-14 (246 tables, 521
security policies, 13 storage buckets). **Never run this against an existing
instance** — it is for fresh, empty projects only.

## Before running: replace AMP-specific values

The schema embeds a few AMP values inside database functions and security
policies. In each file, find-and-replace **before** running:

| Find | Replace with |
|---|---|
| `john.chambers@ampqes.com` | buyer's first superuser email |
| `jack.lyons@ampqes.com` | buyer's second superuser email |
| `@ampqes.com` | buyer's email domain (catches the employee-domain checks) |

Do the replaces in that order (the domain replace last, so it doesn't
mangle the full addresses first).

## Run order

Paste each file into the new project's **SQL editor** (Dashboard → SQL
Editor) and run, in this order:

1. `00_init.sql` — database extensions (uuid, crypto, http, scheduling)
2. `01_functions_extensions.sql` — helper functions (chat, admin, notifications)
3. `02_schema.sql` — all tables, functions, security policies, grants
   (large file ~1 MB; if the SQL editor rejects it, split it or run via
   `psql -f 02_schema.sql "<connection-string>"`)
4. `03_storage.sql` — storage buckets + file-access policies
5. `04_cron.sql` — scheduled jobs (hourly chat cleanup, 6 PM daily review
   email) + live-update subscriptions for the community board

## After running

1. **Create the first admin user**: Dashboard → Authentication → Add user
   (email + password, auto-confirm). Then in SQL editor:
   ```sql
   UPDATE auth.users SET raw_user_meta_data =
     coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role": "Admin"}'::jsonb
   WHERE email = 'admin@buyer-domain.com';
   INSERT INTO common.profiles (id, email, role)
   SELECT id, email, 'Admin' FROM auth.users
   WHERE email = 'admin@buyer-domain.com';
   ```
2. Deploy the 23 edge functions and set their secrets (see the playbook in
   `documentation/NEW_INSTANCE_PLAYBOOK.md`).
3. Point the app at the new project via `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY`, then log in and smoke-test: create a customer,
   create a job, open the admin dashboard → Website Theme and save a color.

## Keeping this up to date

This snapshot goes stale as the AMP schema evolves. Regenerate before each
new instance:

```
/opt/homebrew/opt/libpq/bin/pg_dump \
  "postgresql://postgres.<project-ref>@aws-0-us-east-2.pooler.supabase.com:5432/postgres" \
  --schema-only --no-owner \
  --schema=public --schema=common --schema=neta_ops --schema=hr --schema=business \
  -f database/bootstrap/02_schema.sql
```

(password: `SUPABASE_DB_PASSWORD` in `.env`; then re-apply the
`CREATE SCHEMA IF NOT EXISTS` fix — `sed -i '' 's/^CREATE SCHEMA \([a-z_]*\);/CREATE SCHEMA IF NOT EXISTS \1;/' database/bootstrap/02_schema.sql`.)
The other files rarely change; regenerate them the same way this set was
built if buckets/cron jobs are added.

## Known gaps

- `auth` configuration (email templates, redirect URLs, providers) is set in
  the Dashboard, not SQL — covered in the playbook.
- Edge-function secrets and Storage CORS are per-project Dashboard settings.
