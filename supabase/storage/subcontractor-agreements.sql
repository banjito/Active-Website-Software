-- Create storage bucket for subcontractor agreements
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'subcontractor-agreements',
  'subcontractor-agreements',
  true,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for subcontractor agreements bucket
CREATE POLICY "Authenticated users can upload subcontractor agreements"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'subcontractor-agreements');

CREATE POLICY "Authenticated users can view subcontractor agreements"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'subcontractor-agreements');

CREATE POLICY "Authenticated users can update subcontractor agreements"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'subcontractor-agreements');

CREATE POLICY "Authenticated users can delete subcontractor agreements"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'subcontractor-agreements'); 