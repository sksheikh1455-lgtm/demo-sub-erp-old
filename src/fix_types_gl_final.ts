import { Client } from 'pg';

const sql = `
CREATE OR REPLACE FUNCTION public.get_general_ledger_report(p_company_id text, p_start_date date, p_end_date date)
 RETURNS TABLE(transaction_date date, type text, invoice_bill_num text, narration text, partner text, "user" text, amount numeric, paid numeric, due numeric, cash_impact numeric, balance numeric)
 LANGUAGE plpgsql
AS $$
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
            (p_start_date - 1) AS transaction_date,
            'OB' AS type,
            'OPENING_BALANCE' AS invoice_bill_num,
            'Opening Balance Brought Forward'::TEXT AS narration,
            '---' AS partner,
            'System' AS "user",
            0::NUMERIC AS amount,
            0::NUMERIC AS paid,
            0::NUMERIC AS due,
            v_opening_balance AS cash_impact,
            v_opening_balance AS running_balance,
            0 AS group_order

        UNION ALL

        SELECT 
            i.date AS transaction_date,
            'INV' AS type,
            COALESCE(i.invoice_number, i.id) AS invoice_bill_num,
            'Invoice ' || COALESCE(i.invoice_number, i.id) || 
            COALESCE(
               (SELECT ' [Paid via ' || string_agg(p.payment_number, ', ') || ']'
                FROM docs_payments p, jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices ELSE '[]'::jsonb END
                ) ai 
                WHERE ai->>'invoiceId' = i.id::text 
                  AND p.status = 'POSTED'), ''
            ) AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(i.data->>'preparedBy', 'System') AS "user",
            COALESCE(i.total, 0) AS amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(i.total, 0)
                ELSE (COALESCE(i.total, 0) - CASE WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 ELSE COALESCE((i.data->>'due')::numeric, i.total) END)
            END AS paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 
                ELSE COALESCE((i.data->>'due')::numeric, i.total) 
            END AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(i.journal_entry_id, i.data->>'journalEntryId') AND a.code = '100100'), 0) AS cash_impact,
            0::NUMERIC AS running_balance,
            1 AS group_order
        FROM docs_invoices i
        LEFT JOIN docs_contacts c ON c.id = i.customer_id
        WHERE i.company_id = p_company_id 
          AND i.date >= p_start_date AND i.date <= p_end_date
          AND i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')

        UNION ALL

        SELECT 
            cn.date AS transaction_date,
            'CREDIT_NOTE' AS type,
            COALESCE(cn.credit_note_number, cn.id) AS invoice_bill_num,
            'Credit Note ' || COALESCE(cn.credit_note_number, cn.id) AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(cn.data->>'preparedBy', 'System') AS "user",
            COALESCE(cn.total, 0) AS amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN -COALESCE(cn.total, 0)
                WHEN cn.status = 'CLOSED' THEN COALESCE(cn.total, 0) 
                ELSE COALESCE(cn.total, 0) - COALESCE((cn.data->>'due')::numeric, cn.total) 
            END AS paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN cn.status = 'CLOSED' THEN 0 
                ELSE COALESCE((cn.data->>'due')::numeric, cn.total) 
            END AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = cn.data->>'journalEntryId' AND a.code = '100100'), 0) AS cash_impact,
            0::NUMERIC AS running_balance,
            2 AS group_order
        FROM docs_credit_notes cn
        LEFT JOIN docs_contacts c ON c.id = cn.customer_id
        WHERE cn.company_id = p_company_id 
          AND cn.date >= p_start_date AND cn.date <= p_end_date
          AND cn.status IN ('POSTED', 'CLOSED')

        UNION ALL

        SELECT 
            b.date AS transaction_date,
            'BILL' AS type,
            COALESCE(b.bill_number, b.id) AS invoice_bill_num,
            'Bill ' || COALESCE(b.bill_number, b.id) || 
            COALESCE(
               (SELECT ' [Paid via ' || string_agg(p.payment_number, ', ') || ']'
                FROM docs_payments p, jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills ELSE '[]'::jsonb END
                ) ai 
                WHERE (ai->>'invoiceId' = b.id::text OR ai->>'billId' = b.id::text)
                  AND p.status = 'POSTED'), ''
            ) AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(b.data->>'preparedBy', 'System') AS "user",
            COALESCE(b.total, 0) AS amount,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(b.total, 0)
                ELSE (COALESCE(b.total, 0) - CASE WHEN b.status = 'PAID' THEN 0 ELSE COALESCE((b.data->>'due')::numeric, b.total) END)
            END AS paid,
            CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN b.status = 'PAID' THEN 0 
                ELSE COALESCE((b.data->>'due')::numeric, b.total) 
            END AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(b.journal_entry_id, b.data->>'journalEntryId') AND a.code = '100100'), 0) AS cash_impact,
            0::NUMERIC AS running_balance,
            3 AS group_order
        FROM docs_bills b
        LEFT JOIN docs_contacts c ON c.id = b.vendor_id
        WHERE b.company_id = p_company_id 
          AND b.date >= p_start_date AND b.date <= p_end_date
          AND b.status IN ('POSTED', 'PAID', 'PARTIAL')

        UNION ALL

        SELECT 
            p.date AS transaction_date,
            p.type::text AS type,
            COALESCE(p.payment_number, p.id) AS invoice_bill_num,
            CASE WHEN (
                    SELECT string_agg(COALESCE(ai->>'invoiceNumber', ai->>'billNumber', ai->>'invoiceId'), ', ') 
                    FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                            WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills 
                            ELSE '[]'::jsonb END
                    ) ai 
                ) IS NOT NULL THEN
                'Settlement [' || (
                    SELECT string_agg(COALESCE(ai->>'invoiceNumber', ai->>'billNumber', ai->>'invoiceId'), ', ') 
                    FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                            WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills 
                            ELSE '[]'::jsonb END
                    ) ai 
                ) || ']'            ELSE
                COALESCE(p.data->>'narration', 'Payment ' || COALESCE(p.payment_number, p.id))
            END AS narration,
            COALESCE(c.name, 'Unknown') AS partner,
            COALESCE(p.data->>'preparedBy', 'System') AS "user",
            COALESCE(p.amount, 0) AS amount,
            COALESCE(p.amount, 0) AS paid,
            0::NUMERIC AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(p.data->>'journalEntryId', ('JE-' || CASE WHEN p.type IN ('RECEIPT','COLLECTION','REFUND') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', ''))) 
             AND a.code = '100100'), 0) AS cash_impact,
            0::NUMERIC AS running_balance,
            CASE WHEN p.type IN ('RECEIPT', 'COLLECTION') THEN 2 ELSE 3 END AS group_order
        FROM docs_payments p
        LEFT JOIN docs_contacts c ON c.id = p.contact_id
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date AND p.date <= p_end_date
          AND p.status = 'POSTED'

        UNION ALL 
        
        SELECT 
            j.date AS transaction_date,
            j.journal_type::text AS type,
            COALESCE(j.reference_number, j.id) AS invoice_bill_num,
            COALESCE(j.data->>'narration', j.description, 
    CASE 
        WHEN j.journal_type = 'EXPENSE' THEN 'Expense: ' || COALESCE((SELECT string_agg(a.name, ', ') FROM docs_journal_lines jl JOIN docs_accounts a ON a.id = jl.account_id WHERE jl.journal_id = j.id AND jl.debit > 0), 'General')
        ELSE 'Journal Entry' 
    END
) AS narration,
            '---' AS partner,
            COALESCE(j.data->>'preparedBy', 'System') AS "user",
            (SELECT SUM(debit) FROM docs_journal_lines WHERE journal_id = j.id) AS amount,
            (SELECT SUM(debit) FROM docs_journal_lines WHERE journal_id = j.id) AS paid,
            0::NUMERIC AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = j.id AND a.code = '100100'), 0) AS cash_impact,
            0::NUMERIC AS running_balance,
            4 AS group_order
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
          AND NOT EXISTS (
              SELECT 1 FROM docs_payments dp WHERE COALESCE(dp.data->>'journalEntryId', ('JE-' || CASE WHEN dp.type IN ('RECEIPT','COLLECTION','REFUND') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(dp.id), 'PAY-', ''), 'PAY-', ''))) = j.id AND dp.status != 'POSTED'
          )
    ),
    ordered_data AS (
        SELECT *,
               SUM(raw_data.cash_impact) OVER (ORDER BY raw_data.transaction_date, raw_data.group_order, NULLIF(regexp_replace(raw_data.invoice_bill_num, '[^0-9]', '', 'g'), '')::numeric ROWS UNBOUNDED PRECEDING) AS computed_balance
        FROM raw_data
    )
    SELECT 
        ordered_data.transaction_date,
        ordered_data.type,
        ordered_data.invoice_bill_num,
        ordered_data.narration,
        ordered_data.partner,
        ordered_data."user",
        ordered_data.amount,
        ordered_data.paid,
        ordered_data.due,
        ordered_data.cash_impact,
        ordered_data.computed_balance AS balance
    FROM ordered_data
    ORDER BY ordered_data.transaction_date, ordered_data.group_order, NULLIF(regexp_replace(ordered_data.invoice_bill_num, '[^0-9]', '', 'g'), '')::numeric;
END;
$$;
`;

const c = new Client(process.env.SUPABASE_DB_URL);
c.connect().then(async () => {
    try {
        await c.query(sql);
        console.log('Success');
    } catch(e) { console.error('Error:', e); }
    c.end();
});
