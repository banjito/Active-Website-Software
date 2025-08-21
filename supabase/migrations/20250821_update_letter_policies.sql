-- Ensure RLS is enabled (idempotent)
ALTER TABLE IF EXISTS business.letter_proposals ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users (unauthenticated) to INSERT letter proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'business' 
      AND tablename = 'letter_proposals' 
      AND policyname = 'Anonymous can insert letter proposals'
  ) THEN
    CREATE POLICY "Anonymous can insert letter proposals"
      ON business.letter_proposals
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- Allow anonymous users to SELECT letter proposals (e.g., reopen after saving)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'business' 
      AND tablename = 'letter_proposals' 
      AND policyname = 'Anonymous can select letter proposals'
  ) THEN
    CREATE POLICY "Anonymous can select letter proposals"
      ON business.letter_proposals
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- Allow anonymous users to UPDATE letter proposals (edit saved letters)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'business' 
      AND tablename = 'letter_proposals' 
      AND policyname = 'Anonymous can update letter proposals'
  ) THEN
    CREATE POLICY "Anonymous can update letter proposals"
      ON business.letter_proposals
      FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Grants for anon/authenticated
GRANT USAGE ON SCHEMA business TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business.letter_proposals TO anon, authenticated;

-- Allow anonymous users to DELETE saved letters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'business' 
      AND tablename = 'letter_proposals' 
      AND policyname = 'Anonymous can delete letter proposals'
  ) THEN
    CREATE POLICY "Anonymous can delete letter proposals"
      ON business.letter_proposals
      FOR DELETE
      TO anon
      USING (true);
  END IF;
END $$;

