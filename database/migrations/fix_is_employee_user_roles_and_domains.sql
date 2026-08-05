-- Fix: common.is_employee_user() locked out every @cedsi.com account.
--
-- The function gated employee access on a single hardcoded email domain
-- (@ampqes.com) plus a role allowlist that had drifted out of sync with the
-- app's actual role names in src/lib/roles.ts.
--
-- Every @cedsi.com user carries user_metadata.role = 'Engineer'. That value was
-- absent from the allowlist ('engineering' was present, 'engineer' was not), and
-- their email fails the @ampqes.com check, so is_employee_user() returned false
-- for all of them. ~66 RLS policies across neta_ops and common are gated on this
-- function, including the only employee policy on neta_ops.jobs, so those users
-- authenticated successfully and then saw an empty, broken app.
--
-- The ampqes.com accounts never hit the role gap because the domain check
-- short-circuited it for them.
--
-- Two changes:
--   1. Domain check accepts the full employee-domain list for this instance.
--      (New white-label instances: replace this list — see
--      documentation/NEW_INSTANCE_PLAYBOOK.md and database/bootstrap/README.md.)
--   2. Role allowlist now carries the real role names from src/lib/roles.ts.
--      'Lab Customer' is deliberately excluded — that is a customer, not staff.

CREATE OR REPLACE FUNCTION common.is_employee_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND (
      -- Employee email domains for this instance.
      lower(coalesce(auth.jwt() ->> 'email', '')) LIKE ANY (
        ARRAY['%@ampqes.com', '%@cedsi.com']
      )
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'account_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'account_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'user_type', ''))    = 'employee'
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'user_type', ''))    = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'role', '')) IN (
        -- canonical roles (src/lib/roles.ts)
        'admin',
        'super admin',
        'neta technician',
        'lab technician',
        'office admin',
        'sales representative',
        'engineer',
        'operations manager',
        'hr rep',
        'scav',
        -- legacy / alternate spellings kept for existing accounts
        'manager',
        'supervisor',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'hr_manager',
        'hr_personnel'
      )
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'neta technician',
        'lab technician',
        'office admin',
        'sales representative',
        'engineer',
        'operations manager',
        'hr rep',
        'scav',
        'manager',
        'supervisor',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'hr_manager',
        'hr_personnel'
      )
    );
$$;

COMMENT ON FUNCTION common.is_employee_user() IS
  'True when the JWT belongs to staff: an employee email domain, an explicit '
  'employee account_type/user_type, or a staff role. Role list must stay in '
  'sync with src/lib/roles.ts. Gates ~66 RLS policies across common and neta_ops.';
