-- Customer Portal: let a signed-in customer VIEW and EDIT their own company
-- (common.customers) and that company's contacts (common.contacts).
--
-- Design (mirrors common.customer_report_assets): everything goes through
-- SECURITY DEFINER functions scoped to common.current_customer_id() — the company
-- the signed-in portal user is linked to via common.customer_users. This means:
--   * The existing security on common.customers / common.contacts is NOT touched,
--     so the staff app is unaffected.
--   * A customer can only ever read/write their OWN company and contacts.
--   * Reads return a whitelist of columns (no internal fields leak).
--   * Writes touch a whitelist of columns (customers can't change billing/workflow
--     fields like `status`, and can't reach another company's rows).
--
-- Run in the Supabase SQL Editor. Re-runnable (idempotent).

ALTER TABLE common.customers
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_primary text;

-- =========================================================================
-- READS
-- =========================================================================

-- The signed-in customer's own company (safe columns only).
-- Changing a RETURNS TABLE signature requires dropping the existing function.
DROP FUNCTION IF EXISTS common.customer_company();

CREATE FUNCTION common.customer_company()
RETURNS TABLE (
  id uuid,
  name text,
  company_name text,
  address text,
  phone text,
  email text,
  status text,
  logo_url text,
  brand_primary text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT c.id,
         c.name::text,
         c.company_name::text,
         c.address::text,
         c.phone::text,
         c.email::text,
         c.status::text,
         c.logo_url::text,
         c.brand_primary::text
  FROM common.customers c
  WHERE c.id = common.current_customer_id()
  LIMIT 1;
$$;

-- The signed-in customer's company contacts (safe columns only), primary first.
CREATE OR REPLACE FUNCTION common.customer_contacts()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  "position" text,
  is_primary boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT ct.id,
         ct.first_name::text,
         ct.last_name::text,
         ct.email::text,
         ct.phone::text,
         ct.position::text,
         ct.is_primary
  FROM common.contacts ct
  WHERE ct.customer_id = common.current_customer_id()
  ORDER BY ct.is_primary DESC NULLS LAST, ct.first_name NULLS LAST;
$$;

-- =========================================================================
-- WRITES (column-whitelisted, scoped to the caller's own company)
-- =========================================================================

CREATE OR REPLACE FUNCTION common.customer_update_company(
  p_company_name text,
  p_address text,
  p_phone text,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_id uuid := common.current_customer_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not a customer account';
  END IF;

  UPDATE common.customers
     SET company_name = p_company_name,
         address      = p_address,
         phone        = p_phone,
         email        = p_email
   WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION common.customer_upsert_contact(
  p_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_position text,
  p_is_primary boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_id uuid := common.current_customer_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not a customer account';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO common.contacts
      (customer_id, first_name, last_name, email, phone, position, is_primary)
    VALUES
      (v_id, p_first_name, p_last_name, p_email, p_phone, p_position, COALESCE(p_is_primary, false));
  ELSE
    UPDATE common.contacts
       SET first_name = p_first_name,
           last_name  = p_last_name,
           email      = p_email,
           phone      = p_phone,
           position   = p_position,
           is_primary = COALESCE(p_is_primary, is_primary)
     WHERE id = p_id
       AND customer_id = v_id;            -- can only touch own company's contacts

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contact not found for this company';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION common.customer_delete_contact(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_id uuid := common.current_customer_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not a customer account';
  END IF;

  DELETE FROM common.contacts
   WHERE id = p_id
     AND customer_id = v_id;
END;
$$;

-- =========================================================================
-- GRANTS
-- =========================================================================
GRANT EXECUTE ON FUNCTION common.customer_company() TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_update_company(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_upsert_contact(uuid, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_delete_contact(uuid) TO authenticated;
