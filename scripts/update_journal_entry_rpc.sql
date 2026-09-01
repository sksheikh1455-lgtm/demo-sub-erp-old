CREATE OR REPLACE FUNCTION create_journal_entry(p_journal_data JSONB, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_status TEXT;
    v_effective_company_id TEXT;
BEGIN
    v_journal_id := p_journal_data->>'id';
    v_status := p_journal_data->>'status';
    v_effective_company_id := COALESCE(p_company_id, p_journal_data->>'companyId');

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    -- Only for non-new journals
    IF (p_journal_data->>'reference' IS NOT NULL AND p_journal_data->>'reference' <> 'NEW' AND p_journal_data->>'reference' NOT LIKE 'DRAFT-%') THEN
        SELECT id INTO v_journal_id FROM docs_journals 
        WHERE company_id = v_effective_company_id AND reference_number = p_journal_data->>'reference' LIMIT 1;
        
        IF v_journal_id IS NULL THEN 
            v_journal_id := p_journal_data->>'id';
        END IF;
    END IF;

    -- 1. Validate Balance if POSTED
    IF v_status = 'POSTED' THEN
        FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
            v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::numeric, 0);
            v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
        END LOOP;
        
        IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Journal entry is not balanced');
        END IF;
    END IF;

    -- 1. Ensure header exists (to satisfy FK for lines)
    -- We force status to DRAFT initially to bypass the balance trigger if it was already POSTED
    -- But we respect the immutability trigger
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, (p_journal_data->>'date')::date, COALESCE((p_journal_data->>'date')::date, NOW()::date), p_journal_data->>'journalType', 'DRAFT', p_journal_data->>'reference', p_journal_data, NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    -- 2. Sync Lines
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    
    FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES (COALESCE(v_line->>'id', 'JL-' || v_journal_id || '-' || floor(random()*1000000)::text), v_journal_id, v_effective_company_id, v_line->>'accountId', v_line->>'contactId', COALESCE((v_line->>'debit')::numeric, 0), COALESCE((v_line->>'credit')::numeric, 0), v_line->>'description');
    END LOOP;

    -- 3. Finalize Status (this will fire the AFTER UPDATE trigger check_journal_balance if status is POSTED)
    UPDATE docs_journals 
    SET status = v_status,
        data = p_journal_data,
        updated_at = NOW()
    WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
