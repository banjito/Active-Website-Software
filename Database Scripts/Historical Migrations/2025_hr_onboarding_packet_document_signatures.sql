-- Signatures for New Hire Packet documents (draw-in signature in viewer).
-- Records are visible in e-sign recordkeeping so HR knows which documents were signed.

CREATE TABLE IF NOT EXISTS common.onboarding_packet_document_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    packet_id UUID NOT NULL REFERENCES common.new_hire_packets(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    document_file_url TEXT,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    signature_image TEXT NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packet_doc_signatures_packet_id ON common.onboarding_packet_document_signatures(packet_id);
CREATE INDEX IF NOT EXISTS idx_packet_doc_signatures_signer_email ON common.onboarding_packet_document_signatures(signer_email);
CREATE INDEX IF NOT EXISTS idx_packet_doc_signatures_signed_at ON common.onboarding_packet_document_signatures(signed_at);

ALTER TABLE common.onboarding_packet_document_signatures DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_packet_document_signatures TO authenticated;
GRANT ALL ON common.onboarding_packet_document_signatures TO anon;

COMMENT ON TABLE common.onboarding_packet_document_signatures IS 'E-signatures for New Hire Packet documents; Sign and Send from document viewer';
