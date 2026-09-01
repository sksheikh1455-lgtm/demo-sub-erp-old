
CREATE OR REPLACE FUNCTION get_full_ledger(
    p_company_id TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    account_id TEXT,
    account_name TEXT,
    account_code TEXT,
    account_type TEXT,
    date DATE,
    reference TEXT,
    description TEXT,
    company_name TEXT,
    partner_name TEXT,
    prepared_by TEXT,
    debit NUMERIC,
    credit NUMERIC,
    running_balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH opening_balances AS (
        SELECT 
            al.account_id,
            SUM(al.debit - al.credit) as balance
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
          AND j.status = 'POSTED'
          AND j.date < p_start_date
        GROUP BY al.account_id
    ),
    period_transactions AS (
        SELECT 
            al.account_id,
            j.date,
            COALESCE(j.reference_number, j.id) as reference,
            COALESCE(al.description, j.description, '') as description,
            j.company_id,
            al.contact_id,
            j.created_by_id,
            al.debit,
            al.credit,
            j.created_at as j_created_at,
            j.id as j_id,
            al.id as al_id
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
          AND j.status = 'POSTED'
          AND j.date >= p_start_date 
          AND j.date <= p_end_date
    )
    SELECT 
        a.id,
        a.name,
        a.code,
        (a.data->>'type'),
        pt.date,
        pt.reference,
        pt.description,
        COALESCE(c.name, 'Unknown'),
        COALESCE(cont.name, ''),
        COALESCE(u.name, u.username, ''),
        COALESCE(pt.debit, 0),
        COALESCE(pt.credit, 0),
        COALESCE(ob.balance, 0) + SUM(pt.debit - pt.credit) OVER (PARTITION BY a.id ORDER BY pt.date, pt.j_created_at, pt.j_id, pt.al_id) as running_balance
    FROM docs_accounts a
    LEFT JOIN opening_balances ob ON a.id = ob.account_id
    LEFT JOIN period_transactions pt ON a.id = pt.account_id
    LEFT JOIN docs_companies c ON pt.company_id = c.id
    LEFT JOIN docs_contacts cont ON pt.contact_id = cont.id
    LEFT JOIN docs_users u ON pt.created_by_id = u.id
    WHERE (p_company_id IS NULL OR a.company_id = p_company_id)
      AND (pt.account_id IS NOT NULL OR COALESCE(ob.balance, 0) != 0)
    ORDER BY a.code ASC, pt.date ASC, pt.j_created_at ASC, pt.j_id ASC, pt.al_id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
