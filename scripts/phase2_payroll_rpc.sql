-- Create RPC to automatically post payroll journals
CREATE OR REPLACE FUNCTION process_payroll(p_payslip_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_payslip RECORD;
    v_journal_id TEXT;
    v_effective_company_id TEXT;
    v_total_salary NUMERIC := 0;
    v_total_deductions NUMERIC := 0;
    v_net_pay NUMERIC := 0;
    v_salary_exp_acc TEXT;
    v_salary_pay_acc TEXT;
    v_tax_pay_acc TEXT;
    v_contact_id TEXT;
BEGIN
    SELECT * INTO v_payslip FROM docs_payslips WHERE id = p_payslip_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payslip not found'); END IF;

    IF v_payslip.status = 'POSTED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already posted');
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_payslip.company_id, v_payslip.data->>'companyId');
    v_contact_id := v_payslip.data->>'employeeId';

    v_total_salary := COALESCE((v_payslip.data->>'grossPay')::NUMERIC, 0);
    v_total_deductions := COALESCE((v_payslip.data->>'totalDeductions')::NUMERIC, 0);
    v_net_pay := COALESCE((v_payslip.data->>'netPay')::NUMERIC, 0);

    IF v_total_salary <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Gross pay must be greater than zero');
    END IF;

    -- Lookup Accounts (ensure these exist in chart of accounts)
    SELECT id INTO v_salary_exp_acc FROM docs_accounts WHERE code = '50020' OR code = '5002' OR name ILIKE '%Salary%Expense%' AND company_id = v_effective_company_id LIMIT 1;
    IF v_salary_exp_acc IS NULL THEN v_salary_exp_acc := 'unknown_salary_exp'; END IF;

    SELECT id INTO v_salary_pay_acc FROM docs_accounts WHERE code = '20040' OR code = '2004' OR name ILIKE '%Salary%Payable%' AND company_id = v_effective_company_id LIMIT 1;
    IF v_salary_pay_acc IS NULL THEN v_salary_pay_acc := 'unknown_salary_pay'; END IF;

    -- Note: you can further split deductions into taxes, PF, loans etc if needed.

    v_journal_id := gen_random_uuid()::TEXT;
    
    INSERT INTO docs_journals (id, company_id, date, reference, description, status, data, created_at, updated_at)
    VALUES (
        v_journal_id, v_effective_company_id, v_payslip.date, v_payslip.data->>'reference',
        'Payroll Journal for ' || COALESCE(v_payslip.data->>'reference', p_payslip_id),
        'POSTED',
        jsonb_build_object(
            'reference', v_payslip.data->>'reference',
            'contactId', v_contact_id,
            'lines', jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid()::TEXT,
                    'accountId', v_salary_exp_acc,
                    'contactId', v_contact_id,
                    'debit', v_total_salary,
                    'credit', 0,
                    'description', 'Gross Salary Expense'
                ),
                jsonb_build_object(
                    'id', gen_random_uuid()::TEXT,
                    'accountId', v_salary_pay_acc,
                    'contactId', v_contact_id,
                    'debit', 0,
                    'credit', v_net_pay,
                    'description', 'Net Salary Payable'
                )
                -- Add more lines for specific deductions here if v_total_deductions > 0
            )
        ),
        NOW(), NOW()
    );

    UPDATE docs_payslips SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"') WHERE id = p_payslip_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
