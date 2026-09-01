
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
