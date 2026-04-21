-- =====================================================
-- Grant service_role access to offer-related tables so
-- Supabase edge functions (offer-approval-notification) can
-- read the rows they need via PostgREST.
--
-- Symptom without this grant:
--   Offer fetch status: 403
--   "code":"42501","message":"permission denied for table offers"
-- =====================================================

GRANT USAGE ON SCHEMA common TO service_role;

GRANT SELECT ON common.offers TO service_role;
GRANT SELECT ON common.offer_approvals TO service_role;
GRANT SELECT ON common.offer_approvers TO service_role;
GRANT SELECT ON common.candidates TO service_role;

-- Profiles is used as a fallback email source in the edge function
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'common' AND table_name = 'profiles'
    ) THEN
        EXECUTE 'GRANT SELECT ON common.profiles TO service_role';
    END IF;
END $$;

-- Also grant to authenticated role in case RLS/grant was missing there too
-- (needed so admins using their own session can read via the app).
-- These mostly match the historical migration, kept here for safety.
GRANT ALL ON common.offers TO authenticated;
GRANT ALL ON common.offer_approvals TO authenticated;
