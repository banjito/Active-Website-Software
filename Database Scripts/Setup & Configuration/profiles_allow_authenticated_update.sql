-- Disable RLS on common.profiles so profile updates (e.g. job_title) work.
-- Run after add_job_title_and_history.sql if profile updates still fail.

ALTER TABLE common.profiles DISABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON common.profiles TO authenticated;
