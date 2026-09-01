-- 1. Drop existing functions to avoid signatures clashes
DROP FUNCTION IF EXISTS public.get_partner_summary(p_company_ids text[], p_contact_type text, p_as_of_date date);
DROP FUNCTION IF EXISTS public.get_partner_summary(p_company_id text, p_contact_type text);

-- 2. Create updated GAAP-compliant get_partner_summary (3 arguments)
CREATE OR REPLACE FUNCTION public.get_partner_summary(
    p_company_ids text[],
    p_contact_type text, -- 'CUSTOMER' or 'VENDOR'
    p_as_of_date date DEFAULT NULL::date
)
RETURNS TABLE(contact_id text, contact_name text, company_id text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH active_cids AS (
        SELECT unnest(COALESCE(p_company_ids, ARRAY(SELECT id FROM docs_companies))) AS company_id
    ),
    contact_companies AS (
        SELECT 
            c.id AS cid,
            c.name AS cname,
            c.type AS ctype,
            COALESCE(c.opening_balances, '{}'::jsonb) AS cop_bals,
            comp.company_id
        FROM docs_contacts c
        CROSS JOIN active_cids comp
        WHERE c.type = p_contact_type
    ),
    journal_sums AS (
        SELECT 
            coalesce(al.contact_id, 
                CASE 
                    WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                        coalesce(j.data->>'contactId', j.data->>'customerId', j.data->>'vendorId', j.data->>'partnerId')
                    ELSE NULL 
                END
            ) AS contact_id,
            j.company_id,
            COALESCE(SUM(al.debit - al.credit), 0) AS tx_bal,
            EXISTS (
                SELECT 1 
                FROM docs_journal_lines al2
                JOIN docs_journals j2 ON al2.journal_id = j2.id
                WHERE j2.journal_type = 'OPENING_BALANCE'
                  AND j2.company_id = j.company_id
                  AND coalesce(al2.contact_id, j2.data->>'contactId', j2.data->>'customerId', j2.data->>'vendorId', j2.data->>'partnerId') = 
                      coalesce(al.contact_id, j.data->>'contactId', j.data->>'customerId', j.data->>'vendorId', j.data->>'partnerId')
            ) AS has_op_journal
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        LEFT JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
          AND j.status = 'POSTED'
          AND (p_as_of_date IS NULL OR j.date < p_as_of_date)
          AND (
              (p_contact_type = 'CUSTOMER' AND (
                  LOWER(a.sub_type) = 'accounts_receivable'
                  OR LOWER(a.sub_type) = 'receivable'
                  OR LOWER(a.sub_type) = 'accounts receivable'
                  OR a.code IN ('100201', '100200', '100202', '100203', '100204', '100205')
                  OR a.code LIKE '1002%'
                  OR LOWER(a.name) ILIKE '%accounts receivable%'
                  OR LOWER(a.name) ILIKE '%customer advance%'
                  OR LOWER(a.name) ILIKE '%advance from customer%'
                  OR LOWER(a.name) ILIKE '%advance customer%'
                  OR LOWER(a.name) ILIKE '%customer prepayment%'
                  OR LOWER(a.name) ILIKE '%customer advance/deposit%'
                  OR LOWER(a.name) ILIKE '%debtor%'
                  OR (a.type = 'ASSET' AND LOWER(a.name) ILIKE '%receivable%')
                  OR a.data->>'type' = 'RECEIVABLE'
              ))
              OR 
              (p_contact_type = 'VENDOR' AND (
                  LOWER(a.sub_type) = 'accounts_payable'
                  OR LOWER(a.sub_type) = 'payable'
                  OR LOWER(a.sub_type) = 'accounts payable'
                  OR a.code IN ('200101', '200100', '200102', '200103', '200104', '200105')
                  OR a.code LIKE '2001%'
                  OR LOWER(a.name) ILIKE '%accounts payable%'
                  OR LOWER(a.name) ILIKE '%vendor advance%'
                  OR LOWER(a.name) ILIKE '%advance to vendor%'
                  OR LOWER(a.name) ILIKE '%advance vendor%'
                  OR LOWER(a.name) ILIKE '%vendor prepayment%'
                  OR LOWER(a.name) ILIKE '%vendor advance/deposit%'
                  OR LOWER(a.name) ILIKE '%creditor%'
                  OR (a.type = 'LIABILITY' AND LOWER(a.name) ILIKE '%payable%')
                  OR a.data->>'type' = 'PAYABLE'
              ))
          )
        GROUP BY 
            coalesce(al.contact_id, 
                CASE 
                    WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                        coalesce(j.data->>'contactId', j.data->>'customerId', j.data->>'vendorId', j.data->>'partnerId')
                    ELSE NULL 
                END
            ),
            j.company_id
    )
    SELECT 
        cc.cid AS contact_id,
        cc.cname AS contact_name,
        cc.company_id AS company_id,
        ROUND(
            COALESCE(js.tx_bal, 0)::numeric + 
            (CASE 
                -- If opening balance journal already exists, do not double count
                WHEN COALESCE(js.has_op_journal, false) = true THEN 0
                -- Otherwise, add the opening balance from contact
                ELSE 
                    COALESCE((cc.cop_bals->>cc.company_id)::numeric, 0)
             END)::numeric,
            2
        ) AS balance
    FROM contact_companies cc
    LEFT JOIN journal_sums js ON cc.cid = js.contact_id AND cc.company_id = js.company_id
    -- Only return entries with non-zero balances
    WHERE ROUND(
        COALESCE(js.tx_bal, 0)::numeric + 
        (CASE 
            WHEN COALESCE(js.has_op_journal, false) = true THEN 0
            ELSE COALESCE((cc.cop_bals->>cc.company_id)::numeric, 0)
         END)::numeric,
        2
    ) != 0;
END;
$$;


-- 3. Create updated 2-argument helper override version of get_partner_summary
CREATE OR REPLACE FUNCTION public.get_partner_summary(p_company_id text, p_contact_type text)
RETURNS TABLE(contact_id text, contact_name text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gps.contact_id,
        gps.contact_name,
        gps.balance
    FROM public.get_partner_summary(ARRAY[p_company_id], p_contact_type, NULL::date) gps;
END;
$$;
