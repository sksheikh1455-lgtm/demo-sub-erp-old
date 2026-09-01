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
