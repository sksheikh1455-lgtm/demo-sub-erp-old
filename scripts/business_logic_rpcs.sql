-- 1. Expense
CREATE OR REPLACE FUNCTION process_expense_rpc(p_expense JSONB)
RETURNS JSONB AS $$
DECLARE
    v_company_id TEXT;
    v_date DATE;
    v_amount NUMERIC;
    v_from_account TEXT;
    v_to_account TEXT;
    v_desc TEXT;
    v_ref TEXT;
    v_status TEXT;
    v_contact_id TEXT;
    v_journal_id TEXT;
BEGIN
    v_company_id := COALESCE(p_expense->>'companyId', p_expense->>'company_id');
    v_date := COALESCE((p_expense->>'date')::date, CURRENT_DATE);
    v_amount := COALESCE((p_expense->>'amount')::numeric, 0);
    v_from_account := p_expense->>'fromAccountId';
    v_to_account := p_expense->>'toAccountId';
    v_desc := p_expense->>'description';
    v_ref := COALESCE(p_expense->>'reference', p_expense->>'number');
    v_status := COALESCE(p_expense->>'status', 'POSTED');
    v_contact_id := p_expense->>'contactId';
    v_journal_id := COALESCE(p_expense->>'journalId', 'JE-EXP-' || floor(random()*10000000)::text);

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'EXPENSE', v_status, v_ref, p_expense, NOW())
    ON CONFLICT (id) DO UPDATE SET status = v_status, data = p_expense, updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    IF v_status = 'POSTED' THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
        VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_to_account, v_amount, 0, v_desc);
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_from_account, v_contact_id, 0, v_amount, v_desc);
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Loan Disbursement
CREATE OR REPLACE FUNCTION post_loan_rpc(p_loan JSONB)
RETURNS JSONB AS $$
DECLARE
    v_company_id TEXT;
    v_loan_id TEXT;
    v_contact_id TEXT;
    v_amount NUMERIC;
    v_type TEXT;
    v_date DATE;
    v_cash_acc TEXT;
    v_loan_acc TEXT;
    v_journal_id TEXT;
    v_desc TEXT;
BEGIN
    v_company_id := COALESCE(p_loan->>'companyId', p_loan->>'company_id');
    v_loan_id := p_loan->>'id';
    v_contact_id := p_loan->>'contactId';
    v_amount := (p_loan->>'principalAmount')::numeric;
    v_type := p_loan->>'type';
    v_date := (p_loan->>'startDate')::date;
    v_desc := 'Loan Disbursement: ' || COALESCE(p_loan->>'name', p_loan->>'number');
    v_journal_id := 'JE-LOAN-' || v_loan_id;

    SELECT id INTO v_cash_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_company_id LIMIT 1;
    IF v_type = 'RECEIVED' THEN
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '210100' AND company_id = v_company_id LIMIT 1;
    ELSE
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '100601' AND company_id = v_company_id LIMIT 1;
    END IF;

    UPDATE docs_loans SET status = 'POSTED', updated_at = NOW() WHERE id = v_loan_id;

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'LOAN', 'POSTED', p_loan->>'number', p_loan, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    IF v_type = 'RECEIVED' OR v_contact_id = 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a' THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_cash_acc, v_amount, 0, v_desc);
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_loan_acc, v_contact_id, 0, v_amount, v_desc);
    ELSE
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_loan_acc, v_contact_id, v_amount, 0, v_desc);
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_cash_acc, 0, v_amount, v_desc);
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Payslip
CREATE OR REPLACE FUNCTION post_payslip_rpc(p_payslip JSONB)
RETURNS JSONB AS $$
DECLARE
    v_company_id TEXT;
    v_id TEXT;
    v_amount NUMERIC;
    v_date DATE;
    v_cash_acc TEXT;
    v_salary_acc TEXT;
    v_journal_id TEXT;
BEGIN
    v_company_id := COALESCE(p_payslip->>'companyId', p_payslip->>'company_id');
    v_id := p_payslip->>'id';
    v_amount := (p_payslip->>'netPay')::numeric;
    v_date := (p_payslip->>'paymentDate')::date;
    v_journal_id := 'JE-PAYSLIP-' || v_id;

    SELECT id INTO v_cash_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_company_id LIMIT 1;
    SELECT id INTO v_salary_acc FROM docs_accounts WHERE code = '500201' AND company_id = v_company_id LIMIT 1;

    UPDATE docs_payslips SET status = 'POSTED', updated_at = NOW() WHERE id = v_id;

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'PAYROLL', 'POSTED', p_payslip->>'number', p_payslip, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_salary_acc, v_amount, 0, 'Salary Payment');
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_cash_acc, 0, v_amount, 'Salary Payment');

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

