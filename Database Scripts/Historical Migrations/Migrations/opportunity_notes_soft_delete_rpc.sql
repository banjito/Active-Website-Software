-- RPC to soft-delete an opportunity note by id when the caller is the note owner.
-- Avoids 403 from RLS on direct PATCH when auth.uid() is not applied as expected.
-- Use: supabase.schema('business').rpc('soft_delete_opportunity_note', { note_id: '<uuid>' })

CREATE OR REPLACE FUNCTION business.soft_delete_opportunity_note(note_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business
AS $$
BEGIN
  UPDATE business.opportunity_notes
  SET deleted_at = NOW()
  WHERE id = note_id
    AND user_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION business.soft_delete_opportunity_note(UUID) IS
  'Soft-delete an opportunity note; only the note owner (user_id = auth.uid()) can delete.';

GRANT EXECUTE ON FUNCTION business.soft_delete_opportunity_note(UUID) TO authenticated;
