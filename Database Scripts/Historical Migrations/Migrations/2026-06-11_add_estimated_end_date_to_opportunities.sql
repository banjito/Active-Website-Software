ALTER TABLE business.opportunities
ADD COLUMN IF NOT EXISTS estimated_end_date DATE;

COMMENT ON COLUMN business.opportunities.estimated_end_date IS
'Projected date when opportunity work is expected to end. Optional and paired with estimated_start_date when known.';

ALTER TABLE business.opportunities
DROP CONSTRAINT IF EXISTS opportunities_estimated_dates_order_check;

ALTER TABLE business.opportunities
ADD CONSTRAINT opportunities_estimated_dates_order_check
CHECK (
  estimated_start_date IS NULL
  OR estimated_end_date IS NULL
  OR estimated_end_date >= estimated_start_date
);
