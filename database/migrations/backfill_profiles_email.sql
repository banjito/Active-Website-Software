-- Backfill common.profiles.email from auth.users and keep it in sync.
--
-- Why: profiles rows created before the email mirror existed have email NULL
-- (33 of 56 rows as of 2026-08-06). Anything that resolves a person by email
-- from the client silently misses them, because only Admins can read
-- auth.users (common.admin_get_users). The AMP contacts dropdown in the header
-- linked names to profiles this way, so users like Aidan East showed up as
-- "no account" even though they have one.
--
-- Safe to re-run.

-- 1. One-time backfill. Only fills blanks; never overwrites an existing value.
UPDATE common.profiles p
SET email = u.email,
    updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND u.email IS NOT NULL
  AND (p.email IS NULL OR btrim(p.email) = '');

-- 2. Keep the mirror correct going forward.
--    The admin-update-user-email edge function already mirrors admin-initiated
--    changes; this covers new signups and any change made outside the app.
CREATE OR REPLACE FUNCTION common.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE common.profiles
    SET email = NEW.email,
        updated_at = now()
    WHERE id = NEW.id
      AND (email IS DISTINCT FROM NEW.email);
  END IF;
  RETURN NEW;
EXCEPTION
  -- Never let the mirror break signup or an email change.
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_email_trigger ON auth.users;
CREATE TRIGGER sync_profile_email_trigger
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION common.sync_profile_email();
