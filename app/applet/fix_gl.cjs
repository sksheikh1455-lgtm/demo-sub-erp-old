const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL;

const sqlText = `CREATE OR REPLACE FUNCTION public.get_general_ledger_report(p_company_id text, p_start_date date, p_end_date date)
 RETURNS TABLE(transaction_date date, type text, invoice_bill_num text, narration text, partner text, "user" text, amount numeric, paid numeric, due numeric, cash_impact numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC;
BEGIN
    IF NOT public.check_company_access(p_company_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_opening_balance
    FROM docs_journal_lines jl
    JOIN docs_journals j ON j.id = jl.journal_id
    JOIN docs_accounts a ON a.id = jl.account_id
    WHERE jl.company_id = p_company_id 
      AND a.code = '100100'
      AND j.status = 'POSTED'
      AND j.date < p_start_date;

    RETURN QUERY
    WITH raw_data AS (
        SELECT 
            (p_start_date - 1) AS d_transaction_date,
            'OB' AS d_type,
            'OPENING_BALANCE' AS d_invoice_bill_num,
            'Opening Balance Brought Forward'::TEXT AS d_narration,
            '' AS d_partner,
            'System' AS d_user,
            0::NUMERIC AS d_amount,
            0::NUMERIC AS d_paid,
            0::NUMERIC AS d_due,
            v_opening_balance AS d_cash_impact,
            0 AS d_group_order

        UNION ALL

        SELECT 
            i.date AS d_transaction_date,
            'INV' AS d_type,
            COALESCE(i.invoice_number, i.id) AS d_invoice_bill_num,
            'Invoice ' || COALESCE(i.invoice_number, i.id) || 
            COALESCE(
               (SELECT ' [Paid via ' || string_agg(p.payment_number, ', ') || ']'
                FROM docs_payments p, jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                   ELSE '[]'::jsonb END
                ) e
                WHERE e->>'invoiceId' = i.id OR e->>'invoice_id' = i.id),
               ''
            ) AS d_narration,
            COALESCE(c.name, 'Unknown') AS d_partner,
            COALESCE(i.data->>'preparedBy', 'System') AS d_user,
            COALESCE(i.total, 0)::NUMERIC AS d_amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(i.total, 0)
                ELSE (COALESCE(i.total, 0) - CASE WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 ELSE COALESCE((i.data->>'due')::numeric, i.total) END)
            END::NUMERIC AS d_paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 
                ELSE COALESCE((i.data->>'due')::numeric, i.total) 
            END::NUMERIC AS d_due,
            (SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(i.journal_entry_id, i.data->>'journalEntryId') AND a.code = '100100')::NUMERIC AS d_cash_impact,
            1 AS d_group_order
        FROM docs_invoices i
        LEFT JOIN docs_contacts c ON c.id = i.customer_id
        WHERE i.company_id = p_company_id 
          AND i.date >= p_start_date AND i.date <= p_end_date
          AND i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')

        UNION ALL

        SELECT 
            cn.date AS d_transaction_date,
            'CN' AS d_type,
            COALESCE(cn.credit_note_number, cn.id) AS d_invoice_bill_num,
            'Credit Note ' || COALESCE(cn.credit_note_number, cn.id) AS d_narration,
            COALESCE(c.name, 'Unknown') AS d_partner,
            COALESCE(cn.data->>'preparedBy', 'System') AS d_user,
            COALESCE(cn.total, 0)::NUMERIC AS d_amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN -COALESCE(cn.total, 0)
                WHEN cn.status = 'CLOSED' THEN COALESCE(cn.total, 0) 
                ELSE COALESCE(cn.total, 0) - COALESCE((cn.data->>'due')::numeric, cn.total) 
            END::NUMERIC AS d_paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN cn.status = 'CLOSED' THEN 0 
                ELSE COALESCE((cn.data->>'due')::numeric, cn.total) 
            END::NUMERIC AS d_due,
            (SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = cn.data->>'journalEntryId' AND a.code = '100100')::NUMERIC AS d_cash_impact,
            2 AS d_group_order
        FROM docs_credit_notes cn
        LEFT JOIN docs_contacts c ON c.id = cn.customer_id
        WHERE cn.company_id = p_company_id 
          AND cn.date >= p_start_date AND cn.date <= p_end_date
          AND cn.status IN ('POSTED', 'CLOSED')

        UNION ALL

        SELECT 
            b.date AS d_transaction_date,
            'BIL' AS d_type,
            COALESCE(b.bill_number, b.id) AS d_invoice_bill_num,
            'Bill ' || COALESCE(b.bill_number, b.id) AS d_narration,
            COALESCE(c.name, 'Unknown') AS d_partner,
            COALESCE(b.data->>'preparedBy', 'System') AS d_user,
            COALESCE(b.total, 0)::NUMERIC AS d_amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(b.total, 0)
                ELSE (COALESCE(b.total, 0) - CASE WHEN b.status = 'PAID' THEN 0 ELSE COALESCE((b.data->>'due')::numeric, b.total) END)
            END::NUMERIC AS d_paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN b.status = 'PAID' THEN 0 
                ELSE COALESCE((b.data->>'due')::numeric, b.total) 
            END::NUMERIC AS d_due,
            (SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(b.journal_entry_id, b.data->>'journalEntryId') AND a.code = '100100')::NUMERIC AS d_cash_impact,
            3 AS d_group_order
        FROM docs_bills b
        LEFT JOIN docs_contacts c ON c.id = b.vendor_id
        WHERE b.company_id = p_company_id 
          AND b.date >= p_start_date AND b.date <= p_end_date
          AND b.status IN ('POSTED', 'PAID', 'PARTIAL')

        UNION ALL

        SELECT 
            p.date AS d_transaction_date,
            'PAY' AS d_type,
            COALESCE(p.payment_number, p.id) AS d_invoice_bill_num,
            COALESCE(p.data->>'narration', p.reference, 'Payment ' || COALESCE(p.payment_number, p.id)) AS d_narration,
            COALESCE(c.name, 'Unknown') AS d_partner,
            COALESCE(p.data->>'preparedBy', 'System') AS d_user,
            COALESCE(p.amount, 0)::NUMERIC AS d_amount,
            COALESCE(p.amount, 0)::NUMERIC AS d_paid,
            0::NUMERIC AS d_due,
            (SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(p.data->>'journalEntryId', ('JE-' || CASE WHEN p.type IN ('RECEIPT','COLLECTION','REFUND') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', ''))) 
             AND a.code = '100100')::NUMERIC AS d_cash_impact,
            CASE WHEN p.type IN ('RECEIPT', 'COLLECTION') THEN 2 ELSE 3 END AS d_group_order
        FROM docs_payments p
        LEFT JOIN docs_contacts c ON c.id = p.contact_id
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date AND p.date <= p_end_date
          AND p.status = 'POSTED'

        UNION ALL 
        
        SELECT 
            j.date AS d_transaction_date,
            'JEN' AS d_type,
            COALESCE(j.reference_number, j.id) AS d_invoice_bill_num,
            COALESCE(j.data->>'narration', j.description, 
                CASE 
                    WHEN j.journal_type = 'EXPENSE' THEN 'Expense: ' || COALESCE((SELECT string_agg(a.name, ', ') FROM docs_journal_lines jl JOIN docs_accounts a ON a.id = jl.account_id WHERE jl.journal_id = j.id AND jl.debit > 0), 'General')
                    ELSE 'Journal Entry' 
                END
            ) AS d_narration,
            '---'::TEXT AS d_partner,
            COALESCE(j.data->>'preparedBy', 'System') AS d_user,
            (SELECT COALESCE(SUM(debit), 0)::NUMERIC FROM docs_journal_lines WHERE journal_id = j.id AND account_id != 'comp-1-100100') AS d_amount,
            (SELECT COALESCE(SUM(debit), 0)::NUMERIC FROM docs_journal_lines WHERE journal_id = j.id AND account_id != 'comp-1-100100') AS d_paid,
            0::NUMERIC AS d_due,
            (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::NUMERIC 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = j.id AND a.code = '100100') AS d_cash_impact,
            4 AS d_group_order
        FROM docs_journals j
        WHERE j.company_id = p_company_id 
          AND j.date >= p_start_date AND j.date <= p_end_date
          AND j.status = 'POSTED'
          AND COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = j.id AND a.code = '100100'), 0) != 0
          AND NOT EXISTS (
              SELECT 1 FROM docs_invoices di WHERE COALESCE(di.journal_entry_id, di.data->>'journalEntryId') = j.id AND di.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')
          )
          AND NOT EXISTS (
              SELECT 1 FROM docs_bills db WHERE COALESCE(db.journal_entry_id, db.data->>'journalEntryId') = j.id AND db.status IN ('POSTED', 'PAID', 'PARTIAL')
          )
          AND NOT EXISTS (
              SELECT 1 FROM docs_credit_notes dcn WHERE dcn.data->>'journalEntryId' = j.id AND dcn.status IN ('POSTED', 'CLOSED')
          )
          AND NOT EXISTS (
              SELECT 1 FROM docs_payments dp WHERE COALESCE(dp.data->>'journalEntryId', ('JE-' || CASE WHEN dp.type IN ('RECEIPT','COLLECTION','REFUND') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(dp.id), 'PAY-', ''), 'PAY-', ''))) = j.id AND dp.status = 'POSTED'
          )
    ),
    ordered_data AS (
        SELECT rd.d_transaction_date, rd.d_type, rd.d_invoice_bill_num, rd.d_narration, rd.d_partner, rd.d_user, rd.d_amount, rd.d_paid, rd.d_due, rd.d_cash_impact, rd.d_group_order,
               SUM(rd.d_cash_impact) OVER (ORDER BY rd.d_transaction_date, rd.d_group_order, NULLIF(regexp_replace(rd.d_invoice_bill_num, '[^0-9]', '', 'g'), '')::numeric ROWS UNBOUNDED PRECEDING) AS d_computed_balance
        FROM raw_data rd
    )
    SELECT 
        od.d_transaction_date AS transaction_date,
        od.d_type AS type,
        od.d_invoice_bill_num AS invoice_bill_num,
        od.d_narration AS narration,
        od.d_partner AS partner,
        od.d_user AS "user",
        od.d_amount AS amount,
        od.d_paid AS paid,
        od.d_due AS due,
        od.d_cash_impact AS cash_impact,
        od.d_computed_balance AS balance
    FROM ordered_data od
    ORDER BY od.d_transaction_date, od.d_group_order, NULLIF(regexp_replace(od.d_invoice_bill_num, '[^0-9]', '', 'g'), '')::numeric;
END;
$function$;`;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(sqlText);
  await client.query(`GRANT EXECUTE ON FUNCTION public.get_general_ledger_report(text, date, date) TO authenticated, anon;`);
  await client.query(`NOTIFY pgrst, 'reload schema';`);
  
  console.log('SQL Executed! Fixed type mapping and expense categories');
  await client.end();
}
main();
