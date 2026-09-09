-- =========================================
-- CONSOLIDATED RPCs & FUNCTIONS FOR NEW SUPABASE DB
-- Project: fachqxrknmrgekfcldgw
-- =========================================


-- >>> FILE: scripts/balances.sql <<<

-- Get Balance for a Specific Account
CREATE OR REPLACE FUNCTION get_account_balance(
    p_company_ids TEXT[],
    p_account_id TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date;
    
    RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get Balance for a Specific Partner (Contact)
CREATE OR REPLACE FUNCTION get_partner_balance(
    p_company_ids TEXT[],
    p_contact_id TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_type TEXT;
BEGIN
    -- Determine contact type
    SELECT (data->>'type') INTO v_type FROM docs_contacts WHERE id = p_contact_id;
    
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
      AND al.contact_id = p_contact_id
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date;
    
    -- Invert for Vendors (Payables)
    IF v_type = 'VENDOR' THEN
        RETURN -v_balance;
    ELSE
        RETURN v_balance;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get All Account Balances for a given set of companies
CREATE OR REPLACE FUNCTION get_all_account_balances(
    p_company_ids TEXT[],
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id TEXT,
    balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.account_id,
        COALESCE(SUM(al.debit - al.credit), 0) as balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
    GROUP BY al.account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- >>> FILE: scripts/fix_partner_summary_exact_match.sql <<<
CREATE OR REPLACE FUNCTION public.get_partner_summary(p_company_ids text[], p_contact_type text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(contact_id text, contact_name text, company_id text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH derived_lines AS (
        SELECT 
            coalesce(al.contact_id, 
                CASE 
                    WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                        coalesce(j.data->>'contactId', j.data->>'customerId', j.data->>'vendorId', j.data->>'partnerId')
                    ELSE NULL 
                END
            ) AS effective_contact_id,
            j.company_id AS j_company_id,
            (al.debit - al.credit) as amount
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL OR j.company_id = ANY(p_company_ids))
          AND j.status = 'POSTED'
          AND (p_as_of_date IS NULL OR j.date::DATE <= p_as_of_date)
          AND (
              (p_contact_type = 'CUSTOMER' AND (
                  LOWER(a.sub_type) = 'accounts_receivable'
                  OR LOWER(a.sub_type) = 'receivable'
                  OR a.code = '100201'
              ))
              OR 
              (p_contact_type = 'VENDOR' AND (
                  LOWER(a.sub_type) = 'accounts_payable'
                  OR LOWER(a.sub_type) = 'payable'
                  OR a.code = '200101'
              ))
          )
    ),
    partner_sums AS (
        SELECT 
            effective_contact_id,
            j_company_id,
            SUM(amount) AS tx_bal
        FROM derived_lines
        WHERE effective_contact_id IS NOT NULL
        GROUP BY effective_contact_id, j_company_id
        HAVING ROUND(SUM(amount)::numeric, 2) != 0
    )
    SELECT 
        ps.effective_contact_id AS contact_id,
        coalesce(c.name, 'Unknown Partner') AS contact_name,
        ps.j_company_id AS company_id,
        ROUND(ps.tx_bal::numeric, 2) AS balance
    FROM partner_sums ps
    LEFT JOIN docs_contacts c ON c.id = ps.effective_contact_id;
END;
$$;


-- >>> FILE: scripts/dashboard_reporting.sql <<<

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


-- >>> FILE: scripts/phase2_reporting_engine.sql <<<
-- Enterprise Trial Balance report execution (Server-side aggregation)
-- Eliminates frontend grouping. Handles period boundaries efficiently.
CREATE OR REPLACE FUNCTION get_trial_balance_enterprise(
    p_company_id TEXT,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    account_subtype TEXT,
    total_debit NUMERIC,
    total_credit NUMERIC,
    balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH AccountBalances AS (
        SELECT 
            jl.account_id,
            SUM(jl.debit) as t_debit,
            SUM(jl.credit) as t_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE jl.company_id = p_company_id
        AND j.status = 'POSTED'
        AND (p_end_date IS NULL OR j.date::DATE <= p_end_date)
        GROUP BY jl.account_id
    )
    SELECT 
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        a.type as account_type,
        a.sub_type as account_subtype,
        COALESCE(ab.t_debit, 0) as total_debit,
        COALESCE(ab.t_credit, 0) as total_credit,
        CASE 
            WHEN a.type IN ('ASSET', 'EXPENSE', 'COGS') THEN COALESCE(ab.t_debit, 0) - COALESCE(ab.t_credit, 0)
            ELSE COALESCE(ab.t_credit, 0) - COALESCE(ab.t_debit, 0)
        END as balance
    FROM docs_accounts a
    LEFT JOIN AccountBalances ab ON a.id = ab.account_id
    WHERE a.company_id = p_company_id
    AND (COALESCE(ab.t_debit, 0) > 0 OR COALESCE(ab.t_credit, 0) > 0)
    ORDER BY a.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Profit and Loss (Server-side aggregation for enterprise speed)
CREATE OR REPLACE FUNCTION get_profit_and_loss_enterprise(
    p_company_id TEXT,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    category TEXT,          -- e.g., 'REVENUE', 'COGS', 'EXPENSE'
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    balance NUMERIC
) AS $$
BEGIN
    -- Security Validation implicitly handled by not returning if the user shouldn't (though caller should check)
    -- As this is SECURITY DEFINER, we should add access check
    IF NOT check_company_access(p_company_id) THEN 
        RAISE EXCEPTION 'Access denied'; 
    END IF;

    RETURN QUERY
    WITH PeriodActivity AS (
        SELECT 
            jl.account_id,
            SUM(jl.debit) as p_debit,
            SUM(jl.credit) as p_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE jl.company_id = p_company_id
        AND j.status = 'POSTED'
        AND j.date::DATE >= p_start_date AND j.date::DATE <= p_end_date
        GROUP BY jl.account_id
    )
    SELECT 
        a.type::TEXT as category,
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        CASE 
            WHEN a.type IN ('REVENUE') THEN COALESCE(pa.p_credit, 0) - COALESCE(pa.p_debit, 0)
            WHEN a.type IN ('EXPENSE', 'COGS') THEN COALESCE(pa.p_debit, 0) - COALESCE(pa.p_credit, 0)
            ELSE 0
        END as balance
    FROM docs_accounts a
    JOIN PeriodActivity pa ON a.id = pa.account_id
    WHERE a.company_id = p_company_id
    AND a.type IN ('REVENUE', 'EXPENSE', 'COGS')
    AND (pa.p_debit > 0 OR pa.p_credit > 0)
    ORDER BY a.type DESC, a.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Balance Sheet (Server-side aggregation)
CREATE OR REPLACE FUNCTION get_balance_sheet_enterprise(
    p_company_id TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    category TEXT,          -- e.g., 'ASSET', 'LIABILITY', 'EQUITY'
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    balance NUMERIC
) AS $$
BEGIN
    IF NOT check_company_access(p_company_id) THEN 
        RAISE EXCEPTION 'Access denied'; 
    END IF;

    RETURN QUERY
    WITH AccountBalances AS (
        SELECT 
            jl.account_id,
            SUM(jl.debit) as t_debit,
            SUM(jl.credit) as t_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE jl.company_id = p_company_id
        AND j.status = 'POSTED'
        AND j.date::DATE <= p_as_of_date
        GROUP BY jl.account_id
    )
    SELECT 
        a.type::TEXT as category,
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        CASE 
            WHEN a.type = 'ASSET' THEN COALESCE(ab.t_debit, 0) - COALESCE(ab.t_credit, 0)
            WHEN a.type IN ('LIABILITY', 'EQUITY') THEN COALESCE(ab.t_credit, 0) - COALESCE(ab.t_debit, 0)
            ELSE 0
        END as balance
    FROM docs_accounts a
    JOIN AccountBalances ab ON a.id = ab.account_id
    WHERE a.company_id = p_company_id
    AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
    AND (ab.t_debit > 0 OR ab.t_credit > 0)
    ORDER BY CASE a.type WHEN 'ASSET' THEN 1 WHEN 'LIABILITY' THEN 2 ELSE 3 END, a.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Calculate Retained Earnings internally
CREATE OR REPLACE FUNCTION get_retained_earnings_enterprise(
    p_company_id TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
    v_retained NUMERIC := 0;
BEGIN
    IF NOT check_company_access(p_company_id) THEN 
        RAISE EXCEPTION 'Access denied'; 
    END IF;

    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN a.type = 'REVENUE' THEN jl.credit - jl.debit
                WHEN a.type IN ('EXPENSE', 'COGS') THEN jl.debit - jl.credit
                ELSE 0
            END
        ), 0) INTO v_retained
    FROM docs_journal_lines jl
    JOIN docs_journals j ON jl.journal_id = j.id
    JOIN docs_accounts a ON jl.account_id = a.id
    WHERE jl.company_id = p_company_id
    AND j.status = 'POSTED'
    AND j.date::DATE <= p_as_of_date
    AND a.type IN ('REVENUE', 'EXPENSE', 'COGS');

    RETURN v_retained;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Payment RPC expansion
CREATE OR REPLACE FUNCTION process_payment_and_allocate(
   p_receipt_data JSONB,
   p_invoices JSONB, -- Array of objects: { "invoiceId": "x", "amount": 100 }
   p_company_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_effective_company_id TEXT;
  v_payment_id TEXT;
  v_total_amount NUMERIC := 0;
  v_alloc RECORD;
  v_inv RECORD;
  v_new_paid NUMERIC;
BEGIN
  v_effective_company_id := p_company_id;
  IF NOT check_company_access(v_effective_company_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_payment_id := COALESCE(p_receipt_data->>'id', 'PAY-' || gen_random_uuid());
  v_total_amount := COALESCE((p_receipt_data->>'amount')::NUMERIC, 0);

  -- Start transaction implicitly
  INSERT INTO docs_payments (id, company_id, status, data)
  VALUES (v_payment_id, v_effective_company_id, 'DRAFT', p_receipt_data);

  -- Process allocations
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_invoices) = 'array' THEN p_invoices ELSE '[]'::jsonb END) LOOP
      SELECT * INTO v_inv FROM docs_invoices WHERE id = v_alloc->>'invoiceId' AND company_id = v_effective_company_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', v_alloc->>'invoiceId'; END IF;
      
      v_new_paid := COALESCE((v_inv.data->>'amountPaid')::NUMERIC, 0) + (v_alloc->>'amount')::NUMERIC;
      IF v_new_paid > COALESCE((v_inv.data->>'total')::NUMERIC, 0) THEN
          RAISE EXCEPTION 'Cannot overpay invoice %', v_inv.id;
      END IF;

      UPDATE docs_invoices SET 
        data = jsonb_set(
            jsonb_set(data, '{amountPaid}', to_jsonb(v_new_paid)),
            '{amountDue}', to_jsonb(COALESCE((v_inv.data->>'total')::NUMERIC, 0) - v_new_paid)
        ),
        version = COALESCE(version, 1) + 1
      WHERE id = v_inv.id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- >>> FILE: scripts/get_inventory_valuation.sql <<<
CREATE OR REPLACE FUNCTION public.get_inventory_valuation(
  p_company_ids TEXT[],
  p_warehouse_id TEXT DEFAULT 'all'
)
RETURNS TABLE (
  total_items BIGINT,
  total_on_hand NUMERIC,
  total_asset_value NUMERIC,
  total_retail_value NUMERIC
) AS $$
DECLARE
  v_count BIGINT := 0;
  v_on_hand NUMERIC := 0;
  v_asset_val NUMERIC := 0;
  v_retail_val NUMERIC := 0;
BEGIN
  IF p_warehouse_id = 'all' OR p_warehouse_id IS NULL OR p_warehouse_id = '' THEN
    -- Calculate globally across all warehouses for the active companies
    SELECT 
      COALESCE(COUNT(p.id), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0)), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.price, 0)), 0)
    INTO 
      v_count, v_on_hand, v_asset_val, v_retail_val
    FROM public.docs_products p
    WHERE p.company_id::text = ANY(p_company_ids);
  ELSE
    -- Calculate specifically for the given warehouse using docs_product_costs for quantity and cost
    -- docs_product_costs contains product_id, warehouse_id, total_qty, avg_cost
    BEGIN
      SELECT 
        COALESCE(COUNT(DISTINCT p.id), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0)), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0) * COALESCE(pc.avg_cost, p.cost_price, 0)), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0) * COALESCE(p.price, 0)), 0)
      INTO 
        v_count, v_on_hand, v_asset_val, v_retail_val
      FROM public.docs_products p
      LEFT JOIN public.docs_product_costs pc ON pc.product_id = p.id AND pc.warehouse_id::text = p_warehouse_id
      WHERE p.company_id::text = ANY(p_company_ids);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback if comparison or anything fails (just use global)
      SELECT 
        COALESCE(COUNT(p.id), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0)), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.price, 0)), 0)
      INTO 
        v_count, v_on_hand, v_asset_val, v_retail_val
      FROM public.docs_products p
      WHERE p.company_id::text = ANY(p_company_ids);
    END;
  END IF;

  RETURN QUERY SELECT v_count, v_on_hand, v_asset_val, v_retail_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- >>> FILE: scripts/add-stock-valuation-rpc.sql <<<
