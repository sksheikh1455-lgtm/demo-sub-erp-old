const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
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
        -- Asset total
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_assets
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_as_of_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'BANK', 'RECEIVABLE');

        -- Liability total
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_liabilities
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_as_of_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('LIABILITY', 'PAYABLE');

        -- Equity total
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_equity
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_as_of_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) = 'EQUITY';

        -- Revenue (Period: Start of month to today)
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_revenue
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date >= v_start_of_month AND j.date <= p_as_of_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME');

        -- Expenses (Period: Start of month to today)
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_expenses
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date >= v_start_of_month AND j.date <= p_as_of_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE');

        v_net_income := v_revenue - v_expenses;

        -- Cash Balance (Accounts identified as BANK or explicitly named Cash)
        SELECT array_agg(id) INTO v_cash_acc_ids
        FROM docs_accounts
        WHERE (p_company_id IS NULL OR company_id = p_company_id)
        AND (UPPER(COALESCE(type, data->>'type')) = 'BANK' OR code = '100100' OR name ILIKE '%Cash%');

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
    $function$;
  `);

  await prisma.$executeRawUnsafe(`
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
        -- Asset total (as of end date)
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_assets
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('ASSET', 'BANK', 'RECEIVABLE');

        -- Liability total (as of end date)
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_liabilities
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('LIABILITY', 'PAYABLE');

        -- Equity total (as of end date)
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_equity
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) = 'EQUITY';

        -- Revenue (Period: start to end)
        SELECT COALESCE(SUM(al.credit - al.debit), 0) INTO v_revenue
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date >= p_start_date AND j.date <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME');

        -- Expenses (Period: start to end)
        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_expenses
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        JOIN docs_accounts a ON al.account_id = a.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date >= p_start_date AND j.date <= p_end_date
        AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE');

        v_net_income := v_revenue - v_expenses;

        -- Cash Balance (Accounts identified as BANK or explicitly named Cash) (as of end_date)
        SELECT array_agg(id) INTO v_cash_acc_ids
        FROM docs_accounts
        WHERE (p_company_id IS NULL OR company_id = p_company_id)
        AND (UPPER(COALESCE(type, data->>'type')) = 'BANK' OR code = '100100' OR name ILIKE '%Cash%');

        SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_cash_balance
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date <= p_end_date
        AND al.account_id = ANY(v_cash_acc_ids);

        -- Cash In Today
        SELECT COALESCE(SUM(al.debit), 0) INTO v_cash_in_today
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date = p_end_date
        AND al.account_id = ANY(v_cash_acc_ids);

        -- Cash Out Today
        SELECT COALESCE(SUM(al.credit), 0) INTO v_cash_out_today
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
        AND j.status = 'POSTED'
        AND j.date = p_end_date
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
    $function$;
  `);

  await prisma.$executeRawUnsafe(`
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
                    WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME') THEN COALESCE(pa.p_credit, 0) - COALESCE(pa.p_debit, 0)
                    WHEN UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE') THEN COALESCE(pa.p_debit, 0) - COALESCE(pa.p_credit, 0)
                    ELSE 0
                END as calculated_balance
            FROM docs_accounts a
            JOIN PeriodActivity pa ON a.id = pa.account_id
            WHERE (p_company_ids IS NULL OR a.company_id = ANY(p_company_ids))
            AND UPPER(COALESCE(a.type, a.data->>'type', '')) IN ('INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE', 'OTHER_INCOME', 'EXPENSE', 'COGS', 'COST_OF_SALES', 'COST_OF_REVENUE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE')
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
  `);
}

main().then(() => { console.log('Successfully updated PostgreSQL functions!'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
