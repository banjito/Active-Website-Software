-- Offer attachments (e.g. benefit packages) sent with offer letters
-- Files are stored in Supabase Storage; this table holds metadata and URLs.

CREATE TABLE IF NOT EXISTS common.offer_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES common.offers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_attachments_offer_id ON common.offer_attachments(offer_id);

ALTER TABLE common.offer_attachments DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.offer_attachments TO authenticated;
GRANT ALL ON common.offer_attachments TO anon;

COMMENT ON TABLE common.offer_attachments IS 'Documents (e.g. benefit packages) attached to offers; candidates can download from the signing page';
