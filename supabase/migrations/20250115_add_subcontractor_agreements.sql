-- Add subcontractor agreements field to opportunities table
ALTER TABLE business.opportunities ADD COLUMN IF NOT EXISTS subcontractor_agreements JSONB;

-- Add comment for documentation
COMMENT ON COLUMN business.opportunities.subcontractor_agreements IS 'JSON array storing subcontractor agreement files with metadata like name, file_url, upload_date, status, etc.';

-- Create index for better performance when querying subcontractor agreements
CREATE INDEX IF NOT EXISTS idx_opportunities_subcontractor_agreements ON business.opportunities USING GIN (subcontractor_agreements); 