-- Create the job-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-documents', 'job-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the bucket
UPDATE storage.buckets 
SET public = true 
WHERE id = 'job-documents';

-- Create storage policies for job-documents bucket
CREATE POLICY "Users can view job documents for jobs they have access to" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'job-documents' 
        AND (
            -- Allow if user has access to the job (extract job_id from path)
            EXISTS (
                SELECT 1 FROM neta_ops.jobs j
                WHERE j.id::text = split_part(name, '/', 2)
                AND (
                    j.user_id = auth.uid()
                    OR EXISTS (
                        SELECT 1 FROM neta_ops.job_assignments ja
                        WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                    )
                )
            )
            -- Or if it's a public document
            OR name LIKE 'public/%'
        )
    );

CREATE POLICY "Users can upload job documents for jobs they have access to" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'job-documents' 
        AND (
            -- Allow if user has access to the job (extract job_id from path)
            EXISTS (
                SELECT 1 FROM neta_ops.jobs j
                WHERE j.id::text = split_part(name, '/', 2)
                AND (
                    j.user_id = auth.uid()
                    OR EXISTS (
                        SELECT 1 FROM neta_ops.job_assignments ja
                        WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                    )
                )
            )
            -- Or if it's a public document
            OR name LIKE 'public/%'
        )
    );

CREATE POLICY "Users can update their own uploaded documents" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'job-documents' 
        AND owner = auth.uid()
    );

CREATE POLICY "Users can delete their own uploaded documents" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'job-documents' 
        AND owner = auth.uid()
    ); 