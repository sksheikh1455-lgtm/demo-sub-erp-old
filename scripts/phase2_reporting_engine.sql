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
