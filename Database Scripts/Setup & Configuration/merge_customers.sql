-- Customer merge: consolidate duplicate customers into one "primary" record.
-- Run in the Supabase SQL Editor. Re-runnable (idempotent).
--
-- Picks one customer to keep and folds the duplicates into it: every row in
-- every table that points at a duplicate customer (contacts, jobs, opportunities,
-- interactions, notes, documents, surveys, ...) is repointed to the primary, the
-- primary's empty fields are backfilled from the duplicates, then the duplicate
-- customer rows are deleted. All in one transaction — if anything fails, nothing
-- changes.
--
-- The list of tables to repoint is read from the database's own foreign keys, so
-- new tables that reference common.customers are handled automatically without
-- editing this function.

-- Drop the older 2-argument version (if a previous run created it) so the
-- 3-argument version below is the only one.
DROP FUNCTION IF EXISTS common.merge_customers(uuid, uuid[]);

CREATE OR REPLACE FUNCTION common.merge_customers(
  p_primary_id uuid,
  p_duplicate_ids uuid[],
  p_company_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  fk      record;
  v_dupes uuid[];
  v_name  text := nullif(btrim(p_company_name), '');
BEGIN
  -- Only employees (ampOS staff) may merge customers.
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized to merge customers';
  END IF;

  IF p_primary_id IS NULL THEN
    RAISE EXCEPTION 'A primary customer is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM common.customers WHERE id = p_primary_id) THEN
    RAISE EXCEPTION 'Primary customer not found';
  END IF;

  -- Clean the duplicate list: drop nulls, dedupe, and never fold the primary
  -- into itself.
  v_dupes := ARRAY(
    SELECT DISTINCT d
    FROM unnest(p_duplicate_ids) AS d
    WHERE d IS NOT NULL AND d <> p_primary_id
  );

  IF array_length(v_dupes, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one other customer to merge';
  END IF;

  -- Pass A: repoint every DECLARED foreign key that references
  -- common.customers(id) from the duplicates to the primary. This covers links
  -- whose column may not be named "customer_id". Single-column FKs only.
  FOR fk IN
    SELECT
      con.conrelid::regclass AS child_table,
      att.attname            AS child_column
    FROM pg_constraint con
    JOIN pg_class      refcl ON refcl.oid = con.confrelid
    JOIN pg_namespace  refns ON refns.oid = refcl.relnamespace
    JOIN pg_attribute  att   ON att.attrelid = con.conrelid
                            AND att.attnum   = con.conkey[1]
    JOIN pg_attribute  refatt ON refatt.attrelid = con.confrelid
                             AND refatt.attnum    = con.confkey[1]
    WHERE con.contype = 'f'
      AND refns.nspname = 'common'
      AND refcl.relname = 'customers'
      AND refatt.attname = 'id'
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'UPDATE %s SET %I = $1 WHERE %I = ANY($2)',
      fk.child_table, fk.child_column, fk.child_column
    ) USING p_primary_id, v_dupes;
  END LOOP;

  -- Pass B: repoint columns literally named "customer_id" that have NO foreign
  -- key declared on them. These are convention-only links (e.g. jobs) that mean
  -- common.customers, so a merge can't leave them pointing at a deleted customer.
  --
  -- Columns that DO have a foreign key are deliberately skipped here: if the FK
  -- points at common.customers it was already handled in Pass A, and if it points
  -- at a different table (e.g. the retired lab's lab_customers) it is none of this
  -- merge's business and is left untouched. Idempotent with Pass A.
  FOR fk IN
    SELECT (quote_ident(ns.nspname) || '.' || quote_ident(cl.relname)) AS child_table,
           att.attname AS child_column
    FROM pg_attribute att
    JOIN pg_class     cl ON cl.oid = att.attrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE att.attname = 'customer_id'
      AND att.attnum > 0
      AND NOT att.attisdropped
      AND att.atttypid = 'uuid'::regtype
      AND cl.relkind IN ('r', 'p')           -- ordinary + partitioned tables
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND ns.nspname NOT LIKE 'pg_%'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.conrelid = att.attrelid
          AND att.attnum = ANY (con.conkey)
      )
  LOOP
    EXECUTE format(
      'UPDATE %s SET %I = $1 WHERE %I = ANY($2)',
      fk.child_table, fk.child_column, fk.child_column
    ) USING p_primary_id, v_dupes;
  END LOOP;

  -- Backfill the primary's empty fields from any duplicate that has a value.
  UPDATE common.customers p
  SET
    name          = COALESCE(p.name, d.name),
    company_name  = COALESCE(p.company_name, d.company_name),
    email         = COALESCE(p.email, d.email),
    phone         = COALESCE(p.phone, d.phone),
    address       = COALESCE(p.address, d.address),
    logo_url      = COALESCE(p.logo_url, d.logo_url),
    brand_primary = COALESCE(p.brand_primary, d.brand_primary)
  FROM (
    SELECT
      max(name)         AS name,
      max(company_name) AS company_name,
      max(email)        AS email,
      max(phone)        AS phone,
      max(address)      AS address,
      max(logo_url)     AS logo_url,
      max(brand_primary) AS brand_primary
    FROM common.customers
    WHERE id = ANY(v_dupes)
  ) d
  WHERE p.id = p_primary_id;

  -- Merge the division lists (union of primary + duplicates, no duplicates).
  UPDATE common.customers p
  SET divisions = (
    SELECT array_agg(DISTINCT x)
    FROM common.customers c, unnest(c.divisions) AS x
    WHERE c.id = p_primary_id OR c.id = ANY(v_dupes)
  )
  WHERE p.id = p_primary_id
    AND EXISTS (
      SELECT 1 FROM common.customers c, unnest(c.divisions) AS x
      WHERE c.id = ANY(v_dupes)
    );

  -- Apply the chosen merged name, if one was supplied. The "name" column mirrors
  -- company_name elsewhere in the app, so keep them in sync.
  IF v_name IS NOT NULL THEN
    UPDATE common.customers
       SET company_name = v_name,
           name = v_name
     WHERE id = p_primary_id;
  END IF;

  -- Remove the now-orphaned duplicate customer rows.
  DELETE FROM common.customers WHERE id = ANY(v_dupes);
END;
$$;

GRANT EXECUTE ON FUNCTION common.merge_customers(uuid, uuid[], text) TO authenticated;
