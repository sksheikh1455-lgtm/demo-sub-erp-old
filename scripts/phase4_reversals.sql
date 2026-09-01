-- Phase 4.3: Reversal & Correction Logic

CREATE OR REPLACE FUNCTION reverse_journal_entry(p_journal_id TEXT, p_user_id TEXT)
RETURNS JSONB AS $$
DECLARE
    v_old_journal RECORD;
    v_new_journal_id UUID;
    v_reversed_status TEXT;
BEGIN
    -- 1. Fetch the original journal
    SELECT * INTO v_old_journal FROM docs_journals WHERE id = p_journal_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
    END IF;

    IF v_old_journal.status <> 'POSTED' THEN
        RAISE EXCEPTION 'Only POSTED journals can be reversed. Current status: %', v_old_journal.status;
    END IF;

    -- 2. Check if already reversed
    IF v_old_journal.reversed_by_id IS NOT NULL THEN
        RAISE EXCEPTION 'Journal entry % has already been reversed by %', p_journal_id, v_old_journal.reversed_by_id;
    END IF;

    -- 3. Generate the reversal journal
    INSERT INTO docs_journals (
        company_id, 
        date, 
        reference_number, 
        journal_type, 
        status, 
        data, 
        reversal_of_id,
        is_immutable
    )
    VALUES (
        v_old_journal.company_id,
        CURRENT_DATE,
        'REV-' || v_old_journal.reference_number,
        v_old_journal.journal_type,
        'POSTED',
        v_old_journal.data || jsonb_build_object('isReversal', true, 'reversalReason', 'User initiated reversal'),
        v_old_journal.id,
        true
    )
    RETURNING id INTO v_new_journal_id;

    -- 4. Duplicate lines with inverted amounts
    INSERT INTO docs_journal_lines (
        journal_id, company_id, account_id, contact_id, debit, credit, description
    )
    SELECT 
        v_new_journal_id, company_id, account_id, contact_id, credit, debit, 'Reversal of entry ' || v_old_journal.reference_number
    FROM docs_journal_lines
    WHERE journal_id = p_journal_id;

    -- 5. Mark original as reversed
    UPDATE docs_journals 
    SET reversed_by_id = v_new_journal_id::text, 
        status = 'VOID' -- We mark it VOID in the UI sense, though it remains in ledger alongside its reversal
    WHERE id = p_journal_id;

    -- 6. Log the action
    INSERT INTO docs_audit_logs (company_id, user_id, action, table_name, record_id, after_data)
    VALUES (v_old_journal.company_id, p_user_id, 'REVERSE', 'docs_journals', p_journal_id, jsonb_build_object('reversal_id', v_new_journal_id));

    RETURN jsonb_build_object('success', true, 'reversal_id', v_new_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
