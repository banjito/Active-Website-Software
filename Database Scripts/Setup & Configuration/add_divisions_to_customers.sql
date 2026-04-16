-- Add divisions column to common.customers table
-- This enables filtering customers by division (NETA, Scavenger, Armadillo, Engineering)

ALTER TABLE common.customers
ADD COLUMN IF NOT EXISTS divisions text[] DEFAULT NULL;

-- Create a GIN index for efficient array overlap queries
CREATE INDEX IF NOT EXISTS idx_customers_divisions ON common.customers USING GIN (divisions);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'common' AND table_name = 'customers' AND column_name = 'divisions';
