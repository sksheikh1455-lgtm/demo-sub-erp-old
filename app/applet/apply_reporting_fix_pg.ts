const pg = require('pg');
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query(`
    CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_company_id text, p_as_of_date date DEFAULT CURRENT_DATE)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $function$
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
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_assets
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_as_of_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'BANK', 'RECEIVABLE');

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_liabilities
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_as_of_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('LIABILITY', 'PAYABLE');

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_equity
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_as_of_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) = 'EQUITY';

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_revenue
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date >= v_start_of_month AND j.date <= p_as_of_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME');

        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_expenses
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date >= v_start_of_month AND j.date <= p_as_of_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE');

        v_net_income := v_revenue - v_expenses;

        SELECT array_agg(id) INTO v_cash_acc_ids FROM docs_accounts WHERE (p_company_id IS NULL OR company_id = p_company_id) AND (UPPER(COALESCE(type, data->>'type')) = 'BANK' OR code = '100100' OR name ILIKE '%Cash%');
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_cash_balance FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_as_of_date AND al.account_id = ANY(v_cash_acc_ids);
        SELECT COALESCE(SUM(al.debit), 0) INTO v_cash_in_today FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date = p_as_of_date AND al.account_id = ANY(v_cash_acc_ids);
        SELECT COALESCE(SUM(al.credit), 0) INTO v_cash_out_today FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date = p_as_of_date AND al.account_id = ANY(v_cash_acc_ids);

        v_result := jsonb_build_object('assets', v_assets, 'liabilities', v_liabilities, 'equity', v_equity, 'revenue', v_revenue, 'expenses', v_expenses, 'netIncome', v_net_income, 'cashBalance', v_cash_balance, 'cashInToday', v_cash_in_today, 'cashOutToday', v_cash_out_today);
        RETURN v_result;
    END;
    $function$;
  `);

  await c.query(`
    CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_company_id text, p_start_date date, p_end_date date)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $function$
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
        v_cash_acc_ids TEXT[];
    BEGIN
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_assets
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_end_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'BANK', 'RECEIVABLE');

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_liabilities
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_end_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('LIABILITY', 'PAYABLE');

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_equity
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_end_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) = 'EQUITY';

        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_revenue
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date >= p_start_date AND j.date <= p_end_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME');

        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_expenses
        FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date >= p_start_date AND j.date <= p_end_date AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE');

        v_net_income := v_revenue - v_expenses;

        SELECT array_agg(id) INTO v_cash_acc_ids FROM docs_accounts WHERE (p_company_id IS NULL OR company_id = p_company_id) AND (UPPER(COALESCE(type, data->>'type')) = 'BANK' OR code = '100100' OR name ILIKE '%Cash%');
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_cash_balance FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date <= p_end_date AND al.account_id = ANY(v_cash_acc_ids);
        SELECT COALESCE(SUM(al.debit), 0) INTO v_cash_in_today FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date = p_end_date AND al.account_id = ANY(v_cash_acc_ids);
        SELECT COALESCE(SUM(al.credit), 0) INTO v_cash_out_today FROM docs_journal_lines al JOIN docs_journals j ON al.journal_id = j.id WHERE (p_company_id IS NULL OR j.company_id = p_company_id) AND j.status = 'POSTED' AND j.date = p_end_date AND al.account_id = ANY(v_cash_acc_ids);

        v_result := jsonb_build_object('assets', v_assets, 'liabilities', v_liabilities, 'equity', v_equity, 'revenue', v_revenue, 'expenses', v_expenses, 'netIncome', v_net_income, 'cashBalance', v_cash_balance, 'cashInToday', v_cash_in_today, 'cashOutToday', v_cash_out_today);
        RETURN v_result;
    END;
    $function$;
  `);

  await c.query(`
    CREATE OR REPLACE FUNCTION public.get_profit_and_loss_enterprise(p_company_ids text[], p_start_date date DEFAULT '1970-01-01'::date, p_end_date date DEFAULT CURRENT_DATE)
    RETURNS TABLE(category text, company_id text, account_id text, account_code text, account_name text, balance numeric)
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
        RETURN QUERY
        SELECT
            UPPER(COALESCE(a.type, a.data->>'type', ''))::TEXT as category,
            j.company_id,
            a.id as account_id,
            a.code as account_code,
            a.name as account_name,
            SUM(
                CASE
                    WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME') THEN jl.credit - jl.debit
                    WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE') THEN jl.debit - jl.credit
                    ELSE 0
                END
            ) as balance
        FROM docs_journal_lines jl
        JOIN docs_journals j ON jl.journal_id = j.id
        JOIN docs_accounts a ON jl.account_id = a.id
        WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
        AND j.status = 'POSTED'
        AND j.date::DATE >= p_start_date
        AND j.date::DATE <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME', 'EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE')
        GROUP BY j.company_id, a.id, a.code, a.name, UPPER(COALESCE(a.type, a.data->>'type', ''))
        HAVING SUM(jl.debit) != SUM(jl.credit)
        ORDER BY CASE 
            WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME') THEN 1 
            ELSE 2 
            END, a.code;
    END;
    $$;
  `);
  
  console.log('Successfully updated PostgreSQL functions!');
  await c.end();
}

run().catch(console.error);
