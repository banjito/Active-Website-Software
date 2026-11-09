-- Treat @armadillosafe.com accounts as staff (2026-11-09).
--
-- Adds '%@armadillosafe.com' to the domain list inside is_employee_user().
-- Finds the function in whatever schema it lives in and edits the LIVE
-- definition in place (no pasted copy), so later production changes are kept.
-- Safe to run twice: the second run changes nothing.
--
-- Matching app-side lists (keep all three in sync):
--   src/lib/companyConfig.ts                     allowedEmailDomains
--   supabase/functions/_shared/companyConfig.ts  COMPANY_EMPLOYEE_DOMAINS

DO $$
DECLARE
  r   record;
  def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.proname = 'is_employee_user'
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('%@armadillosafe.com' IN def) = 0
       AND position('''%@cedsi.com''' IN def) > 0 THEN
      EXECUTE replace(def, '''%@cedsi.com''', '''%@cedsi.com'', ''%@armadillosafe.com''');
    END IF;
  END LOOP;
END $$;

-- Result: every function or policy that hardcodes a staff email domain.
-- Good outcome: an is_employee_user row with has_armadillo = true.
-- No rows at all: wrong project. Any other row with false: send to Claude.
SELECT 'function' AS kind,
       n.nspname || '.' || p.proname AS name,
       p.prosrc ~* 'armadillosafe\.com' AS has_armadillo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ~* '(%|'')@(ampqes|cedsi)\.com'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'policy',
       schemaname || '.' || tablename || ' / ' || policyname,
       coalesce(qual, '') || coalesce(with_check, '') ~* 'armadillosafe\.com'
FROM pg_policies
WHERE coalesce(qual, '') || coalesce(with_check, '') ~* '(%|'')@(ampqes|cedsi)\.com'
ORDER BY 3, 2;
