CREATE OR REPLACE FUNCTION public.post_loan_rpc(p_loan_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
    v_loan docs_loans%ROWTYPE;
    v_company_id TEXT;
    v_contact_id TEXT;
    v_amount NUMERIC;
    v_type TEXT;
    v_date DATE;
    v_cash_acc TEXT;
    v_loan_acc TEXT;
    v_journal_id TEXT;
    v_desc TEXT;
    v_name TEXT;
    v_number TEXT;
    v_uid uuid;
    v_user_role TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_loan FROM docs_loans WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan not found';
    END IF;
    
    v_company_id := v_loan.company_id;
    
    -- Verify user has access to this company
    SELECT role INTO v_user_role FROM company_users WHERE company_id = (v_company_id)::uuid AND user_id = v_uid;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied to company';
    END IF;

    v_contact_id := v_loan.contact_id;
    v_amount := v_loan.principal_amount;
    v_type := v_loan.type;
    v_date := v_loan.start_date;
    v_name := v_loan.name;
    v_number := v_loan.loan_number;
    
    IF v_amount IS NULL AND v_loan.amount IS NOT NULL THEN
        v_amount := v_loan.amount;
    END IF;
    
    v_desc := 'Loan Disbursement: ' || COALESCE(v_name, v_number);
    v_journal_id := 'JE-LOAN-' || UPPER(p_loan_id);
    
    SELECT id INTO v_cash_acc FROM docs_accounts WHERE (code = '100100' OR sub_type IN ('CASH', 'BANK') OR name ILIKE '%cash%') AND company_id = v_company_id LIMIT 1;
    IF v_cash_acc IS NULL THEN RAISE EXCEPTION 'Could not find cash/bank account for company'; END IF;
    
    IF v_type = 'RECEIVED' THEN
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '210100' AND company_id = v_company_id LIMIT 1;
        IF v_loan_acc IS NULL THEN RAISE EXCEPTION 'Could not find Loan Payable account (210100) for company'; END IF;
    ELSE
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '100601' AND company_id = v_company_id LIMIT 1;
        IF v_loan_acc IS NULL THEN RAISE EXCEPTION 'Could not find Loan Receivable account (100601) for company'; END IF;
    END IF;
    
    UPDATE docs_loans SET status = 'ACTIVE', updated_at = NOW(), data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', to_jsonb('ACTIVE'::text)) WHERE id = p_loan_id;
    
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, updated_at)
    VALUES (v_journal_id, v_company_id, v_date, v_date, 'LOAN', 'POSTED', v_number, NOW())
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
$function$;

CREATE OR REPLACE FUNCTION public.post_loan_payment_rpc(p_loan_id text, p_period integer, p_date text, p_interest_to_pay numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
    v_loan RECORD;
    v_principal NUMERIC;
    v_cash_acc TEXT;
    v_loan_acc TEXT;
    v_interest_acc TEXT;
    v_journal_id TEXT;
    v_desc TEXT;
    v_is_received BOOLEAN;
    v_company_id TEXT;
    v_contact_id TEXT;
    v_schedule JSONB;
    v_item JSONB;
    v_total NUMERIC;
    v_uid uuid;
    v_user_role TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_loan FROM docs_loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

    v_company_id := v_loan.company_id;
    
    -- Verify user has access to this company
    SELECT role INTO v_user_role FROM company_users WHERE company_id = (v_company_id)::uuid AND user_id = v_uid;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied to company';
    END IF;

    v_contact_id := (v_loan.data->>'contactId');
    IF v_contact_id IS NULL THEN v_contact_id := v_loan.contact_id; END IF;
    
    v_is_received := (v_loan.data->>'type') = 'RECEIVED';
    
    v_schedule := v_loan.data->'amortizationSchedule';
    v_principal := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_schedule) LOOP
        IF (v_item->>'period')::INT = p_period THEN
            v_principal := (v_item->>'principal')::NUMERIC;
        END IF;
    END LOOP;

    v_total := v_principal + p_interest_to_pay;
    v_desc := 'Loan Payment Period ' || p_period::TEXT || ': ' || COALESCE(v_loan.data->>'name', v_loan.data->>'number');
    v_journal_id := 'JE-LPAY-' || p_loan_id || '-' || p_period::TEXT;

    SELECT id INTO v_cash_acc FROM docs_accounts WHERE (code = '100100' OR sub_type IN ('CASH', 'BANK') OR name ILIKE '%cash%') AND company_id = v_company_id LIMIT 1;
    IF v_cash_acc IS NULL THEN RAISE EXCEPTION 'Cash/Bank account (100100) not found for this company'; END IF;

    IF v_is_received THEN
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '210100' AND company_id = v_company_id LIMIT 1;
        SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '500208' AND company_id = v_company_id LIMIT 1;
        IF v_interest_acc IS NULL THEN SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '600000' AND company_id = v_company_id LIMIT 1; END IF;
    ELSE
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '100601' AND company_id = v_company_id LIMIT 1;
        SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '500208' AND company_id = v_company_id LIMIT 1;
        IF v_interest_acc IS NULL THEN SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '400500' AND company_id = v_company_id LIMIT 1; END IF;
    END IF;

    IF v_loan_acc IS NULL THEN RAISE EXCEPTION 'Loan principal account (210100 or 100601) not found for this company'; END IF;
    IF p_interest_to_pay > 0 AND v_interest_acc IS NULL THEN RAISE EXCEPTION 'Interest account not found for this company'; END IF;

    UPDATE docs_loans SET 
        paid_periods = array_append(COALESCE(paid_periods, ARRAY[]::TEXT[]), p_period::TEXT),
        status = CASE WHEN array_length(array_append(COALESCE(paid_periods, ARRAY[]::TEXT[]), p_period::TEXT), 1) = (v_loan.data->>'termMonths')::INT THEN 'PAID' ELSE status END,
        updated_at = NOW()
    WHERE id = p_loan_id;

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, p_date, p_date, 'LOAN_PAYMENT', 'POSTED', v_loan.data->>'number' || '/P' || p_period::TEXT, '{}'::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    IF v_is_received THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-dr1', v_journal_id, v_company_id, v_loan_acc, v_contact_id, v_principal, 0, v_desc);
        IF p_interest_to_pay > 0 THEN
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-dr2', v_journal_id, v_company_id, v_interest_acc, v_contact_id, p_interest_to_pay, 0, v_desc);
        END IF;
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_cash_acc, v_contact_id, 0, v_total, v_desc);
    ELSE
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_cash_acc, v_contact_id, v_total, 0, v_desc);
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-cr1', v_journal_id, v_company_id, v_loan_acc, v_contact_id, 0, v_principal, v_desc);
        IF p_interest_to_pay > 0 THEN
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES (v_journal_id || '-cr2', v_journal_id, v_company_id, v_interest_acc, v_contact_id, 0, p_interest_to_pay, v_desc);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$function$;
