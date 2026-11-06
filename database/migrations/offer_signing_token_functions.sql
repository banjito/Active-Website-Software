-- Step 1 of 2: safe doors for the public offer signing page.
--
-- Problem: common.offers, common.e_signatures, common.offer_attachments and the
-- two onboarding e-sign tables have no row-level security, and the bootstrap
-- schema grants them to anon (the public key that ships in the website's
-- JavaScript). Anyone with that key can read every offer (pay, signing links)
-- and change or delete them.
--
-- The public page /sign-offer/:token reads and writes these tables straight
-- from the browser as anon, so we can't lock the tables until that page stops.
-- These three functions give the page a narrow, token-checked way in:
--
--   get_offer_for_signing(token)   -> the offer fields the page shows, or null
--   sign_offer_by_token(...)       -> records the candidate's signature
--   decline_offer_by_token(token)  -> marks the offer declined
--
-- They run as the table owner (SECURITY DEFINER) so they keep working after
-- step 2 locks the tables. Each one only touches the single offer whose
-- signing_token matches exactly.
--
-- Safe to run anytime, and more than once. Nothing changes for logged-in users.
-- Step 2 is enable_rls_offers_e_sign.sql: run it only after the app update that
-- uses these functions is live.

-- Expiry rule: the link works through the whole expiration date, ending when
-- that date is over everywhere on earth (UTC-12). Same idea as the old
-- browser-side check, without depending on the visitor's clock.
CREATE OR REPLACE FUNCTION common.offer_link_expired(p_expiration date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_expiration IS NOT NULL
     AND now() > ((p_expiration + 1)::timestamp AT TIME ZONE 'Etc/GMT+12');
$$;

CREATE OR REPLACE FUNCTION common.get_offer_for_signing(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer common.offers%ROWTYPE;
  v_candidate jsonb;
  v_attachments jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_offer FROM common.offers WHERE signing_token = p_token;
  IF NOT FOUND OR v_offer.status IN ('withdrawn', 'expired') THEN
    RETURN NULL;
  END IF;

  IF v_offer.status NOT IN ('accepted', 'declined')
     AND common.offer_link_expired(v_offer.expiration_date) THEN
    UPDATE common.offers
       SET status = 'expired', updated_at = now()
     WHERE id = v_offer.id;
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'first_name', c.first_name,
           'last_name', c.last_name,
           'email', c.email,
           'position_applied', c.position_applied)
    INTO v_candidate
    FROM common.candidates c
   WHERE c.id = v_offer.candidate_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'file_url', a.file_url)
           ORDER BY a.created_at), '[]'::jsonb)
    INTO v_attachments
    FROM common.offer_attachments a
   WHERE a.offer_id = v_offer.id;

  -- Only what the signing page needs. No signing_token, created_by,
  -- custom_fields, approval data or stored signature.
  RETURN jsonb_build_object(
    'id', v_offer.id,
    'position_title', v_offer.position_title,
    'department', v_offer.department,
    'employment_type', v_offer.employment_type,
    'start_date', v_offer.start_date,
    'location', v_offer.location,
    'reporting_manager', v_offer.reporting_manager,
    'base_salary', v_offer.base_salary,
    'salary_currency', v_offer.salary_currency,
    'pay_frequency', v_offer.pay_frequency,
    'bonus_amount', v_offer.bonus_amount,
    'bonus_description', v_offer.bonus_description,
    'equity_compensation', v_offer.equity_compensation,
    'benefits_summary', v_offer.benefits_summary,
    'status', v_offer.status,
    'offer_letter_content', v_offer.offer_letter_content,
    'offer_date', v_offer.offer_date,
    'expiration_date', v_offer.expiration_date,
    'signature_status', v_offer.signature_status,
    'signed_at', v_offer.signed_at,
    'candidate', v_candidate,
    'attachments', v_attachments
  );
END;
$$;