-- Add get_stock_valuation RPC
CREATE OR REPLACE FUNCTION get_stock_valuation(p_company_id TEXT)
RETURNS TABLE (
    company_id TEXT,
    product_id TEXT,
    product_name TEXT,
    sku TEXT,
    unit_cost NUMERIC,
    on_hand_qty NUMERIC,
    total_value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.company_id,
        p.id as product_id,
        p.name as product_name,
        COALESCE(p.sku, '') as sku,
        COALESCE(p.cost_price, (p.data->>'costPrice')::NUMERIC, 0) as unit_cost,
        COALESCE((p.data->>'quantityOnHand')::NUMERIC, 0) as on_hand_qty,
        (COALESCE(p.cost_price, (p.data->>'costPrice')::NUMERIC, 0) * COALESCE((p.data->>'quantityOnHand')::NUMERIC, 0)) as total_value
    FROM docs_products p
    WHERE p_company_id IS NULL OR p.company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- >>> FILE: scripts/fix-inventory-ledger-rpc.sql <<<
-- Fix for Inventory Valuation Report and get_inventory_ledger RPC

-- 1. Ensure the created_by_id column exists
ALTER TABLE docs_inventory_transactions ADD COLUMN IF NOT EXISTS created_by_id UUID DEFAULT auth.uid();

-- 2. Fixed get_inventory_ledger function
CREATE OR REPLACE FUNCTION get_inventory_ledger(
    p_company_ids TEXT[],
    p_product_ids TEXT[] DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    product_id TEXT,
    product_name TEXT,
    sku TEXT,
    transaction_date DATE,
    transaction_type TEXT,
    reference_id TEXT,
    reference_name TEXT,
    quantity NUMERIC,
    cost_price NUMERIC,
    warehouse_name TEXT,
    responsible_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        it.product_id,
        p.name AS product_name,
        COALESCE(p.sku, '') AS sku,
        it.date AS transaction_date,
        it.transaction_type,
        it.reference_id,
        COALESCE(it.reference_type, '') AS reference_name,
        it.quantity,
        it.cost_price,
        COALESCE(w.name, 'Default') AS warehouse_name,
        COALESCE(it.created_by_id::text, 'N/A') AS responsible_name,
        it.created_at
    FROM docs_inventory_transactions it
    JOIN docs_products p ON it.product_id = p.id
    LEFT JOIN docs_warehouses w ON it.warehouse_id = w.id
    WHERE it.company_id = ANY(p_company_ids)
      AND (p_product_ids IS NULL OR it.product_id = ANY(p_product_ids))
      AND (p_start_date IS NULL OR it.date >= p_start_date)
      AND (p_end_date IS NULL OR it.date <= p_end_date)
    ORDER BY it.date ASC, it.created_at ASC;
END;
$$ LANGUAGE plpgsql;


-- >>> FILE: scripts/posting_rpcs.sql <<<

-- Post Invoice Transactional RPC
CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_journal_data JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_item_subtotal NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_cogs_value NUMERIC := 0;
    v_ar_acc TEXT;
    v_rev_acc TEXT;
    v_cogs_acc TEXT;
    v_inv_acc TEXT;
    v_tax_acc TEXT;
    v_tax_total NUMERIC := 0;
    v_idx INT := 0;
    v_tracking_type TEXT;
    v_effective_company_id TEXT;
BEGIN
    -- 1. Get Invoice Data with Lock
    SELECT * INTO v_invoice FROM docs_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;
    v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(UPPER(v_invoice.id), 'INV-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_invoice.company_id, v_invoice.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code = '500101' AND company_id = v_effective_company_id;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id;

    IF v_ar_acc IS NULL OR v_rev_acc IS NULL THEN 
       RAISE EXCEPTION 'Required AR/Revenue accounts not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
                v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_item_subtotal := ROUND(v_item_subtotal, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_item_subtotal;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_item_subtotal := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_item_subtotal := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_item_subtotal;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
               v_item_subtotal := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_item_subtotal;
        END IF;
    END LOOP;

    -- 4. Finalize Invoice Status First (to generate number)
    v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', ''));
    UPDATE docs_invoices SET status = 'POSTED', data = jsonb_set(jsonb_set(data, '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id)), updated_at = NOW() WHERE id = p_invoice_id RETURNING * INTO v_invoice;

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals WHERE company_id = v_effective_company_id AND reference_number = v_invoice.data->>'number' LIMIT 1;
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    -- But only if it's not already POSTED
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_invoice.date, 'INV', 'DRAFT', v_invoice.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_invoice.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_invoice.data->>'number', 'journalType', 'INV'), NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- AR Line (Total)
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, v_invoice.customer_id, ROUND(COALESCE((v_invoice.data->>'total')::numeric, 0), 2), 0, 'AR: ' || (v_invoice.data->>'number'));
    v_total_debit := ROUND(COALESCE((v_invoice.data->>'total')::numeric, 0), 2);

    -- Items
    DECLARE
        v_discount_distributed NUMERIC := 0;
        v_items_count INT := 0;
        v_current_item_idx INT := 0;
    BEGIN
        SELECT count(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

        FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1; -- Unique for every item in raw array
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_current_item_idx := v_current_item_idx + 1;
                
                -- Calculate Gross for this line
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_item_subtotal = 0 THEN
                    v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                    IF v_item->>'discountMode' = 'FIXED' THEN
                        v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                    ELSE
                        v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                    END IF;
                    v_item_subtotal := ROUND(v_item_subtotal, 2);
                END IF;
                
                -- Distribution Logic (v_global_discount is negative)
                IF v_current_item_idx = v_items_count THEN
                    v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                ELSE
                    v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_item_subtotal / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                    v_proportional_discount := ROUND(v_proportional_discount, 2);
                    v_discount_distributed := v_discount_distributed + v_proportional_discount;
                END IF;

                v_revenue_net := ROUND(v_item_subtotal + v_proportional_discount, 2);

                -- Revenue Cr
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-rev-' || v_idx, v_journal_id, v_effective_company_id, v_rev_acc, 0, v_revenue_net, 'Revenue: ' || (v_item->>'description'));
                v_total_credit := v_total_credit + v_revenue_net;

                IF v_item->>'type' = 'PRODUCT' THEN
                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                        v_new_stock := v_current_stock - COALESCE((v_item->>'quantity')::numeric, 0);

                        UPDATE docs_products 
                        SET data = jsonb_set(
                            jsonb_set(
                                CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                                ARRAY['stockLevels', v_effective_company_id], 
                                v_new_stock::text::jsonb
                            ),
                            '{quantityOnHand}', v_new_stock::text::jsonb
                        ),
                            updated_at = NOW()
                        WHERE id = v_product_record.id;

                        v_cogs_value := ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_product_record.data->>'costPrice')::numeric, 0), 2);
                        IF v_cogs_value > 0 THEN
                            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                            VALUES ('JL-' || v_journal_id || '-cogs-' || v_idx, v_journal_id, v_effective_company_id, v_cogs_acc, v_cogs_value, 0, 'COGS: ' || (v_item->>'description'));
                            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                            VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, 0, v_cogs_value, 'Inv Red: ' || (v_item->>'description'));
                            v_total_debit := v_total_debit + v_cogs_value;
                            v_total_credit := v_total_credit + v_cogs_value;
                        END IF;
                    END IF;
                END IF;
            ELSIF v_item->>'type' = 'TAX' THEN
                v_tax_total := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, 0, v_tax_total, 'Tax: ' || (v_item->>'description'));
                v_total_credit := v_total_credit + v_tax_total;
            END IF;
        END LOOP;
    END;

    -- 5. Balancing & Finalize
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);
    IF v_total_debit != v_total_credit THEN
        IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
            -- Adjust the last revenue line to balance
            UPDATE docs_journal_lines SET credit = credit + (v_total_debit - v_total_credit)
            WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-rev-' || v_idx;
            v_total_credit := v_total_debit;
        ELSE
            RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
        END IF;
    END IF;

    -- Upsert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_invoice.date, 'INV', 'POSTED', v_invoice.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_invoice.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_invoice.data->>'number', 'journalType', 'INV', 'preparedBy', COALESCE(v_invoice.data->>'preparedBy', v_invoice.data->>'salesperson'), 'createdById', v_invoice.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Post Bill RPC
