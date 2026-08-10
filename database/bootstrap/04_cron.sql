-- Scheduled database jobs (pg_cron), exported from the AMP production
-- instance on 2026-07-14.
SELECT cron.schedule('cleanup-old-messages', '0 * * * *', 'SELECT common.delete_old_chat_messages()');
SELECT cron.schedule('daily-review-notification', '0 18 * * *', 'SELECT trigger_daily_review_notification();');

-- Live-update (realtime) subscriptions used by report status badges.
ALTER PUBLICATION supabase_realtime ADD TABLE neta_ops.assets;
