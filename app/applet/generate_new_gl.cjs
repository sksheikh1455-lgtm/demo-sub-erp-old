const pg = require('pg');
async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();
  const sql = `
CREATE OR REPLACE FUNCTION public.get_general_ledger_report(p_company_id text, p_start_date date DEFAULT '1970-01-01'::date, p_end_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(transaction_date date, type text, invoice_bill_num text, narration text, partner text, "user" text, amount numeric, paid numeric, due numeric, cash_impact numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_opening_balance
    FROM docs_journal_lines jl
    JOIN docs_journals j ON jl.journal_id = j.id
    JOIN docs_accounts a ON jl.account_id = a.id
    WHERE j.company_id = p_company_id
      AND a.code = '100100'
      AND j.status = 'POSTED'
      AND j.date < p_start_date;

    RETURN QUERY
    WITH raw_data AS (
        SELECT 
            p_start_date AS transaction_date,
            'OPENING'::TEXT AS type,
            'Opening Balance'::TEXT AS invoice_bill_num,
            'Opening Balance'::TEXT AS narration,
            ''::TEXT AS partner,
            ''::TEXT AS "user",
            0::NUMERIC AS amount,
            0::NUMERIC AS paid,
            0::NUMERIC AS due,
            v_opening_balance AS cash_impact,
            v_opening_balance AS balance,
            0 AS group_order

        UNION ALL

        SELECT 
            j.date AS transaction_date,
            CASE 
               WHEN j.journal_type IN ('CUST_PAY', 'CPAY', 'RECEIPT', 'COLLECTION') THEN 'RECEIPT'
               WHEN j.journal_type IN ('VEND_PAY', 'VPAY', 'PAYMENT') THEN 'PAYMENT'
               WHEN j.journal_type = 'INV' THEN 'INVOICE'
               WHEN j.journal_type = 'BILL' THEN 'BILL'
               WHEN j.journal_type = 'CREDIT_NOTE' THEN 'CREDIT_NOTE'
               ELSE 'JOURNAL'
            END AS type,
            COALESCE(j.reference_number, j.reference, j.journal_number, j.id) AS invoice_bill_num,
            COALESCE(jl.description, j.description, 'Journal Entry ' || COALESCE(j.journal_number, j.id)) AS narration,
            COALESCE(
              c.name,
              (SELECT c_inner.name FROM docs_contacts c_inner WHERE c_inner.id = jl.contact_id LIMIT 1),
              (SELECT c_inner.name FROM docs_invoices i LEFT JOIN docs_contacts c_inner ON i.customer_id = c_inner.id WHERE COALESCE(i.journal_entry_id, i.data->>'journalEntryId', 'JE-' || UPPER(REPLACE(i.id, 'INV-', ''))) = j.id LIMIT 1),
              (SELECT c_inner.name FROM docs_bills b LEFT JOIN docs_contacts c_inner ON b.vendor_id = c_inner.id WHERE COALESCE(b.journal_entry_id, b.data->>'journalEntryId') = j.id LIMIT 1),
              (SELECT c_inner.name FROM docs_payments p LEFT JOIN docs_contacts c_inner ON p.contact_id = c_inner.id WHERE COALESCE(p.data->>'journalEntryId', 'JE-' || CASE WHEN p.type IN ('RECEIPT', 'REFUND', 'COLLECTION') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', '')) = j.id OR j.id = 'PAY-AUTO-' || p.id OR j.id = p.id LIMIT 1),
              'Various'
            ) AS partner,
            COALESCE(u.name, u.username, j.data->>'preparedBy', 'System') AS "user",
            ABS(jl.debit - jl.credit) AS amount,
            ABS(jl.debit - jl.credit) AS paid,
            0::NUMERIC AS due,
            SUM(jl.debit - jl.credit) AS cash_impact,
            0::NUMERIC AS balance,
            1 AS group_order
        FROM docs_journals j
        JOIN docs_journal_lines jl ON jl.journal_id = j.id
        JOIN docs_accounts a ON jl.account_id = a.id
        LEFT JOIN docs_users u ON u.id = j.created_by_id
        LEFT JOIN docs_companies c ON j.company_id = c.id
        WHERE j.company_id = p_company_id
          AND a.code = '100100'
          AND j.status = 'POSTED'
          AND j.date >= p_start_date
          AND j.date <= p_end_date
        GROUP BY j.id, j.date, j.journal_type, j.reference_number, j.reference, j.description, u.name, u.username, j.data->>'preparedBy', jl.description, jl.contact_id, c.name, jl.debit, jl.credit
    )
    SELECT 
        rd.transaction_date, 
        rd.type, 
        rd.invoice_bill_num, 
        rd.narration, 
        rd.partner, 
        rd."user", 
        rd.amount, 
        rd.paid, 
        rd.due, 
        rd.cash_impact, 
        (SUM(rd.cash_impact) OVER (ORDER BY rd.transaction_date, rd.group_order, rd.invoice_bill_num))::NUMERIC AS balance 
    FROM raw_data rd 
    ORDER BY rd.transaction_date, rd.group_order, rd.invoice_bill_num;
END;
$function$;
  `;
  await c.query(sql);
  console.log('Function updated');
  await c.end();
}
run();
