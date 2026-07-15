-- Storage buckets and their security policies, exported from the AMP
-- production instance on 2026-07-14. Idempotent bucket creation.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('community-media', 'community-media', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('customer-assets', 'customer-assets', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('customer-brand-assets', 'customer-brand-assets', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('customer-reports', 'customer-reports', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('documents', 'documents', true, 52428800, '{application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/gif,text/plain,text/csv}') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('employee-documents', 'employee-documents', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('equipment-certificates', 'equipment-certificates', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('help-center-documents', 'help-center-documents', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('job-documents', 'job-documents', true, 52428800, '{application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/gif,text/plain}') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('one-line-drawings', 'one-line-drawings', true, 104857600, '{application/pdf,image/jpeg,image/png,image/gif,image/tiff,image/bmp,application/vnd.ms-visio,application/x-autocad,image/vnd.dwg,image/vnd.dxf}') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('resumes', 'resumes', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('subcontractor-agreements', 'subcontractor-agreements', true, 10485760, '{application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('user-uploads', 'user-uploads', true, 10485760, '{image/gif,image/jpeg,image/png,image/svg+xml,image/webp}') ON CONFLICT (id) DO NOTHING;

-- ── Policies on storage.objects ──

CREATE POLICY "Allow all operations for authenticated users" ON storage.objects FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Allow authenticated uploads to job-documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'job-documents'::text));

CREATE POLICY "Allow authenticated users full access" ON storage.objects FOR ALL TO public USING (((bucket_id = 'user-uploads'::text) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((bucket_id = 'user-uploads'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Allow public read access" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'user-uploads'::text));

CREATE POLICY "Allow public read from job-documents" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'job-documents'::text));

CREATE POLICY "Assets are publicly accessible" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'assets'::text));

CREATE POLICY "Authenticated users can delete certificates" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'equipment-certificates'::text));

CREATE POLICY "Authenticated users can delete employee documents" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'employee-documents'::text));

CREATE POLICY "Authenticated users can delete help center documents" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'help-center-documents'::text));

CREATE POLICY "Authenticated users can delete job documents" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'job-documents'::text));

CREATE POLICY "Authenticated users can delete subcontractor agreements" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'subcontractor-agreements'::text));

CREATE POLICY "Authenticated users can update certificates" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'equipment-certificates'::text)) WITH CHECK ((bucket_id = 'equipment-certificates'::text));

CREATE POLICY "Authenticated users can update employee documents" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'employee-documents'::text)) WITH CHECK ((bucket_id = 'employee-documents'::text));

CREATE POLICY "Authenticated users can update help center documents" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'help-center-documents'::text)) WITH CHECK ((bucket_id = 'help-center-documents'::text));

CREATE POLICY "Authenticated users can update job documents" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'job-documents'::text));

CREATE POLICY "Authenticated users can update subcontractor agreements" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'subcontractor-agreements'::text));

CREATE POLICY "Authenticated users can upload certificates" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'equipment-certificates'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));

CREATE POLICY "Authenticated users can upload employee documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'employee-documents'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));

CREATE POLICY "Authenticated users can upload help center documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'help-center-documents'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));

CREATE POLICY "Authenticated users can upload job documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'job-documents'::text));

CREATE POLICY "Authenticated users can upload subcontractor agreements" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'subcontractor-agreements'::text));

CREATE POLICY "Authenticated users can view certificates" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'equipment-certificates'::text));

CREATE POLICY "Authenticated users can view employee documents" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'employee-documents'::text));

CREATE POLICY "Authenticated users can view help center documents" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'help-center-documents'::text));

CREATE POLICY "Authenticated users can view job documents" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'job-documents'::text));

CREATE POLICY "Authenticated users can view subcontractor agreements" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'subcontractor-agreements'::text));

CREATE POLICY "Customers delete own brand assets" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'customer-brand-assets'::text) AND ((storage.foldername(name))[1] = (common.current_customer_id())::text)));

CREATE POLICY "Customers update own brand assets" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'customer-brand-assets'::text) AND ((storage.foldername(name))[1] = (common.current_customer_id())::text))) WITH CHECK (((bucket_id = 'customer-brand-assets'::text) AND ((storage.foldername(name))[1] = (common.current_customer_id())::text) AND (lower(name) ~ '\.(png|svg)$'::text)));

