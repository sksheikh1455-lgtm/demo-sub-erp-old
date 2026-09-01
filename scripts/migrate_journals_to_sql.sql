CREATE OR REPLACE FUNCTION post_expense(p_expense JSONB)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_company_id TEXT;
    v_account_from TEXT;
    v_account_to TEXT;
    v_amount NUMERIC;
    v_date DATE;
    v_desc TEXT;
    v_ref TEXT;
BEGIN
    v_company_id := COALESCE(p_expense->>'companyId', p_expense->>'company_id');
    v_journal_id := COALESCE(p_expense->>'journalId', 'JE-EXP-' || floor(random()*10000000)::text);
    v_account_from := p_expense->>'fromAccountId';
    v_account_to := p_expense->>'toAccountId';
    v_amount := (p_expense->>'amount')::NUMERIC;
    v_date := (p_expense->>'date')::DATE;
    v_desc := p_expense->>'description';
    v_ref := COALESCE(p_expense->>'reference', p_expense->>'number');

    -- Insert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'EXPENSE', 'POSTED', v_ref, p_expense, NOW());

    -- Lines
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
    VALUES (v_journal_id || '-1', v_journal_id, v_company_id, v_account_to, v_amount, 0, v_desc);

    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
    VALUES (v_journal_id || '-2', v_journal_id, v_company_id, v_account_from, 0, v_amount, v_desc, p_expense->>'contactId');

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
