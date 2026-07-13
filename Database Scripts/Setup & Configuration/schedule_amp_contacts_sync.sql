-- ============================================================================
-- Schedule AMP Phone List sync from Google Sheet (every 5 minutes)
-- ============================================================================
-- Calls the sync-amp-contacts Edge Function on a schedule so common.amp_contacts
-- mirrors the "AMP Phone List" Google Sheet. Run in Supabase SQL Editor.
--
-- Before running: replace <ANON_KEY> below with the project's anon key
-- (Dashboard -> Settings -> API). The anon key is safe to embed here; the
-- function itself uses its own service-role secret internally.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove a previous schedule if it exists (safe to run repeatedly)
DO $$
BEGIN
    PERFORM cron.unschedule('sync-amp-contacts');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'sync-amp-contacts',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://vdxprdihmbqomwqfldpo.supabase.co/functions/v1/sync-amp-contacts',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <ANON_KEY>'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Verify: SELECT * FROM cron.job WHERE jobname = 'sync-amp-contacts';
-- Recent runs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- To stop syncing: SELECT cron.unschedule('sync-amp-contacts');
