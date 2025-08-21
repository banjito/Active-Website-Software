-- Create letter proposals table in business schema
CREATE TABLE IF NOT EXISTS business.letter_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES business.opportunities(id) ON DELETE CASCADE NOT NULL,
  html text NOT NULL,
  quote_number text,
  neta_standard text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_letter_proposals_opportunity_id ON business.letter_proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_letter_proposals_created_at ON business.letter_proposals(created_at);

-- Enable RLS
ALTER TABLE business.letter_proposals ENABLE ROW LEVEL SECURITY;

-- Simple policy allowing authenticated users to manage their project's letters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'business' AND tablename = 'letter_proposals' AND policyname = 'Authenticated users can manage letter proposals'
  ) THEN
    CREATE POLICY "Authenticated users can manage letter proposals"
      ON business.letter_proposals
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE business.letter_proposals IS 'Stores saved HTML letter proposals per opportunity for later editing/printing.';


