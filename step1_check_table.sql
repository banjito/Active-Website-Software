-- Step 1: Check if the table exists
-- Run this in your Supabase SQL editor

SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'business' 
   AND table_name = 'subcontractor_agreements'
);
