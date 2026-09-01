-- Advanced Financial Reporting Engine with Horizontal/Consolidated Support

DROP FUNCTION IF EXISTS get_trial_balance(TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS get_balance_sheet(TEXT, DATE);
DROP FUNCTION IF EXISTS get_general_ledger(TEXT, TEXT, DATE, DATE);

-- 1. Trial Balance Function (Supports Horizontal Breakdown)
CREATE OR REPLACE FUNCTION get_trial_balance(
    p_company_id TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    branch_id TEXT, -- Returns company_id for pivoting
    opening_balance NUMERIC,
    period_debit NUMERIC,
    period_credit NUMERIC,
    closing_balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH ledger_summary AS (
        SELECT 
            al.account_id,
            j.company_id,
            SUM(CASE WHEN j.date < p_start_date THEN al.debit - al.credit ELSE 0 END) as o_bal,
            SUM(CASE WHEN j.date >= p_start_date AND j.date <= p_end_date THEN al.debit ELSE 0 END) as p_debit,
            SUM(CASE WHEN j.date >= p_start_date AND j.date <= p_end_date THEN al.credit ELSE 0 END) as p_credit
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
          AND j.status = 'POSTED'
        GROUP BY al.account_id, j.company_id
    )
    SELECT 
        a.id,
        a.code,
        a.name,
        (a.data->>'type') as account_type,
        ls.company_id as branch_id,
        COALESCE(ls.o_bal, 0) as opening_balance,
        COALESCE(ls.p_debit, 0) as period_debit,
        COALESCE(ls.p_credit, 0) as period_credit,
        (COALESCE(ls.o_bal, 0) + COALESCE(ls.p_debit, 0) - COALESCE(ls.p_credit, 0)) as closing_balance
    FROM docs_accounts a
    JOIN ledger_summary ls ON a.id = ls.account_id
    WHERE (p_company_id IS NULL OR a.company_id = p_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Balance Sheet Function (Supports Horizontal Breakdown)
CREATE OR REPLACE FUNCTION get_balance_sheet(
    p_company_id TEXT,
    p_as_of_date DATE
)
RETURNS TABLE (
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    branch_id TEXT,
    balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.code,
        a.name,
        (a.data->>'type') as account_type,
        j.company_id as branch_id,
        SUM(al.debit - al.credit) as balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND j.date <= p_as_of_date
      AND UPPER(a.data->>'type') IN ('ASSET', 'LIABILITY', 'EQUITY', 'BANK', 'RECEIVABLE', 'PAYABLE')
    GROUP BY a.id, a.code, a.name, a.data->>'type', j.company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Consolidated P&L Helper
-- We don't need a separate function if we just query the existing view with/without company_id

-- 4. General Ledger Function (Supports Consolidation)
CREATE OR REPLACE FUNCTION get_general_ledger(
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
    debit NUMERIC,
    credit NUMERIC,
    running_balance NUMERIC
) AS $$
BEGIN
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
          ''
        ),
        COALESCE(al.description, ''),
        COALESCE(c.name, 'Unknown'),
        COALESCE(al.debit, 0),
        COALESCE(al.credit, 0),
        SUM(al.debit - al.credit) OVER (ORDER BY j.date, COALESCE(j.created_at, j.updated_at), j.id, al.created_at, al.id) as running_balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    LEFT JOIN docs_companies c ON j.company_id = c.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date >= p_start_date 
      AND j.date <= p_end_date
    ORDER BY j.date ASC, COALESCE(j.created_at, j.updated_at) ASC, j.id ASC, al.created_at ASC, al.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Accounts Receivable/Payable Summary Function
CREATE OR REPLACE FUNCTION get_partner_summary(
    p_company_ids TEXT[],
    p_contact_type TEXT, -- 'CUSTOMER' or 'VENDOR'
    p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE (
    contact_id TEXT,
    contact_name TEXT,
    balance NUMERIC
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        COALESCE(SUM(al.debit - al.credit), 0) as balance
    FROM docs_contacts c
    LEFT JOIN (
        SELECT al.debit, al.credit, al.contact_id, j.company_id, al.account_id, j.status, j.journal_type, j.data, j.date
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
    ) al ON (
        COALESCE(al.contact_id, 
            CASE 
                WHEN al.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                    (al.data->>'contactId')
                ELSE NULL 
            END
        ) = c.id
    )
    LEFT JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_ids IS NULL OR al.company_id = ANY(p_company_ids))
      AND al.status = 'POSTED'
      AND (p_as_of_date IS NULL OR al.date < p_as_of_date)
      AND (
          (p_contact_type = 'CUSTOMER' AND (a.data->>'type' = 'RECEIVABLE' OR a.code = '100201' OR a.name ILIKE '%Accounts Receivable%'))
          OR 
          (p_contact_type = 'VENDOR' AND (a.data->>'type' = 'PAYABLE' OR a.code = '200101' OR a.name ILIKE '%Accounts Payable%'))
      )
    GROUP BY c.id, c.name;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- 5. GET INVENTORY LEDGER (DETAIL)
-- =========================================
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
        COALESCE(u.username, it.created_by_id) AS responsible_name,
        it.created_at
    FROM docs_inventory_transactions it
    JOIN docs_products p ON it.product_id = p.id
    LEFT JOIN docs_warehouses w ON it.warehouse_id = w.id
    LEFT JOIN docs_users u ON it.created_by_id = u.user_uuid
    WHERE it.company_id = ANY(p_company_ids)
      AND (p_product_ids IS NULL OR it.product_id = ANY(p_product_ids))
      AND (p_start_date IS NULL OR it.date >= p_start_date)
      AND (p_end_date IS NULL OR it.date <= p_end_date)
    ORDER BY it.date ASC, it.created_at ASC;
END;
$$ LANGUAGE plpgsql;
