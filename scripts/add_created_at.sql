
-- Adding created_at columns for precise second-wise sorting
ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE docs_journal_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill created_at from updated_at if it's currently null
UPDATE docs_journals SET created_at = updated_at WHERE created_at IS NULL;
UPDATE docs_journal_lines SET created_at = updated_at WHERE created_at IS NULL;