CREATE POLICY "Customers upload own brand assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'customer-brand-assets'::text) AND ((storage.foldername(name))[1] = (common.current_customer_id())::text) AND (lower(name) ~ '\.(png|svg)$'::text)));

CREATE POLICY "Employees manage customer brand assets" ON storage.objects FOR ALL TO authenticated USING (((bucket_id = 'customer-brand-assets'::text) AND common.is_employee_user())) WITH CHECK (((bucket_id = 'customer-brand-assets'::text) AND common.is_employee_user()));

CREATE POLICY "Employees manage customer-reports objects" ON storage.objects FOR ALL TO authenticated USING (((bucket_id = 'customer-reports'::text) AND common.is_employee_user())) WITH CHECK (((bucket_id = 'customer-reports'::text) AND common.is_employee_user()));

CREATE POLICY "Public can view customer brand assets" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'customer-brand-assets'::text));

CREATE POLICY customer_assets_delete ON storage.objects FOR DELETE TO public USING ((bucket_id = 'customer-assets'::text));

CREATE POLICY customer_assets_insert ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'customer-assets'::text));

CREATE POLICY customer_assets_select ON storage.objects FOR SELECT TO public USING ((bucket_id = 'customer-assets'::text));

CREATE POLICY customer_assets_update ON storage.objects FOR UPDATE TO public USING ((bucket_id = 'customer-assets'::text)) WITH CHECK ((bucket_id = 'customer-assets'::text));

CREATE POLICY documents_delete ON storage.objects FOR DELETE TO public USING (((bucket_id = 'documents'::text) AND (auth.uid() = owner)));

CREATE POLICY documents_delete_authenticated ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND (auth.uid() = owner)));

CREATE POLICY documents_insert ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'documents'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY documents_insert_authenticated ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'documents'::text));

CREATE POLICY documents_select ON storage.objects FOR SELECT TO public USING (((bucket_id = 'documents'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY documents_select_authenticated ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'documents'::text));

CREATE POLICY documents_select_public_issues ON storage.objects FOR SELECT TO public USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = 'issues'::text)));

CREATE POLICY documents_update ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'documents'::text) AND (auth.uid() = owner)));

CREATE POLICY documents_update_authenticated ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'documents'::text) AND (auth.uid() = owner)));

CREATE POLICY job_documents_delete ON storage.objects FOR DELETE TO public USING (((bucket_id = 'job-documents'::text) AND (auth.uid() = owner)));

CREATE POLICY job_documents_insert ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'job-documents'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY job_documents_select ON storage.objects FOR SELECT TO public USING (((bucket_id = 'job-documents'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY job_documents_update ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'job-documents'::text) AND (auth.uid() = owner)));

CREATE POLICY one_line_drawings_delete ON storage.objects FOR DELETE TO public USING (((bucket_id = 'one-line-drawings'::text) AND (auth.uid() = owner)));

CREATE POLICY one_line_drawings_insert ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'one-line-drawings'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY one_line_drawings_select ON storage.objects FOR SELECT TO public USING (((bucket_id = 'one-line-drawings'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY one_line_drawings_update ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'one-line-drawings'::text) AND (auth.uid() = owner)));

CREATE POLICY resumes_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'resumes'::text));

CREATE POLICY resumes_insert ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'resumes'::text));

CREATE POLICY resumes_select ON storage.objects FOR SELECT TO public USING ((bucket_id = 'resumes'::text));

CREATE POLICY resumes_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'resumes'::text)) WITH CHECK ((bucket_id = 'resumes'::text));

CREATE POLICY user_uploads_delete ON storage.objects FOR DELETE TO public USING (((bucket_id = 'user-uploads'::text) AND (auth.uid() = owner)));

CREATE POLICY user_uploads_insert ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'user-uploads'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY user_uploads_select ON storage.objects FOR SELECT TO public USING (((bucket_id = 'user-uploads'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY user_uploads_update ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'user-uploads'::text) AND (auth.uid() = owner)));
