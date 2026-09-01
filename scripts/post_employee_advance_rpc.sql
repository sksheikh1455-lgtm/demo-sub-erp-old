CREATE OR REPLACE FUNCTION post_employee_advance_rpc(p_advance JSONB)
RETURNS JSONB AS $$
DECLARE
    v_company_id TEXT;
    v_id TEXT;
    v_amount NUMERIC;
    v_date DATE;
    v_cash_acc TEXT;
    v_advance_acc TEXT;
    v_journal_id TEXT;
    v_desc TEXT;
BEGIN
    v_company_id := COALESCE(p_advance->>'companyId', p_advance->>'company_id');
    v_id := p_advance->>'id';
    v_amount := (p_advance->>'amount')::numeric;
    v_date := (p_advance->>'date')::date;
    v_journal_id := 'JE-ADVANCE-' || v_id;
    v_desc := 'Employee Advance Posting: ' || (p_advance->>'number');

    SELECT id INTO v_cash_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_company_id LIMIT 1;
    SELECT id INTO v_advance_acc FROM docs_accounts WHERE code = '100204' AND company_id = v_company_id LIMIT 1;

    UPDATE docs_advance_salaries SET status = 'POSTED', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'), updated_at = NOW() WHERE id = v_id;

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'ADVANCE', 'POSTED', p_advance->>'number', p_advance, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_advance_acc, v_amount, 0, v_desc);
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_cash_acc, 0, v_amount, v_desc);

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