CREATE OR REPLACE FUNCTION post_bill(p_bill_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_bill RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_old_cost NUMERIC;
    v_new_cost NUMERIC;
    v_idx INT := 0;
    v_ap_acc TEXT;
    v_inv_acc TEXT;
    v_exp_acc TEXT;
    v_tax_acc TEXT;
    v_net_cost NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_effective_company_id TEXT;
BEGIN
    -- 1. Get Bill Data
    SELECT * INTO v_bill FROM docs_bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', p_bill_id; END IF;
    v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(UPPER(v_bill.id), 'BILL-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_bill.company_id, v_bill.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ap_acc FROM docs_accounts WHERE code IN ('200101', '200100', '200201') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id;
    SELECT id INTO v_exp_acc FROM docs_accounts WHERE code IN ('500101', '600100') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id;

    IF v_ap_acc IS NULL THEN 
       RAISE EXCEPTION 'Accounts Payable account not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_net_cost := ROUND(v_net_cost, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_net_cost;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_net_cost := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_net_cost;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
               v_net_cost := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_net_cost;
        END IF;
    END LOOP;

    -- 4. Finalize Bill Status First (to generate number)
    v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_bill.id), 'BIL-', ''), 'BILL-', ''));
    UPDATE docs_bills SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"'), updated_at = NOW() WHERE id = p_bill_id RETURNING * INTO v_bill;

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals WHERE company_id = v_effective_company_id AND reference_number = v_bill.data->>'number' LIMIT 1;
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_bill.id), 'BIL-', ''), 'BILL-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    -- But only if it's not already POSTED
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_bill.date, 'BILL', 'DRAFT', v_bill.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_bill.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_bill.data->>'number', 'journalType', 'BILL'), NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- AP Line (Total)
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ap', v_journal_id, v_effective_company_id, v_ap_acc, v_bill.vendor_id, 0, ROUND(COALESCE((v_bill.data->>'total')::numeric, 0), 2), 'AP: ' || (v_bill.data->>'number'));
    v_total_credit := ROUND(COALESCE((v_bill.data->>'total')::numeric, 0), 2);

    -- Items
    DECLARE
        v_discount_distributed NUMERIC := 0;
        v_items_count INT := 0;
        v_current_item_idx INT := 0;
    BEGIN
        SELECT count(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

        FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1; -- Unique for every item in raw array
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_current_item_idx := v_current_item_idx + 1;
                
                -- Calculate Gross for this line
                v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_net_cost = 0 THEN
                    v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                    IF v_item->>'discountMode' = 'FIXED' THEN
                        v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                    ELSE
                        v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                    END IF;
                    v_net_cost := ROUND(v_net_cost, 2);
                END IF;
                
                -- Distribution Logic (v_global_discount is negative)
                IF v_current_item_idx = v_items_count THEN
                    v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                ELSE
                    v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_net_cost / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                    v_proportional_discount := ROUND(v_proportional_discount, 2);
                    v_discount_distributed := v_discount_distributed + v_proportional_discount;
                END IF;

                v_revenue_net := ROUND(v_net_cost + v_proportional_discount, 2);

                IF v_item->>'type' = 'PRODUCT' THEN
                    -- Dr Inventory
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, v_revenue_net, 0, 'Inv Val: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_revenue_net;

                    -- Update Stock & WAC (WAC update usually on Bills)
                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                        v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                        
                        UPDATE docs_products 
                        SET data = jsonb_set(
                            jsonb_set(
                                jsonb_set(
                                    CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                                    ARRAY['stockLevels', v_effective_company_id], 
                                    v_new_stock::text::jsonb
                                ),
                                '{lastPurchasePrice}', COALESCE((v_item->>'unitPrice')::text, '0')::jsonb
                            ),
                            '{quantityOnHand}', v_new_stock::text::jsonb
                        ) || jsonb_build_object('lastPurchaseRate', COALESCE((v_item->>'unitPrice')::numeric, 0)),
                            updated_at = NOW()
                        WHERE id = v_product_record.id;
                    END IF;
                ELSIF v_item->>'type' IN ('SERVICE', 'CHARGE') THEN
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-exp-' || v_idx, v_journal_id, v_effective_company_id, v_exp_acc, v_revenue_net, 0, 'Exp: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_revenue_net;
                END IF;
            ELSIF v_item->>'type' = 'TAX' THEN
                v_tax_total := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, v_tax_total, 0, 'Tax: ' || (v_item->>'description'));
                v_total_debit := v_total_debit + v_tax_total;
            END IF;
        END LOOP;
    END;

    -- If no items / lines were processed or debit is still 0 while credit is > 0,
    -- create a default Sales Return line matching v_cn.subtotal (or total - tax)
    IF v_total_credit > 0 AND v_total_debit = 0 THEN
        DECLARE
            v_net_return NUMERIC;
            v_tax_return NUMERIC;
        BEGIN
            v_tax_return := ROUND(COALESCE((v_cn.data->>'taxTotal')::numeric, v_cn.tax_total, 0), 2);
            v_net_return := ROUND(v_total_credit - v_tax_return, 2);
            
            -- Debit Revenue
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
            VALUES ('JL-' || v_journal_id || '-rev-fallback', v_journal_id, v_effective_company_id, v_rev_acc, v_net_return, 0, 'Srv Return (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
            v_total_debit := v_total_debit + v_net_return;
            
            -- Debit Tax if any
            IF v_tax_return > 0 THEN
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-fallback', v_journal_id, v_effective_company_id, v_tax_acc, v_tax_return, 0, 'Tax Reverse (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
                v_total_debit := v_total_debit + v_tax_return;
            END IF;
        END;
    END IF;

    -- Balancing
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);
    IF v_total_debit != v_total_credit THEN
        IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
            -- Adjust the last expense or inventory line to balance
            UPDATE docs_journal_lines SET debit = debit + (v_total_credit - v_total_debit)
            WHERE journal_id = v_journal_id AND (id = 'JL-' || v_journal_id || '-exp-' || v_idx OR id = 'JL-' || v_journal_id || '-inv-' || v_idx);
            v_total_debit := v_total_credit;
        ELSE
            RAISE EXCEPTION 'Bill Failed: Unbalanced Bill (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
        END IF;
    END IF;

    -- Upsert Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_bill.date, 'BILL', 'POSTED', v_bill.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_bill.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_bill.data->>'number', 'journalType', 'BILL', 'preparedBy', COALESCE(v_bill.data->>'preparedBy', v_bill.data->>'purchaser'), 'createdById', v_bill.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Post Payment RPC
CREATE OR REPLACE FUNCTION post_payment(p_payment_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_payment RECORD;
    v_journal_id TEXT;
    v_is_receipt BOOLEAN;
    v_is_refund BOOLEAN;
    v_amount NUMERIC;
    v_liquidity_acc TEXT;
    v_partner_acc TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_alloc JSONB;
    v_inv_record RECORD;
    v_bill_record RECORD;
    v_new_amt_paid NUMERIC;
    v_effective_company_id TEXT;
    v_date DATE;
    v_contact_id TEXT;
BEGIN
    -- 1. Get Payment
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id); END IF;
    v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || replace(UPPER(v_payment.id), 'PAY-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id, v_payment.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Company ID missing'); END IF;

    v_is_receipt := (v_payment.data->>'type') = 'RECEIPT' OR (v_payment.data->>'type') = 'COLLECTION';
    v_is_refund := (v_payment.data->>'type') = 'REFUND';
    v_amount := (v_payment.data->>'amount')::numeric;
    
    -- Sync variables (safety fallback)
    v_date := COALESCE(v_payment.date, (v_payment.data->>'date')::DATE);
    v_contact_id := COALESCE(v_payment.contact_id, v_payment.data->>'contactId', v_payment.data->>'customerId', v_payment.data->>'vendorId');

    -- 2. Resolve Accounts (Cash, Bank, AR/AP)
    v_liquidity_acc := v_payment.data->>'accountId';
    IF v_liquidity_acc IS NOT NULL THEN
        -- Verify ID exists
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE id = v_liquidity_acc AND company_id = v_effective_company_id;
        
        -- If not found by ID, try looking it up as a code (common mistake of passing code as ID)
        IF v_liquidity_acc IS NULL THEN
            SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = (v_payment.data->>'accountId') AND company_id = v_effective_company_id;
        END IF;
    END IF;

    -- Fallback 1: Try common codes
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100') AND company_id = v_effective_company_id LIMIT 1;
    END IF;

    -- Fallback 2: Try subType CASH
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE (data->>'subType' = 'CASH' OR name ILIKE '%Cash%') AND company_id = v_effective_company_id LIMIT 1;
    END IF;

    IF v_liquidity_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Liquidity account (Cash/Bank) not found. Company: ' || v_effective_company_id); 
    END IF;

    v_partner_acc := v_payment.data->>'partnerAccountId';
    IF v_partner_acc IS NOT NULL THEN
        -- Verify ID exists
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE id = v_partner_acc AND company_id = v_effective_company_id;

        -- If not found by ID, try looking it up as a code
        IF v_partner_acc IS NULL THEN
            SELECT id INTO v_partner_acc FROM docs_accounts WHERE code = (v_payment.data->>'partnerAccountId') AND company_id = v_effective_company_id;
        END IF;
    END IF;

    -- Fallback to default if still null
    IF v_partner_acc IS NULL THEN
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE code IN ('100201', '200101') AND company_id = v_effective_company_id 
        ORDER BY CASE WHEN v_is_receipt OR v_is_refund THEN (code = '100201') ELSE (code = '200101') END DESC LIMIT 1;
    END IF;

    IF v_partner_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Partner account (AR/AP) not found. Company: ' || v_effective_company_id); 
    END IF;

    v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', ''));
    
    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    -- The reference for payment is usually the reference/number/id
    SELECT id INTO v_journal_id FROM docs_journals 
    WHERE company_id = v_effective_company_id 
      AND reference_number = COALESCE(v_payment.data->>'number', v_payment.id) 
    LIMIT 1;
    
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_date, CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'DRAFT', COALESCE(v_payment.data->>'number', v_payment.id), 
        jsonb_build_object('id', v_journal_id, 'date', v_date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', COALESCE(v_payment.data->>'number', v_payment.id), 'journalType', CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- Liquidity Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-liq', v_journal_id, v_effective_company_id, v_liquidity_acc, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, COALESCE('Payment: ' || (v_payment.data->>'reference'), 'Payment: ' || (v_payment.data->>'number'), 'Payment: ' || v_payment.id));
    
    -- Partner Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-part', v_journal_id, v_effective_company_id, v_partner_acc, v_contact_id, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, COALESCE('Reconciliation: ' || (v_payment.data->>'reference'), 'Reconciliation: ' || (v_payment.data->>'number'), 'Payment reconciliation: ' || v_payment.id));

    -- Upsert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_date, CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'POSTED', COALESCE(v_payment.data->>'number', v_payment.id), 
        jsonb_build_object('id', v_journal_id, 'date', v_date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', COALESCE(v_payment.data->>'number', v_payment.id), 'journalType', CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'preparedBy', COALESCE(v_payment.data->>'preparedBy', v_payment.data->>'salesperson'), 'createdById', v_payment.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    -- 3. Allocation Updates
    IF v_is_receipt THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedInvoices') = 'array' THEN v_payment.data->'appliedInvoices' ELSE '[]'::jsonb END) LOOP
            SELECT * INTO v_inv_record FROM docs_invoices WHERE id = (v_alloc->>'invoiceId') FOR UPDATE;
            IF FOUND THEN
                v_new_amt_paid := COALESCE((v_inv_record.data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric;
                UPDATE docs_invoices 
                SET data = jsonb_set(
                    jsonb_set(data, '{amountPaid}', to_jsonb(v_new_amt_paid)),
                    '{status}', 
                    CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
                ),
                status = CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                updated_at = NOW()
                WHERE id = v_inv_record.id;
            END IF;
        END LOOP;
    ELSE
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedBills') = 'array' THEN v_payment.data->'appliedBills' ELSE '[]'::jsonb END) LOOP
            SELECT * INTO v_bill_record FROM docs_bills WHERE id = (v_alloc->>'billId') FOR UPDATE;
            IF FOUND THEN
                v_new_amt_paid := COALESCE((v_bill_record.data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric;
                UPDATE docs_bills 
                SET data = jsonb_set(
                    jsonb_set(data, '{amountPaid}', to_jsonb(v_new_amt_paid)),
                    '{status}', 
                    CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
                ),
                status = CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                updated_at = NOW()
                WHERE id = v_bill_record.id;
            END IF;
        END LOOP;
    END IF;

    UPDATE docs_payments SET status = 'POSTED', data = jsonb_set(jsonb_set(data, '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id)), updated_at = NOW() WHERE id = p_payment_id;

    
    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create/Post Journal Entry RPC
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
            v_total_debit := v_total_debit + (v_line->>'debit')::numeric;
            v_total_credit := v_total_credit + (v_line->>'credit')::numeric;
        END LOOP;
        
        IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Journal entry is not balanced');
        END IF;
    END IF;

    -- 1. Ensure header exists (to satisfy FK for lines)
    -- We force status to DRAFT initially to bypass the balance trigger if it was already POSTED
    -- But we respect the immutability trigger
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, (p_journal_data->>'date')::date, p_journal_data->>'journalType', 'DRAFT', p_journal_data->>'reference', p_journal_data, NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    -- 2. Sync Lines
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    
    FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES (COALESCE(v_line->>'id', 'JL-' || v_journal_id || '-' || floor(random()*1000000)::text), v_journal_id, v_effective_company_id, v_line->>'accountId', v_line->>'contactId', (v_line->>'debit')::numeric, (v_line->>'credit')::numeric, v_line->>'description');
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

-- Post Credit Note RPC
CREATE OR REPLACE FUNCTION post_credit_note(p_cn_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_cn RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_idx INT := 0;
    v_ar_acc TEXT;
    v_rev_acc TEXT;
    v_inv_acc TEXT;
    v_cogs_acc TEXT;
    v_cogs_value NUMERIC;
    v_net_cost NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_tax_acc TEXT;
    v_effective_company_id TEXT;
    v_total_cogs NUMERIC := 0;
    v_tx_cost NUMERIC := 0;
    v_wh_id TEXT;
BEGIN
    -- 1. Get Credit Note
    SELECT * INTO v_cn FROM docs_credit_notes WHERE id = p_cn_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit Note not found: %', p_cn_id; END IF;

    -- Safe fallback if data column is NULL
    IF v_cn.data IS NULL OR jsonb_typeof(v_cn.data) = 'null' THEN
        v_cn.data := jsonb_build_object(
            'id', v_cn.id,
            'number', COALESCE(v_cn.credit_note_number, v_cn.cn_number, 'CN-' || v_cn.id),
            'customerId', v_cn.customer_id,
            'date', v_cn.date,
            'total', COALESCE(v_cn.total, 0),
            'subtotal', COALESCE(v_cn.subtotal, v_cn.total, 0),
            'taxTotal', COALESCE(v_cn.tax_total, 0),
            'status', COALESCE(v_cn.status, 'DRAFT'),
            'items', '[]'::jsonb
        );
    END IF;

    -- Advanced fallback: If data->'items' is empty or null, build it from docs_credit_note_lines relational table
    IF NOT (v_cn.data ? 'items') OR jsonb_typeof(v_cn.data->'items') = 'null' OR jsonb_array_length(v_cn.data->'items') = 0 THEN
        v_cn.data := jsonb_set(
            v_cn.data,
            '{items}',
            COALESCE(
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', id,
                        'productId', product_id,
                        'quantity', quantity,
                        'unitPrice', unit_price,
                        'lineValue', COALESCE(line_value, total),
                        'discountMode', COALESCE(discount_mode, 'PERCENT'),
                        'discountRate', COALESCE(discount_rate, 0),
                        'type', type,
                        'description', description
                    )
                ) FROM docs_credit_note_lines WHERE credit_note_id = p_cn_id),
                '[]'::jsonb
            )
        );
    END IF;

    v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_cn.id), 'CN-', ''), 'CN-', ''));
    
    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals 
    WHERE company_id = COALESCE(p_company_id, v_cn.company_id) AND reference_number = v_cn.data->>'number' LIMIT 1;

    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_cn.id), 'CN-', ''), 'CN-', ''));
    END IF;

    -- Check if ALREADY POSTED: Only stop if status is indeed POSTED
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_cn.company_id, v_cn.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100500') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code IN ('200400', '200100') AND company_id = v_effective_company_id LIMIT 1;

    IF v_ar_acc IS NULL OR v_rev_acc IS NULL THEN 
       RAISE EXCEPTION 'Required accounts not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    v_total_cogs := 0;
    v_wh_id := 'wh-' || v_effective_company_id;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_cn.data->'items') = 'array' THEN v_cn.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_net_cost := ROUND(v_net_cost, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_net_cost;

            -- Calculate COGS if product
            IF v_item->>'type' = 'PRODUCT' AND v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
                SELECT avg_cost INTO v_tx_cost FROM docs_product_costs WHERE product_id = (v_item->>'productId') AND warehouse_id = v_wh_id AND company_id = v_effective_company_id;
                IF v_tx_cost IS NULL OR v_tx_cost = 0 THEN 
                    SELECT COALESCE(cost_price, (data->>'costPrice')::numeric, 0) INTO v_tx_cost FROM docs_products WHERE id = (v_item->>'productId'); 
                END IF;
                v_tx_cost := COALESCE(v_tx_cost, 0);
                v_total_cogs := v_total_cogs + ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * v_tx_cost, 2);
            END IF;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_net_cost := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_net_cost;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
               v_net_cost := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_net_cost;
        END IF;
    END LOOP;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, 'CREDIT_NOTE', 'DRAFT', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();

    -- Process Product Returns (Inventory Re-stocking and Movements Trigger generation)
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_cn.data->'items') = 'array' THEN v_cn.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' = 'PRODUCT' AND v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
            SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
            IF FOUND THEN
                v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                
                UPDATE docs_products 
                SET data = jsonb_set(
                    CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                    ('{stockLevels,' || v_effective_company_id || '}')::text[], 
                    v_new_stock::text::jsonb
                ),
                    updated_at = NOW()
                WHERE id = v_product_record.id;
            END IF;
        END IF;
    END LOOP;

    -- Zero out ALL existing journal lines for this journal (Zeroing Architecture)
    -- This includes zeroing any individual lines created by inventory movement triggers beforehand
    UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE journal_id = v_journal_id;

    -- Calculate balanced aggregated lines
    v_total_credit := ROUND(COALESCE((v_cn.data->>'total')::numeric, 0), 2);
    v_revenue_net := v_total_revenue_subtotal + v_global_discount;
    -- Balance check
    IF ROUND(v_revenue_net + v_tax_total, 2) != v_total_credit THEN
        v_revenue_net := ROUND(v_total_credit - v_tax_total, 2);
    END IF;

    -- Insert Single Distinct Aggregated AR Credit Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, COALESCE(v_cn.data->>'customerId', v_cn.data->>'contactId'), 0, v_total_credit, 'Credit Note total: ' || (v_cn.data->>'number'))
    ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;

    -- Insert Single Distinct Aggregated Revenue Debit Line
    IF v_revenue_net > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-rev-agg', v_journal_id, v_effective_company_id, v_rev_acc, NULL, v_revenue_net, 0, 'Sales Return: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Insert Single Distinct Aggregated Tax Debit Line
    IF v_tax_total > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-tax-agg', v_journal_id, v_effective_company_id, v_tax_acc, NULL, v_tax_total, 0, 'Tax Return: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Insert Single Distinct Aggregated Inventory Debit and COGS Credit lines
    IF v_total_cogs > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-inv-agg', v_journal_id, v_effective_company_id, v_inv_acc, NULL, v_total_cogs, 0, 'Inventory Re-stocking: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;

        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-cogs-agg', v_journal_id, v_effective_company_id, v_cogs_acc, NULL, 0, v_total_cogs, 'COGS Reversal: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Update flat columns for sync correctly
    UPDATE docs_credit_notes 
    SET status = 'POSTED', 
        data = jsonb_set(
            jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
            '{journalEntryId}', to_jsonb(v_journal_id)
        ), 
        updated_at = NOW() 
    WHERE id = p_cn_id;

    -- Upsert Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, 'CREDIT_NOTE', 'POSTED', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE', 'preparedBy', COALESCE(v_cn.data->>'preparedBy', v_cn.data->>'salesperson'), 'createdById', v_cn.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id AND (debit != 0 OR credit != 0)), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




