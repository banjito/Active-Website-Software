-- Record why an opportunity was lost. The app asks for a reason whenever
-- an opportunity is set to "lost". Older lost rows stay blank.
-- No "lost needs a reason" check: it would block every later edit of those older rows.
SET lock_timeout = '5s';

ALTER TABLE business.opportunities
  ADD COLUMN IF NOT EXISTS lost_reason_category TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_by UUID;

NOTIFY pgrst, 'reload schema';
