-- Allow SVG uploads in the user-uploads bucket (used by the admin Website
-- Theme page for logo uploads). Idempotent.
UPDATE storage.buckets
SET allowed_mime_types = (
    SELECT array_agg(DISTINCT t)
    FROM unnest(allowed_mime_types || ARRAY['image/svg+xml']) AS t
)
WHERE id = 'user-uploads';
