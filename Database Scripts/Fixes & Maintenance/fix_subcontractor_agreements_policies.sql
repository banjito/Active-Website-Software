-- Fix RLS policies for subcontractor_agreements table
-- Run this in your Supabase SQL editor

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to access subcontractor agreements" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON business.subcontractor_agreements;

-- Create simple permissive policies
CREATE POLICY "Enable all access for authenticated users" ON business.subcontractor_agreements
  FOR ALL USING (auth.role() = 'authenticated');
