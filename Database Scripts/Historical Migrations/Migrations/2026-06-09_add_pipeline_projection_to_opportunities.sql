ALTER TABLE business.opportunities
ADD COLUMN IF NOT EXISTS in_pipeline_projection boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_opportunities_in_pipeline_projection
ON business.opportunities (in_pipeline_projection)
WHERE in_pipeline_projection = true;

COMMENT ON COLUMN business.opportunities.in_pipeline_projection IS
'Controls whether an opportunity appears in the Sales Pipeline Projection view.';
