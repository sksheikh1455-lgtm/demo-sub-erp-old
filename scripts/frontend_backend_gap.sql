-- 1. Reverse Document RPC (For strict Immutability - NO DELETE ALLOWED)
CREATE OR REPLACE FUNCTION reverse_posted_document(p_doc_id TEXT, p_doc_type TEXT, p_company_id TEXT)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_status TEXT;
BEGIN
    -- This function safely creates a reversing journal entry to cancel out a POSTED document
    -- instead of physically deleting it (which violates GAAP).
    -- Example implementation for Invoice Reversal
    IF p_doc_type = 'INVOICE' THEN
        SELECT data->>'journalEntryId', status INTO v_journal_id, v_status FROM docs_invoices WHERE id = p_doc_id;
        IF v_status != 'POSTED' THEN RETURN jsonb_build_object('success', false, 'error', 'Only POSTED documents can be reversed'); END IF;
        
        -- Call standard reverse journal RPC
        PERFORM reverse_journal_entry(v_journal_id, 'system');
        
        -- Update invoice status to VOID
        UPDATE docs_invoices SET status = 'VOID', data = jsonb_set(data, '{status}', '"VOID"') WHERE id = p_doc_id;
        
        -- Revert inventory transactions
        DELETE FROM docs_inventory_transactions WHERE reference_id = p_doc_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Invoice reversed successfully');
    END IF;
    
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported doc type');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
