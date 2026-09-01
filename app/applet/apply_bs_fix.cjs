const pg = require('pg');
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query(`
CREATE OR REPLACE FUNCTION public.get_balance_sheet_enterprise(p_company_ids text[], p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(category text, company_id text, account_id text, account_code text, account_name text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
    BEGIN
        RETURN QUERY
        WITH AccountBalances AS (
            SELECT j.company_id, jl.account_id, SUM(jl.debit) as t_debit, SUM(jl.credit) as t_credit
            FROM docs_journal_lines jl JOIN docs_journals j ON jl.journal_id = j.id
            WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids)) AND j.status = 'POSTED' AND j.date::DATE <= p_as_of_date
            GROUP BY j.company_id, jl.account_id
        ),
        Combined AS (
            SELECT UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as account_category, ab.company_id, a.id as account_id, a.code as account_code, a.name as account_name,
                CASE 
                    WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'BANK', 'RECEIVABLE') THEN COALESCE(ab.t_debit, 0) - COALESCE(ab.t_credit, 0)
                    ELSE COALESCE(ab.t_credit, 0) - COALESCE(ab.t_debit, 0)
                END as calculated_balance
            FROM docs_accounts a JOIN AccountBalances ab ON a.id = ab.account_id
            WHERE UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'PAYABLE', 'BANK', 'RECEIVABLE')
            
            UNION ALL
            
            SELECT 'EQUITY' as account_category, re.company_id, 'retained_earnings' as account_id, '399999' as account_code, 'Retained Earnings' as account_name, re.retained as calculated_balance
            FROM get_retained_earnings_enterprise(p_company_ids, p_as_of_date) re
        )
        SELECT c.account_category as category, c.company_id, c.account_id, c.account_code, c.account_name, c.calculated_balance as balance FROM Combined c
        WHERE c.calculated_balance != 0
        ORDER BY CASE WHEN c.account_category IN ('ASSET', 'BANK', 'RECEIVABLE') THEN 1 WHEN c.account_category IN ('LIABILITY', 'PAYABLE') THEN 2 ELSE 3 END, c.account_code;
    END;
    $$;
  `);

  await c.end();
}
run();
