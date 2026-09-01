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
        -- 0. OPENING BALANCE
        SELECT 
            p_start_date AS transaction_date,
            'OB'::TEXT AS type,
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

        -- 1. INVOICES (cash_impact = 0)
        SELECT 
            i.date AS transaction_date,
            'INV' AS type,
            COALESCE(i.invoice_number, i.id) AS invoice_bill_num,
            'Sales' AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(i.data->>'preparedBy', 'System') AS "user",
            COALESCE(i.total, 0) AS amount,
            COALESCE(i.total, 0) - COALESCE((i.data->>'due')::numeric, i.total) AS paid,
            COALESCE((i.data->>'due')::numeric, i.total) AS due,
            0::NUMERIC AS cash_impact,
            0::NUMERIC AS balance,
            1 AS group_order
        FROM docs_invoices i
        LEFT JOIN docs_contacts c ON c.id = i.customer_id
        WHERE i.company_id = p_company_id 
          AND i.date >= p_start_date AND i.date <= p_end_date
          AND i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')

        UNION ALL

        -- 2. BILLS (cash_impact = 0)
        SELECT 
            b.date AS transaction_date,
            'BILL' AS type,
            COALESCE(b.bill_number, b.id) AS invoice_bill_num,
            'Purchase' AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(b.data->>'preparedBy', 'System') AS "user",
            COALESCE(b.total, 0) AS amount,
            COALESCE(b.total, 0) - COALESCE((b.data->>'due')::numeric, b.total) AS paid,
            COALESCE((b.data->>'due')::numeric, b.total) AS due,
            0::NUMERIC AS cash_impact,
            0::NUMERIC AS balance,
            1 AS group_order
        FROM docs_bills b
        LEFT JOIN docs_contacts c ON c.id = b.vendor_id
        WHERE b.company_id = p_company_id 
          AND b.date >= p_start_date AND b.date <= p_end_date
          AND b.status IN ('POSTED', 'PAID', 'PARTIAL')

        UNION ALL

        -- 3. CREDIT NOTES (cash_impact = 0)
        SELECT 
            cn.date AS transaction_date,
            'CREDIT_NOTE' AS type,
            COALESCE(cn.credit_note_number, cn.id) AS invoice_bill_num,
            'Credit Note' AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(cn.data->>'preparedBy', 'System') AS "user",
            COALESCE(cn.total, 0) AS amount,
            COALESCE(cn.total, 0) - COALESCE((cn.data->>'due')::numeric, cn.total) AS paid,
            COALESCE((cn.data->>'due')::numeric, cn.total) AS due,
            0::NUMERIC AS cash_impact,
            0::NUMERIC AS balance,
            1 AS group_order
        FROM docs_credit_notes cn
        LEFT JOIN docs_contacts c ON c.id = cn.customer_id
        WHERE cn.company_id = p_company_id 
          AND cn.date >= p_start_date AND cn.date <= p_end_date
          AND cn.status IN ('POSTED', 'CLOSED')

        UNION ALL

        -- 4. CASH (100100 lines)
        SELECT 
            j.date AS transaction_date,
            CASE 
               WHEN j.journal_type IN ('CUST_PAY', 'CPAY', 'RECEIPT', 'COLLECTION') THEN 'RECEIPT'
               WHEN j.journal_type IN ('VEND_PAY', 'VPAY', 'PAYMENT') THEN 'PAYMENT'
               WHEN j.journal_type = 'INV' THEN 'RECEIPT'
               WHEN j.journal_type = 'BILL' THEN 'PAYMENT'
               WHEN j.journal_type = 'CREDIT_NOTE' THEN 'REFUND'
               ELSE 'JOURNAL'
            END AS type,
            COALESCE(j.reference_number, j.reference, j.journal_number, j.id) AS invoice_bill_num,
            COALESCE(jl.description, j.description, 'Journal Entry ' || COALESCE(j.journal_number, j.id)) AS narration,
            COALESCE(
              c.name,
              (SELECT c_inner.name FROM docs_contacts c_inner WHERE c_inner.id = jl.contact_id LIMIT 1),
              (SELECT c_inner.name FROM docs_invoices i LEFT JOIN docs_contacts c_inner ON i.customer_id = c_inner.id WHERE COALESCE(i.journal_entry_id, i.data->>'journalEntryId', 'JE-' || UPPER(REPLACE(i.id, 'INV-', ''))) = j.id OR 'JE-CPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || i.id, 'PAY-', ''), 'PAY-', '')) = j.id LIMIT 1),
              (SELECT c_inner.name FROM docs_bills b LEFT JOIN docs_contacts c_inner ON b.vendor_id = c_inner.id WHERE COALESCE(b.journal_entry_id, b.data->>'journalEntryId') = j.id OR 'JE-VPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || b.id, 'PAY-', ''), 'PAY-', '')) = j.id LIMIT 1),
              (SELECT c_inner.name FROM docs_payments p LEFT JOIN docs_contacts c_inner ON p.contact_id = c_inner.id WHERE COALESCE(p.data->>'journalEntryId', 'JE-' || CASE WHEN p.type IN ('RECEIPT', 'REFUND', 'COLLECTION') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', '')) = j.id OR j.id = 'PAY-AUTO-' || p.id OR j.id = p.id LIMIT 1),
              'Various'
            ) AS partner,
            COALESCE(u.name, u.username, j.data->>'preparedBy', 'System') AS "user",
            ABS(jl.debit - jl.credit) AS amount,
            ABS(jl.debit - jl.credit) AS paid,
            0::NUMERIC AS due,
            (jl.debit - jl.credit) AS cash_impact,
            0::NUMERIC AS balance,
            2 AS group_order
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
