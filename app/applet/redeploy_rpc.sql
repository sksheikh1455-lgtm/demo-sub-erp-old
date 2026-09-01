CREATE OR REPLACE FUNCTION public.get_general_ledger_report(p_company_id text, p_start_date date, p_end_date date)
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

    RETURN QUERY EXECUTE $inner_query$
    WITH raw_data AS (
        SELECT 
            ($2::date - 1) AS transaction_date,
            'OB'::text AS type,
            'OPENING_BALANCE'::text AS invoice_bill_num,
            'Opening Balance Brought Forward'::text AS narration,
            ''::text AS partner,
            'System'::text AS "user",
            0::NUMERIC AS amount,
            0::NUMERIC AS paid,
            0::NUMERIC AS due,
            $4 AS cash_impact,
            $4 AS running_balance,
            0 AS group_order

        UNION ALL

        SELECT 
            i.date AS transaction_date,
            'INV'::text AS type,
            COALESCE(i.invoice_number, i.id)::text AS invoice_bill_num,
            ('Invoice ' || COALESCE(i.invoice_number, i.id) || 
            COALESCE(
               (SELECT ' [Paid via ' || string_agg(p.payment_number, ', ') || ']'
                FROM docs_payments p, jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                   ELSE '[]'::jsonb END
                ) e
                WHERE e->>'invoice_id' = i.id),
               ''
            ))::text AS narration,
            COALESCE(c.name, 'Unknown')::text AS partner,
            COALESCE(i.data->>'preparedBy', 'System')::text AS "user",
            COALESCE(i.total, 0)::numeric AS amount,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(i.total, 0)
                ELSE (COALESCE(i.total, 0) - CASE WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 ELSE COALESCE((i.data->>'due')::numeric, i.total) END)
            END)::numeric AS paid,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 
                ELSE COALESCE((i.data->>'due')::numeric, i.total) 
            END)::numeric AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = i.data->>'journalEntryId' AND a.code = '100100'), 0)::numeric AS cash_impact,
            0::NUMERIC AS running_balance,
            1 AS group_order
        FROM docs_invoices i
        LEFT JOIN docs_contacts c ON c.id = i.customer_id
        WHERE i.company_id = $1 
          AND i.date >= $2 AND i.date <= $3
          AND i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')

        UNION ALL

        SELECT 
            cn.date AS transaction_date,
            'CREDIT_NOTE'::text AS type,
            COALESCE(cn.credit_note_number, cn.id)::text AS invoice_bill_num,
            ('Credit Note ' || COALESCE(cn.credit_note_number, cn.id))::text AS narration,
            COALESCE(c.name, 'Unknown')::text AS partner,
            COALESCE(cn.data->>'preparedBy', 'System')::text AS "user",
            COALESCE(cn.total, 0)::numeric AS amount,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN -COALESCE(cn.total, 0)
                WHEN cn.status = 'CLOSED' THEN COALESCE(cn.total, 0) 
                ELSE COALESCE(cn.total, 0) - COALESCE((cn.data->>'due')::numeric, cn.total) 
            END)::numeric AS paid,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN cn.status = 'CLOSED' THEN 0 
                ELSE COALESCE((cn.data->>'due')::numeric, cn.total) 
            END)::numeric AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = cn.data->>'journalEntryId' AND a.code = '100100'), 0)::numeric AS cash_impact,
            0::NUMERIC AS running_balance,
            2 AS group_order
        FROM docs_credit_notes cn
        LEFT JOIN docs_contacts c ON c.id = cn.customer_id
        WHERE cn.company_id = $1 
          AND cn.date >= $2 AND cn.date <= $3
          AND cn.status IN ('POSTED', 'CLOSED')

        UNION ALL

        SELECT 
            b.date AS transaction_date,
            'BILL'::text AS type,
            COALESCE(b.bill_number, b.id)::text AS invoice_bill_num,
            ('Bill ' || COALESCE(b.bill_number, b.id) || 
            COALESCE(
               (SELECT ' [Paid via ' || string_agg(p.payment_number, ', ') || ']'
                FROM docs_payments p, jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills 
                   ELSE '[]'::jsonb END
                ) e
                WHERE e->>'bill_id' = b.id),
               ''
            ))::text AS narration,
            COALESCE(c.name, 'Unknown')::text AS partner,
            COALESCE(b.data->>'preparedBy', 'System')::text AS "user",
            COALESCE(b.total, 0)::numeric AS amount,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(b.total, 0)
                ELSE (COALESCE(b.total, 0) - CASE WHEN b.status = 'PAID' THEN 0 ELSE COALESCE((b.data->>'due')::numeric, b.total) END)
            END)::numeric AS paid,
            (CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN b.status = 'PAID' THEN 0 
                ELSE COALESCE((b.data->>'due')::numeric, b.total) 
            END)::numeric AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = COALESCE(b.journal_entry_id, b.data->>'journalEntryId') AND a.code = '100100'), 0)::numeric AS cash_impact,
            0::NUMERIC AS running_balance,
            3 AS group_order
        FROM docs_bills b
        LEFT JOIN docs_contacts c ON c.id = b.vendor_id
        WHERE b.company_id = $1 
          AND b.date >= $2 AND b.date <= $3
          AND b.status IN ('POSTED', 'PAID', 'PARTIAL')

        UNION ALL

        SELECT 
            p.date AS transaction_date,
            p.type::text AS type,
            COALESCE(p.payment_number, p.id)::text AS invoice_bill_num,
            (CASE WHEN (
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
                ) || ']'
                ELSE 'Misc Settlement ' || COALESCE(p.payment_number, p.id) END)::text AS narration,
            
            COALESCE((
               SELECT c.name 
               FROM docs_contacts c 
               WHERE c.id = p.contact_id
               LIMIT 1
            ), 'Unknown')::text AS partner,
            
            COALESCE(p.data->>'preparedBy', 'System')::text AS "user",
            COALESCE(p.amount, 0)::numeric AS amount,
            0::NUMERIC AS paid,
            0::NUMERIC AS due,
            COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE jl.journal_id = p.data->>'journalEntryId' AND a.code = '100100'), 0)::numeric AS cash_impact,
            0::NUMERIC AS running_balance,
            4 AS group_order
        FROM docs_payments p
        WHERE p.company_id = $1
          AND p.date >= $2 AND p.date <= $3
          AND p.status = 'POSTED'

        UNION ALL

        SELECT 
            j.date AS transaction_date,
            'JOURNAL'::text AS type,
            COALESCE(j.journal_number, j.id)::text AS invoice_bill_num,
            ('Journal Entry ' || COALESCE(j.journal_number, j.id))::text AS narration,
            'Various'::text AS partner,
            'System/User'::text AS "user",
            0::NUMERIC AS amount,
            0::NUMERIC AS paid,
            0::NUMERIC AS due,
            COALESCE(SUM(jl.debit - jl.credit), 0)::numeric AS cash_impact,
            0::NUMERIC AS running_balance,
            5 AS group_order
        FROM docs_journals j
        JOIN docs_journal_lines jl ON jl.journal_id = j.id
        JOIN docs_accounts a ON a.id = jl.account_id
        WHERE j.company_id = $1
          AND j.date >= $2 AND j.date <= $3
          AND j.status = 'POSTED'
          AND a.code = '100100'
          AND j.id NOT IN (
              SELECT COALESCE(data->>'journalEntryId', '') FROM docs_invoices WHERE company_id = $1
              UNION ALL
              SELECT COALESCE(data->>'journalEntryId', '') FROM docs_credit_notes WHERE company_id = $1
              UNION ALL
              SELECT COALESCE(journal_entry_id, data->>'journalEntryId') FROM docs_bills WHERE company_id = $1 AND COALESCE(journal_entry_id, data->>'journalEntryId') IS NOT NULL
              UNION ALL
              SELECT COALESCE(data->>'journalEntryId', '') FROM docs_payments WHERE company_id = $1
          )
        GROUP BY j.id, j.date, j.journal_number
    )
    SELECT 
        transaction_date::date, 
        type::text, 
        invoice_bill_num::text, 
        narration::text, 
        partner::text, 
        "user"::text, 
        amount::numeric, 
        paid::numeric, 
        due::numeric, 
        cash_impact::numeric, 
        running_balance::numeric AS balance 
    FROM raw_data ORDER BY transaction_date, group_order, invoice_bill_num;
    $inner_query$ USING p_company_id, p_start_date, p_end_date, v_opening_balance;
END;
$function$;
