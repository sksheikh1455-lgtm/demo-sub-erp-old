-- scripts/cleanup_cartesian_duplicates.sql
BEGIN;

-- 1. Temporarily DISABLE the strict append-only trigger to allow for administrative data patching
ALTER TABLE docs_journal_lines DISABLE TRIGGER prevent_any_deletion_on_journal_lines;

-- Also disable double-entry check momentarily to avoid mid-deletion balance assertion errors
ALTER TABLE docs_journal_lines DISABLE TRIGGER trg_strict_double_entry_check;

-- 2 & 3. Identify and delete exact duplicate lines using CTE with ROW_NUMBER()
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER(
               PARTITION BY journal_id, account_id, debit, credit 
               ORDER BY updated_at ASC, id ASC
           ) as row_num
    FROM docs_journal_lines
)
DELETE FROM docs_journal_lines
WHERE id IN (
    SELECT id FROM duplicates WHERE row_num > 1
);

-- 4. RE-ENABLE the triggers to restore full immutability and continuous integrity checks
ALTER TABLE docs_journal_lines ENABLE TRIGGER prevent_any_deletion_on_journal_lines;
ALTER TABLE docs_journal_lines ENABLE TRIGGER trg_strict_double_entry_check;

COMMIT;
