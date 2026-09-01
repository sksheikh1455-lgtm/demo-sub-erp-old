import fs from 'fs';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

const sql = `
-- 1. Create a generic trigger function to prevent deletion
CREATE OR REPLACE FUNCTION prevent_deletion_audit()
RETURNS trigger AS $$
DECLARE
    v_journal_status TEXT;
BEGIN
    IF TG_TABLE_NAME = 'docs_journal_lines' THEN
        IF OLD.journal_id IS NOT NULL THEN
            SELECT status INTO v_journal_status FROM docs_journals WHERE id = OLD.journal_id;
            IF v_journal_status = 'DRAFT' THEN
                RETURN OLD;
            END IF;
        END IF;
    END IF;

    RAISE EXCEPTION 'Deletion from table % is strictly prohibited to maintain an append-only audit trail.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply triggers to core tables
DROP TRIGGER IF EXISTS prevent_del_docs_invoices ON docs_invoices;
CREATE TRIGGER prevent_del_docs_invoices BEFORE DELETE ON docs_invoices FOR EACH ROW EXECUTE FUNCTION prevent_deletion_audit();

DROP TRIGGER IF EXISTS prevent_del_docs_journals ON docs_journals;
CREATE TRIGGER prevent_del_docs_journals BEFORE DELETE ON docs_journals FOR EACH ROW EXECUTE FUNCTION prevent_deletion_audit();

DROP TRIGGER IF EXISTS prevent_del_docs_journal_lines ON docs_journal_lines;
CREATE TRIGGER prevent_del_docs_journal_lines BEFORE DELETE ON docs_journal_lines FOR EACH ROW EXECUTE FUNCTION prevent_deletion_audit();

DROP TRIGGER IF EXISTS prevent_del_docs_credit_notes ON docs_credit_notes;
CREATE TRIGGER prevent_del_docs_credit_notes BEFORE DELETE ON docs_credit_notes FOR EACH ROW EXECUTE FUNCTION prevent_deletion_audit();

DROP TRIGGER IF EXISTS prevent_del_docs_payments ON docs_payments;
CREATE TRIGGER prevent_del_docs_payments BEFORE DELETE ON docs_payments FOR EACH ROW EXECUTE FUNCTION prevent_deletion_audit();


-- 3. Enforce via RLS (Restrictive Policies)
-- Invoices
DROP POLICY IF EXISTS "append_only_block_delete" ON docs_invoices;
CREATE POLICY "append_only_block_delete" ON docs_invoices AS RESTRICTIVE FOR DELETE USING (false);

-- Journals
DROP POLICY IF EXISTS "append_only_block_delete" ON docs_journals;
CREATE POLICY "append_only_block_delete" ON docs_journals AS RESTRICTIVE FOR DELETE USING (false);

-- Journal Lines
DROP POLICY IF EXISTS "append_only_block_delete" ON docs_journal_lines;
CREATE POLICY "append_only_block_delete" ON docs_journal_lines AS RESTRICTIVE FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM docs_journals 
        WHERE docs_journals.id = docs_journal_lines.journal_id 
          AND docs_journals.status = 'DRAFT'
    )
);

-- Credit Notes
DROP POLICY IF EXISTS "append_only_block_delete" ON docs_credit_notes;
CREATE POLICY "append_only_block_delete" ON docs_credit_notes AS RESTRICTIVE FOR DELETE USING (false);

-- Payments
DROP POLICY IF EXISTS "append_only_block_delete" ON docs_payments;
CREATE POLICY "append_only_block_delete" ON docs_payments AS RESTRICTIVE FOR DELETE USING (false);
`;

const client = new Client(connectionString);

async function applyImmutability() {
  try {
    await client.connect();
    console.log('Connected to database.');
    
    // Save to a file for record
    fs.writeFileSync('migration_enforce_append_only.sql', sql);
    console.log('Saved to migration_enforce_append_only.sql');
    
    // Execute
    await client.query(sql);
    console.log('Successfully applied RLS restrictive policies and hard PostgreSQL triggers!');
    
  } catch (err) {
    console.error('Error applying immutability:', err);
  } finally {
    await client.end();
  }
}

applyImmutability();
