-- Add a flag so revised/duplicate quotes can be excluded from the
-- Bids Overview "total quoted amount" without deleting the opportunity.
ALTER TABLE business.opportunities
  ADD COLUMN IF NOT EXISTS exclude_from_quoted_total BOOLEAN NOT NULL DEFAULT FALSE;