-- >>> FILE: scripts/combined_rpcs.sql <<<
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

CREATE OR REPLACE FUNCTION post_loan_payment_rpc(p_loan_id TEXT, p_period INT, p_date DATE, p_interest_to_pay NUMERIC)
RETURNS JSONB AS $$
DECLARE
    v_loan RECORD;
    v_entry JSONB;
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
    v_new_schedule JSONB := '[]'::jsonb;
    v_item JSONB;
    v_is_interest_only BOOLEAN := FALSE;
    v_total NUMERIC;
BEGIN
    SELECT * INTO v_loan FROM docs_loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

    v_company_id := v_loan.company_id;
    v_contact_id := (v_loan.data->>'contactId');
    v_is_received := (v_loan.data->>'type') = 'RECEIVED';
    
    -- Find schedule entry
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

    SELECT id INTO v_cash_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_company_id LIMIT 1;
    IF v_is_received THEN
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '210100' AND company_id = v_company_id LIMIT 1;
        SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '600000' AND company_id = v_company_id LIMIT 1;
        IF v_interest_acc IS NULL THEN SELECT id INTO v_interest_acc FROM docs_accounts WHERE type = 'EXPENSE' AND name ILIKE '%interest%' AND company_id = v_company_id LIMIT 1; END IF;
    ELSE
        SELECT id INTO v_loan_acc FROM docs_accounts WHERE code = '100601' AND company_id = v_company_id LIMIT 1;
        SELECT id INTO v_interest_acc FROM docs_accounts WHERE code = '400500' AND company_id = v_company_id LIMIT 1;
        IF v_interest_acc IS NULL THEN SELECT id INTO v_interest_acc FROM docs_accounts WHERE type = 'REVENUE' AND name ILIKE '%interest%' AND company_id = v_company_id LIMIT 1; END IF;
    END IF;

    -- Update Loan Document
    -- Note: Updating paid_periods array and amortization schedule in SQL
    UPDATE docs_loans SET 
        paid_periods = array_append(COALESCE(paid_periods, ARRAY[]::INT[]), p_period),
        status = CASE WHEN array_length(array_append(COALESCE(paid_periods, ARRAY[]::INT[]), p_period), 1) = (v_loan.data->>'termMonths')::INT THEN 'PAID' ELSE status END,
        updated_at = NOW()
    WHERE id = p_loan_id;

    -- Insert Journal
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_company_id, p_date, p_date, 'LOAN_PAYMENT', 'POSTED', v_loan.data->>'number' || '/P' || p_period::TEXT, '{}'::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    
    IF v_is_received THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr1', v_journal_id, v_company_id, v_loan_acc, v_principal, 0, v_desc);
        IF p_interest_to_pay > 0 THEN
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr2', v_journal_id, v_company_id, v_interest_acc, p_interest_to_pay, 0, v_desc);
        END IF;
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr', v_journal_id, v_company_id, v_cash_acc, 0, v_total, v_desc);
    ELSE
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-dr', v_journal_id, v_company_id, v_cash_acc, v_total, 0, v_desc);
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr1', v_journal_id, v_company_id, v_loan_acc, 0, v_principal, v_desc);
        IF p_interest_to_pay > 0 THEN
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES (v_journal_id || '-cr2', v_journal_id, v_company_id, v_interest_acc, 0, p_interest_to_pay, v_desc);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
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

