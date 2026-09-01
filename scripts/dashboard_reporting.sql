
-- Dashboard Summary Procedure
CREATE OR REPLACE FUNCTION get_dashboard_summary(
    p_company_id TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_assets NUMERIC := 0;
    v_liabilities NUMERIC := 0;
    v_equity NUMERIC := 0;
    v_revenue NUMERIC := 0;
    v_expenses NUMERIC := 0;
    v_net_income NUMERIC := 0;
    v_cash_balance NUMERIC := 0;
    v_cash_in_today NUMERIC := 0;
    v_cash_out_today NUMERIC := 0;
    v_start_of_month DATE := date_trunc('month', p_as_of_date);
    v_cash_acc_ids TEXT[];
BEGIN
    -- Asset total
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_assets
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') IN ('ASSET', 'BANK', 'RECEIVABLE');

    -- Liability total
    SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_liabilities
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') IN ('LIABILITY', 'PAYABLE');

    -- Equity total
    SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_equity
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') = 'EQUITY';

    -- Revenue (Period: Start of month to today)
    SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_revenue
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date >= v_start_of_month AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') IN ('INCOME', 'REVENUE');

    -- Expenses (Period: Start of month to today)
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_expenses
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date >= v_start_of_month AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') IN ('EXPENSE', 'COST_OF_SALES', 'COST_OF_REVENUE');

    v_net_income := v_revenue - v_expenses;

    -- Cash Balance (Accounts identified as BANK or explicitly named Cash)
    SELECT array_agg(id) INTO v_cash_acc_ids
    FROM docs_accounts
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND (UPPER(data->>'type') = 'BANK' OR code = '100100' OR name ILIKE '%Cash%');

    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_cash_balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
      AND al.account_id = ANY(v_cash_acc_ids);

    -- Cash In Today
    SELECT COALESCE(SUM(al.debit), 0) INTO v_cash_in_today
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date = p_as_of_date
      AND al.account_id = ANY(v_cash_acc_ids);

    -- Cash Out Today
    SELECT COALESCE(SUM(al.credit), 0) INTO v_cash_out_today
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date = p_as_of_date
      AND al.account_id = ANY(v_cash_acc_ids);

    v_result := jsonb_build_object(
        'assets', v_assets,
        'liabilities', v_liabilities,
        'equity', v_equity,
        'revenue', v_revenue,
        'expenses', v_expenses,
        'netIncome', v_net_income,
        'cashBalance', v_cash_balance,
        'cashInToday', v_cash_in_today,
        'cashOutToday', v_cash_out_today
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced General Ledger with Partner Info and Opening Balance
CREATE OR REPLACE FUNCTION get_general_ledger_v2(
    p_company_id TEXT,
    p_account_id TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    date DATE,
    reference TEXT,
    description TEXT,
    company_name TEXT,
    partner_name TEXT,
    prepared_by TEXT,
    debit NUMERIC,
    credit NUMERIC,
    running_balance NUMERIC,
    is_opening BOOLEAN
) AS $$
DECLARE
    v_opening_bal NUMERIC := 0;
BEGIN
    -- Calculate Opening Balance
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_opening_bal
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date < p_start_date;

    -- Return Opening Balance row
    RETURN QUERY SELECT 
        p_start_date, 
        'OPENING'::TEXT, 
        'Opening Balance'::TEXT, 
        ''::TEXT, 
        ''::TEXT, 
        ''::TEXT, 
        0::NUMERIC, 
        0::NUMERIC, 
        v_opening_bal,
        TRUE;

    -- Return Transactions
    RETURN QUERY
    SELECT 
        j.date,
        COALESCE(
          CASE 
            WHEN j.journal_type = 'INV' THEN (SELECT inv.invoice_number FROM docs_invoices inv WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(inv.id) OR LOWER(j.reference_number) = LOWER(inv.invoice_number) LIMIT 1)
            WHEN j.journal_type = 'BILL' THEN (SELECT b.bill_number FROM docs_bills b WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(b.id) OR LOWER(j.reference_number) = LOWER(b.bill_number) LIMIT 1)
            WHEN j.journal_type IN ('CUST_PAY', 'VEND_PAY') THEN (SELECT pay.payment_number FROM docs_payments pay WHERE LOWER(replace(LOWER(pay.id), 'pay-', '')) = LOWER(replace(replace(replace(replace(LOWER(j.id), 'je-cpay-', ''), 'je-vpay-', ''), 'je-', ''), 'pay-', '')) OR LOWER(j.reference_number) LIKE '%' || LOWER(pay.payment_number) || '%' LIMIT 1)
            WHEN j.journal_type = 'CREDIT_NOTE' THEN (SELECT cn.credit_note_number FROM docs_credit_notes cn WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(cn.id) OR LOWER(j.reference_number) = LOWER(cn.credit_note_number) LIMIT 1)
            ELSE NULL
          END,
          j.reference_number,
          j.id
        ),
        COALESCE(al.description, j.description, ''),
        COALESCE(c.name, 'Unknown'),
        COALESCE(cont.name, ''),
        COALESCE(u.name, u.username, j.data->>'preparedBy', ''),
        COALESCE(al.debit, 0),
        COALESCE(al.credit, 0),
        v_opening_bal + SUM(al.debit - al.credit) OVER (ORDER BY j.date, j.created_at, j.id, al.id) as running_balance,
        FALSE
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    LEFT JOIN docs_companies c ON j.company_id = c.id
    LEFT JOIN docs_contacts cont ON al.contact_id = cont.id
    LEFT JOIN docs_users u ON j.created_by_id = u.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date >= p_start_date 
      AND j.date <= p_end_date
    ORDER BY j.date ASC, j.created_at ASC, j.id ASC, al.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
