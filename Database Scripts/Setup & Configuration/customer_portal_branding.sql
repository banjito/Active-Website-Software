-- Customer Portal: company logo + brand color customization
-- Run in the Supabase SQL Editor after customer_portal_security.sql.
-- Re-runnable (idempotent).
--
-- Adds customer-owned brand fields, a public logo bucket, and scoped RPCs so a
-- customer portal user can only update their own company's branding.

-- =========================================================================
-- DATA MODEL
-- =========================================================================

ALTER TABLE common.customers
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_primary text;

COMMENT ON COLUMN common.customers.logo_url IS
  'Public URL of the customer portal company logo uploaded to customer-brand-assets.';

COMMENT ON COLUMN common.customers.brand_primary IS
  'Customer portal primary color override as #RRGGBB.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_brand_primary_hex'
      AND conrelid = 'common.customers'::regclass
  ) THEN
    ALTER TABLE common.customers
      ADD CONSTRAINT customers_brand_primary_hex
      CHECK (brand_primary IS NULL OR brand_primary ~* '^#[0-9a-f]{6}$');
  END IF;
END $$;

-- =========================================================================
-- STORAGE
-- =========================================================================

-- Public because logos are displayed directly in the customer portal header.
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-brand-assets', 'customer-brand-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view customer brand assets" ON storage.objects;
CREATE POLICY "Public can view customer brand assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'customer-brand-assets');

DROP POLICY IF EXISTS "Customers upload own brand assets" ON storage.objects;
CREATE POLICY "Customers upload own brand assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-brand-assets'
  AND (storage.foldername(name))[1] = common.current_customer_id()::text
  AND lower(name) ~ '\.(png|svg)$'
);

DROP POLICY IF EXISTS "Customers update own brand assets" ON storage.objects;
CREATE POLICY "Customers update own brand assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'customer-brand-assets'
  AND (storage.foldername(name))[1] = common.current_customer_id()::text
)
WITH CHECK (
  bucket_id = 'customer-brand-assets'
  AND (storage.foldername(name))[1] = common.current_customer_id()::text
  AND lower(name) ~ '\.(png|svg)$'
);

DROP POLICY IF EXISTS "Customers delete own brand assets" ON storage.objects;
CREATE POLICY "Customers delete own brand assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-brand-assets'
  AND (storage.foldername(name))[1] = common.current_customer_id()::text
);

DROP POLICY IF EXISTS "Employees manage customer brand assets" ON storage.objects;
CREATE POLICY "Employees manage customer brand assets"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'customer-brand-assets' AND common.is_employee_user())
WITH CHECK (bucket_id = 'customer-brand-assets' AND common.is_employee_user());

-- =========================================================================
-- READS
-- =========================================================================

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

-- =========================================================================
-- WRITES
-- =========================================================================

CREATE OR REPLACE FUNCTION common.customer_update_branding(
  p_logo_url text,
  p_brand_primary text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_id uuid := common.current_customer_id();
  v_logo_url text := nullif(btrim(p_logo_url), '');
  v_brand_primary text := upper(nullif(btrim(p_brand_primary), ''));
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not a customer account';
  END IF;

  IF v_brand_primary IS NOT NULL AND v_brand_primary !~* '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'Primary brand color must be a hex color like #FF6400';
  END IF;

  UPDATE common.customers
     SET logo_url = v_logo_url,
         brand_primary = v_brand_primary
   WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
END;
$$;

-- =========================================================================
-- GRANTS
-- =========================================================================

GRANT EXECUTE ON FUNCTION common.customer_company() TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_update_branding(text, text) TO authenticated;
