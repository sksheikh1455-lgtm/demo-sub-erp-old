import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

const sql = `
BEGIN;

DO $$
DECLARE
    v_journal_id text;
    v_cn_id text := '48a36277-ce85-41dd-b167-d010bd43c39b'; -- CN-GLM-000003
BEGIN
    SELECT data->>'journalEntryId' INTO v_journal_id FROM docs_credit_notes WHERE id = v_cn_id;
    DELETE FROM docs_payments WHERE reference = 'CPAY/REF-CN-GLM-000003';
    DELETE FROM docs_credit_note_lines WHERE credit_note_id = v_cn_id;
    DELETE FROM docs_credit_notes WHERE id = v_cn_id;
    IF v_journal_id IS NOT NULL THEN
        DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
        DELETE FROM docs_journals WHERE id = v_journal_id;
    END IF;
END $$;

DO $$
DECLARE
    v_journal_id text;
    v_cn_id text := 'eb8ad734-4d74-4e00-be8e-8868718e55c3'; -- CN-GLM-000004
BEGIN
    SELECT data->>'journalEntryId' INTO v_journal_id FROM docs_credit_notes WHERE id = v_cn_id;
    DELETE FROM docs_credit_note_lines WHERE credit_note_id = v_cn_id;
    DELETE FROM docs_credit_notes WHERE id = v_cn_id;
    IF v_journal_id IS NOT NULL THEN
        DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
        DELETE FROM docs_journals WHERE id = v_journal_id;
    END IF;
END $$;

UPDATE docs_invoices
SET status = 'POSTED',
    data = jsonb_set(
        jsonb_set(data, '{status}', '"POSTED"'),
        '{amountPaid}', '0'
    )
WHERE invoice_number = 'INV-GLM-000005';

COMMIT;
`;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(sql);
  console.log('Cleanup script executed successfully.');
  await client.end();
}
main();
