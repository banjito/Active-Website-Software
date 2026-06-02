-- Seed digest email preferences for existing recipients (run once after deploy).
-- Replace placeholder emails with your current Supabase env values, then run in SQL editor.
--
-- Or use: node scripts/seed-digest-email-preferences.js (recommended — looks up user_id by email)

-- Example: review + weekly recipient (same person)
-- SELECT common.seed_digest_prefs_for_email(
--   'person@ampqes.com',
--   '{"dailyReview": true, "dailyReadyToBill": false, "weeklyReports": true}'::jsonb
-- );

CREATE OR REPLACE FUNCTION common.seed_digest_prefs_for_email(
  p_email text,
  p_automated jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common
AS $$
DECLARE
  v_user_id uuid;
  v_existing jsonb;
  v_merged jsonb;
BEGIN
  SELECT id INTO v_user_id
  FROM common.profiles
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No profile for email %', p_email;
    RETURN;
  END IF;

  SELECT notification_preferences INTO v_existing
  FROM common.user_preferences
  WHERE user_id = v_user_id;

  v_merged := coalesce(v_existing, '{}'::jsonb)
    || jsonb_build_object(
      'automatedEmails',
      coalesce(v_existing->'automatedEmails', '{}'::jsonb) || p_automated
    );

  INSERT INTO common.user_preferences (user_id, notification_preferences, updated_at)
  VALUES (v_user_id, v_merged, now())
  ON CONFLICT (user_id) DO UPDATE
  SET notification_preferences = EXCLUDED.notification_preferences,
      updated_at = now();
END;
$$;

-- Uncomment and edit after replacing emails:
-- SELECT common.seed_digest_prefs_for_email(
--   'your-review@ampqes.com',
--   '{"dailyReview": true, "weeklyReports": true}'::jsonb
-- );
-- SELECT common.seed_digest_prefs_for_email(
--   'accounting@ampqes.com',
--   '{"dailyReadyToBill": true}'::jsonb
-- );
