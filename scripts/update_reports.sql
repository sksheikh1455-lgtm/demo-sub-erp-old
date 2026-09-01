CREATE OR REPLACE FUNCTION public.get_profit_and_loss_enterprise(p_company_ids text[], p_start_date date, p_end_date date)
 RETURNS TABLE(category text, company_id text, account_id text, account_code text, account_name text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH PeriodActivity AS (
        SELECT 
            jl.company_id,
            jl.account_id,
            SUM(jl.debit) as p_debit,
            SUM(jl.credit) as p_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE (p_company_ids IS NULL OR jl.company_id = ANY(p_company_ids))
        AND j.status = 'POSTED'
        AND j.date::DATE >= p_start_date AND j.date::DATE <= p_end_date
        GROUP BY jl.company_id, jl.account_id
    ),
    Combined AS (
        SELECT 
            UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as account_category,
            pa.company_id,
            a.id as account_id,
            a.code as account_code,
            a.name as account_name,
            CASE 
                WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('REVENUE') THEN COALESCE(pa.p_credit, 0) - COALESCE(pa.p_debit, 0)
                WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_REVENUE', 'OTHER_EXPENSE') THEN COALESCE(pa.p_debit, 0) - COALESCE(pa.p_credit, 0)
                ELSE 0
            END as calculated_balance
        FROM docs_accounts a
        JOIN PeriodActivity pa ON a.id = pa.account_id
        WHERE (p_company_ids IS NULL OR a.company_id = ANY(p_company_ids))
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('REVENUE', 'EXPENSE', 'COGS', 'COST_OF_REVENUE', 'OTHER_EXPENSE')
        AND (pa.p_debit > 0 OR pa.p_credit > 0)
    )
    SELECT 
        c.account_category as category,
        c.company_id,
        c.account_id,
        c.account_code,
        c.account_name,
        c.calculated_balance as balance
    FROM Combined c
    ORDER BY c.account_category DESC, c.account_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_balance_sheet_enterprise(p_company_ids text[], p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(category text, company_id text, account_id text, account_code text, account_name text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH AccountBalances AS (
        SELECT 
            jl.company_id,
            jl.account_id,
            SUM(jl.debit) as t_debit,
            SUM(jl.credit) as t_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE (p_company_ids IS NULL OR jl.company_id = ANY(p_company_ids))
        AND j.status = 'POSTED'
        AND j.date::DATE <= p_as_of_date
        GROUP BY jl.company_id, jl.account_id
    ),
    Combined AS (
        SELECT 
            UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as account_category,
            ab.company_id,
            a.id as account_id,
            a.code as account_code,
            a.name as account_name,
            CASE 
                WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) = 'ASSET' THEN COALESCE(ab.t_debit, 0) - COALESCE(ab.t_credit, 0)
                WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('LIABILITY', 'EQUITY', 'PAYABLE') THEN COALESCE(ab.t_credit, 0) - COALESCE(ab.t_debit, 0)
                ELSE 0
            END as calculated_balance
        FROM docs_accounts a
        JOIN AccountBalances ab ON a.id = ab.account_id
        WHERE (p_company_ids IS NULL OR a.company_id = ANY(p_company_ids))
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'PAYABLE', 'BANK', 'RECEIVABLE')
        AND (ab.t_debit > 0 OR ab.t_credit > 0)
        
        UNION ALL
        
        SELECT
            'EQUITY' as account_category,
            re.company_id,
            'retained_earnings' as account_id,
            '399999' as account_code,
            'Retained Earnings' as account_name,
            re.retained as calculated_balance
        FROM get_retained_earnings_enterprise(p_company_ids, p_as_of_date) re
        WHERE re.retained != 0
    )
    SELECT
        c.account_category as category,
        c.company_id,
        c.account_id,
        c.account_code,
        c.account_name,
        c.calculated_balance as balance
    FROM Combined c
    ORDER BY CASE WHEN c.account_category IN ('ASSET', 'BANK', 'RECEIVABLE') THEN 1 WHEN c.account_category IN ('LIABILITY', 'PAYABLE') THEN 2 ELSE 3 END, c.account_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_trial_balance_enterprise(p_company_id text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(account_id text, account_code text, account_name text, account_type text, account_subtype text, total_debit numeric, total_credit numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        AND j.date::DATE <= p_as_of_date
        GROUP BY jl.account_id
    )
    SELECT 
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as account_type,
        a.sub_type as account_subtype,
        COALESCE(ab.t_debit, 0) as total_debit,
        COALESCE(ab.t_credit, 0) as total_credit,
        CASE 
            WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'EXPENSE', 'COGS', 'BANK', 'RECEIVABLE') THEN COALESCE(ab.t_debit, 0) - COALESCE(ab.t_credit, 0)
            ELSE COALESCE(ab.t_credit, 0) - COALESCE(ab.t_debit, 0)
        END as balance
    FROM docs_accounts a
    LEFT JOIN AccountBalances ab ON a.id = ab.account_id
    WHERE a.company_id = p_company_id
    AND a.is_group = false
    AND (COALESCE(ab.t_debit, 0) > 0 OR COALESCE(ab.t_credit, 0) > 0)
    ORDER BY a.code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_trial_balance_enterprise(p_company_ids text[], p_start_date date, p_end_date date)
 RETURNS TABLE(account_id text, company_id text, account_code text, account_name text, account_type text, account_subtype text, total_debit numeric, total_credit numeric, opening_balance numeric, closing_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH OpeningBalances AS (
        SELECT 
            jl.account_id,
            jl.company_id,
            SUM(jl.debit) as o_debit,
            SUM(jl.credit) as o_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE (p_company_ids IS NULL OR jl.company_id = ANY(p_company_ids))
        AND j.status = 'POSTED'
        AND j.date::DATE < p_start_date
        GROUP BY jl.account_id, jl.company_id
    ),
    PeriodBalances AS (
        SELECT 
            jl.account_id,
            jl.company_id,
            SUM(jl.debit) as p_debit,
            SUM(jl.credit) as p_credit
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        WHERE (p_company_ids IS NULL OR jl.company_id = ANY(p_company_ids))
        AND j.status = 'POSTED'
        AND j.date::DATE >= p_start_date 
        AND j.date::DATE <= p_end_date
        GROUP BY jl.account_id, jl.company_id
    )
    SELECT 
        a.id as account_id,
        COALESCE(ob.company_id, pb.company_id) as company_id,
        a.code as account_code,
        a.name as account_name,
        UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as account_type,
        a.data->>'subType' as account_subtype,
        COALESCE(pb.p_debit, 0) as total_debit,
        COALESCE(pb.p_credit, 0) as total_credit,
        -- Opening formula based on normal balance
        CASE 
            WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'EXPENSE', 'COGS', 'BANK', 'RECEIVABLE') THEN COALESCE(ob.o_debit, 0) - COALESCE(ob.o_credit, 0)
            ELSE COALESCE(ob.o_credit, 0) - COALESCE(ob.o_debit, 0)
        END as opening_balance,
        -- Closing formula
        CASE 
            WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'EXPENSE', 'COGS', 'BANK', 'RECEIVABLE') THEN 
                (COALESCE(ob.o_debit, 0) - COALESCE(ob.o_credit, 0)) + COALESCE(pb.p_debit, 0) - COALESCE(pb.p_credit, 0)
            ELSE 
                (COALESCE(ob.o_credit, 0) - COALESCE(ob.o_debit, 0)) + COALESCE(pb.p_credit, 0) - COALESCE(pb.p_debit, 0)
        END as closing_balance
    FROM docs_accounts a
    LEFT JOIN OpeningBalances ob ON a.id = ob.account_id
    LEFT JOIN PeriodBalances pb ON a.id = pb.account_id AND (ob.company_id IS NULL OR ob.company_id = pb.company_id)
    WHERE (p_company_ids IS NULL OR a.company_id = ANY(p_company_ids))
    AND (
        COALESCE(ob.o_debit, 0) != 0 OR 
        COALESCE(ob.o_credit, 0) != 0 OR 
        COALESCE(pb.p_debit, 0) != 0 OR 
        COALESCE(pb.p_credit, 0) != 0
    )
    ORDER BY a.code;
END;
$function$;
