-- Script to clean up rogue Credit Note & Payments and reset INV-GLM-000005
BEGIN;

-- 1. Delete the "Cash Sale" Credit Note (CN-GLM-000003) and its associated journal & payments
DO $$
DECLARE
    v_journal_id text;
    v_cn_id text := '48a36277-ce85-41dd-b167-d010bd43c39b'; -- CN-GLM-000003
BEGIN
    SELECT data->>'journalEntryId' INTO v_journal_id FROM docs_credit_notes WHERE id = v_cn_id;
    
    -- Delete CPAY REFUND related to this credit note
    DELETE FROM docs_payments WHERE reference = 'CPAY/REF-CN-GLM-000003';
    
    -- Delete credit note lines
    DELETE FROM docs_credit_note_lines WHERE credit_note_id = v_cn_id;
    
    -- Delete the credit note
    DELETE FROM docs_credit_notes WHERE id = v_cn_id;
    
    -- Delete the associated journal and lines
    IF v_journal_id IS NOT NULL THEN
        DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
        DELETE FROM docs_journals WHERE id = v_journal_id;
    END IF;
END $$;

-- 2. Delete CN-GLM-000004 to cleanly reset the test state
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

-- 3. Reset Invoice INV-GLM-000005
UPDATE docs_invoices
SET status = 'POSTED',
    data = jsonb_set(
        jsonb_set(data, '{status}', '"POSTED"'),
        '{amountPaid}', '0'
    )
WHERE invoice_number = 'INV-GLM-000005';

COMMIT;
