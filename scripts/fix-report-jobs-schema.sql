-- Fix for Report Jobs table schema
ALTER TABLE docs_report_jobs ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE docs_report_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE docs_report_jobs ADD COLUMN IF NOT EXISTS result_data JSONB;

-- Ensure RLS is disabled since report jobs are managed by server-side processes operating under public/anon role
ALTER TABLE docs_report_jobs DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Report Job Company Isolation" ON docs_report_jobs;
