-- Many-to-many: one onboarding tracking record can have multiple assigned packets.
-- Fixes "can't assign" (was blocking after first) and allows multiple packets per employee.

CREATE TABLE IF NOT EXISTS common.onboarding_tracking_packets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    packet_id UUID NOT NULL REFERENCES common.new_hire_packets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, packet_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_packets_tracking_id ON common.onboarding_tracking_packets(tracking_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_packets_packet_id ON common.onboarding_tracking_packets(packet_id);

ALTER TABLE common.onboarding_tracking_packets DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_packets TO authenticated;
GRANT ALL ON common.onboarding_tracking_packets TO anon;

COMMENT ON TABLE common.onboarding_tracking_packets IS 'Assigned New Hire Packets per onboarding tracking record; supports multiple packets per person';

-- Backfill: existing new_hire_packet_id becomes first row in join table so UI sees it
INSERT INTO common.onboarding_tracking_packets (tracking_id, packet_id)
SELECT id, new_hire_packet_id
  FROM common.onboarding_tracking
 WHERE new_hire_packet_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM common.onboarding_tracking_packets otp
     WHERE otp.tracking_id = onboarding_tracking.id AND otp.packet_id = onboarding_tracking.new_hire_packet_id
   );