CREATE OR REPLACE FUNCTION common.sign_offer_by_token(
  p_token text,
  p_signer_name text,
  p_signer_email text,
  p_signature_image text,
  p_user_agent text DEFAULT NULL,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer common.offers%ROWTYPE;
  v_now timestamptz := now();
  v_ip text;
  v_sig_data jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RAISE EXCEPTION 'This signing link is not valid.';
  END IF;

  -- Lock the row so a double-click can't sign twice.
  SELECT * INTO v_offer
    FROM common.offers
   WHERE signing_token = p_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This signing link is not valid.';
  END IF;

  IF v_offer.signature_status = 'signed' OR v_offer.status = 'accepted' THEN
    RAISE EXCEPTION 'This offer has already been signed.';
  END IF;
  IF v_offer.status IN ('declined', 'withdrawn', 'expired') THEN
    RAISE EXCEPTION 'This offer is no longer open for signing.';
  END IF;
  IF common.offer_link_expired(v_offer.expiration_date) THEN
    UPDATE common.offers SET status = 'expired', updated_at = v_now
     WHERE id = v_offer.id;
    RAISE EXCEPTION 'This offer has expired.';
  END IF;

  IF coalesce(btrim(p_signer_name), '') = ''
     OR coalesce(btrim(p_signer_email), '') = ''
     OR coalesce(p_signature_image, '') NOT LIKE 'data:image/%' THEN
    RAISE EXCEPTION 'Name, email and a drawn signature are required.';
  END IF;
  -- A drawn signature PNG is well under this; blocks oversized junk.
  IF length(p_signature_image) > 2000000 THEN
    RAISE EXCEPTION 'Signature image is too large.';
  END IF;

  -- Prefer the IP the server saw over what the browser reports.
  v_ip := nullif(btrim(split_part(
            coalesce(nullif(current_setting('request.headers', true), '')::jsonb
                       ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_ip := left(coalesce(v_ip, nullif(btrim(p_client_ip), ''), 'N/A'), 45);

  v_sig_data := jsonb_build_object(
    'signedAt', v_now,
    'signerType', 'candidate',
    'ipAddress', v_ip,
    'userAgent', p_user_agent);

  INSERT INTO common.e_signatures (
    offer_id, signer_type, signer_id, signer_email, signer_name,
    signature_image, signature_data, ip_address, user_agent, signed_at)
  VALUES (
    v_offer.id, 'candidate', v_offer.candidate_id,
    left(btrim(p_signer_email), 255), left(btrim(p_signer_name), 255),
    p_signature_image, v_sig_data, v_ip, p_user_agent, v_now);

  UPDATE common.offers
     SET signature_status = 'signed',
         signed_at = v_now,
         signature_data = v_sig_data,
         status = 'accepted',
         accepted_date = v_now,
         updated_at = v_now
   WHERE id = v_offer.id;

  -- Same as the app did before: move the candidate to "Offer Accepted".
  -- Never let this block the signature itself.
  BEGIN
    UPDATE common.candidates
       SET status = 'offer_accepted',
           last_contact_date = v_now,
           updated_at = v_now
     WHERE id = v_offer.candidate_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sign_offer_by_token: candidate status not updated: %', SQLERRM;
  END;

  RETURN jsonb_build_object('signed', true, 'signed_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION common.decline_offer_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer common.offers%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RAISE EXCEPTION 'This signing link is not valid.';
  END IF;

  SELECT * INTO v_offer
    FROM common.offers
   WHERE signing_token = p_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This signing link is not valid.';
  END IF;

  IF v_offer.signature_status = 'signed'
     OR v_offer.status IN ('accepted', 'declined', 'withdrawn', 'expired') THEN
    RAISE EXCEPTION 'This offer is no longer open.';
  END IF;

  UPDATE common.offers
     SET status = 'declined',
         declined_date = now(),
         updated_at = now()
   WHERE id = v_offer.id;

  RETURN jsonb_build_object('declined', true);
END;
$$;

REVOKE ALL ON FUNCTION common.offer_link_expired(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION common.get_offer_for_signing(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION common.sign_offer_by_token(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION common.decline_offer_by_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION common.offer_link_expired(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.get_offer_for_signing(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.sign_offer_by_token(text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.decline_offer_by_token(text) TO anon, authenticated, service_role;

-- PostgREST caches the function list; tell it to reload.
NOTIFY pgrst, 'reload schema';
