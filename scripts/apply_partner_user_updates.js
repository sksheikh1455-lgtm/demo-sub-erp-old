import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Applying refined DB updates for General Ledger and Partner Ledger logic...");

  // 1. Update create_journal_entry function to save created_by_id
  const sqlCreateJournalEntry = `
CREATE OR REPLACE FUNCTION create_journal_entry(p_journal_data JSONB, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_status TEXT;
    v_effective_company_id TEXT;
    v_created_by_id TEXT;
BEGIN
    v_journal_id := p_journal_data->>'id';
    v_status := p_journal_data->>'status';
    v_effective_company_id := COALESCE(p_company_id, p_journal_data->>'companyId');
    v_created_by_id := COALESCE(p_journal_data->>'createdById', p_journal_data->>'authorId', p_journal_data->>'preparedBy');

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    -- Only for non-new journals
    IF (p_journal_data->>'reference' IS NOT NULL AND p_journal_data->>'reference' <> 'NEW' AND p_journal_data->>'reference' NOT LIKE 'DRAFT-%') THEN
        SELECT id INTO v_journal_id FROM docs_journals 
        WHERE company_id = v_effective_company_id AND reference_number = p_journal_data->>'reference' LIMIT 1;
        
        IF v_journal_id IS NULL THEN 
            v_journal_id := p_journal_data->>'id';
        END IF;
    END IF;

    -- 1. Validate Balance if POSTED
    IF v_status = 'POSTED' THEN
        FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
            v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::numeric, 0);
            v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
        END LOOP;
        
        IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Journal entry is not balanced');
        END IF;
    END IF;

    -- 1. Ensure header exists (to satisfy FK for lines)
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at, created_by_id)
    VALUES (
        v_journal_id, 
        v_effective_company_id, 
        (p_journal_data->>'date')::date, 
        COALESCE((p_journal_data->>'date')::date, NOW()::date), 
        COALESCE(p_journal_data->>'journalType', 'MISC'), 
        'DRAFT', 
        p_journal_data->>'reference', 
        p_journal_data, 
        NOW(),
        v_created_by_id
    )
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        created_by_id = COALESCE(docs_journals.created_by_id, EXCLUDED.created_by_id),
        updated_at = NOW();

    -- 2. Sync Lines
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    
    FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES (
            COALESCE(v_line->>'id', 'JL-' || v_journal_id || '-' || floor(random()*1000000)::text), 
            v_journal_id, 
            v_effective_company_id, 
            v_line->>'accountId', 
            v_line->>'contactId', 
            COALESCE((v_line->>'debit')::numeric, 0), 
            COALESCE((v_line->>'credit')::numeric, 0), 
            v_line->>'description'
        );
    END LOOP;

    -- 3. Finalize Status
    UPDATE docs_journals 
    SET status = v_status,
        data = p_journal_data,
        created_by_id = COALESCE(created_by_id, v_created_by_id),
        updated_at = NOW()
    WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

  // 2. Update get_general_ledger_v2 with precise journal contact-lookup
  const sqlGetGeneralLedgerV2 = `
CREATE OR REPLACE FUNCTION public.get_general_ledger_v2(p_company_id text, p_account_id text, p_start_date date, p_end_date date)
 RETURNS TABLE(date date, reference text, description text, company_name text, partner_name text, prepared_by text, debit numeric, credit numeric, running_balance numeric, is_opening boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_opening_bal NUMERIC := 0;
BEGIN
    -- Calculate Opening Balance
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_opening_bal
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date < p_start_date;

    -- Return Opening Balance row
    RETURN QUERY SELECT 
        p_start_date, 
        'OPENING'::TEXT, 
        'Opening Balance'::TEXT, 
        ''::TEXT, 
        ''::TEXT, 
        ''::TEXT, 
        0::NUMERIC, 
        0::NUMERIC, 
        v_opening_bal,
        TRUE;

    -- Return Transactions
    RETURN QUERY
    SELECT 
        j.date,
        COALESCE(
          CASE 
            WHEN j.journal_type = 'INV' THEN (SELECT inv.invoice_number FROM docs_invoices inv WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(inv.id) OR LOWER(j.reference_number) = LOWER(inv.invoice_number) LIMIT 1)
            WHEN j.journal_type = 'BILL' THEN (SELECT b.bill_number FROM docs_bills b WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(b.id) OR LOWER(j.reference_number) = LOWER(b.bill_number) LIMIT 1)
            WHEN j.journal_type IN ('CUST_PAY', 'VEND_PAY') THEN (SELECT pay.payment_number FROM docs_payments pay WHERE LOWER(replace(LOWER(pay.id), 'pay-', '')) = LOWER(replace(replace(replace(replace(LOWER(j.id), 'je-cpay-', ''), 'je-vpay-', ''), 'je-', ''), 'pay-', '')) OR LOWER(j.reference_number) LIKE '%' || LOWER(pay.payment_number) || '%' LIMIT 1)
            WHEN j.journal_type = 'CREDIT_NOTE' THEN (SELECT cn.credit_note_number FROM docs_credit_notes cn WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(cn.id) OR LOWER(j.reference_number) = LOWER(cn.credit_note_number) LIMIT 1)
            ELSE NULL
          END,
          j.reference_number,
          j.id
        ) AS reference,
        COALESCE(al.description, j.description, ''),
        COALESCE(c.name, 'Unknown'),
        COALESCE(
          -- Look up on the journal lines first
          (
            SELECT cont_inner.name 
            FROM docs_journal_lines jl_inner 
            JOIN docs_contacts cont_inner ON jl_inner.contact_id = cont_inner.id
            WHERE jl_inner.journal_id = j.id AND jl_inner.contact_id IS NOT NULL 
            LIMIT 1
          ),
          CASE 
            WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 'Cash Sale'
            ELSE ''
          END
        ) AS partner_name,
        COALESCE(u.name, u.username, j.data->>'preparedBy', 'System') AS prepared_by,
        COALESCE(al.debit, 0),
        COALESCE(al.credit, 0),
        v_opening_bal + SUM(al.debit - al.credit) OVER (ORDER BY j.date, j.created_at, j.id, al.id) as running_balance,
        FALSE
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    LEFT JOIN docs_companies c ON j.company_id = c.id
    LEFT JOIN docs_users u ON j.created_by_id = u.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND al.account_id = p_account_id
      AND j.status = 'POSTED'
      AND j.date >= p_start_date 
      AND j.date <= p_end_date
    ORDER BY j.date ASC, j.created_at ASC, j.id ASC, al.id ASC;
END;
$$;
`;

  // 3. Update get_general_ledger (5-args) to use precise journal level contact-lookup
  const sqlGetGeneralLedger5Args = `
CREATE OR REPLACE FUNCTION public.get_general_ledger(p_company_ids text[], p_account_ids text[], p_partner_ids text[], p_start_date date, p_end_date date)
 RETURNS TABLE(partner_id text, journal_id text, journal_date date, account_name text, reference text, description text, responsible_name text, debit numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
      BEGIN
          RETURN QUERY
          SELECT 
              COALESCE(
                  al.contact_id, 
                  (
                      SELECT jl_inner.contact_id 
                      FROM docs_journal_lines jl_inner 
                      WHERE jl_inner.journal_id = j.id AND jl_inner.contact_id IS NOT NULL 
                      LIMIT 1
                  ),
                  CASE 
                      WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 'contact-cash-sale-global'
                      ELSE NULL 
                  END
              ) AS partner_id,
              j.id AS journal_id,
              j.date AS journal_date,
              COALESCE(a.name, 'Unknown Account') AS account_name,
              COALESCE(
                CASE 
                  WHEN j.journal_type = 'INV' THEN (SELECT inv.invoice_number FROM docs_invoices inv WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(inv.id) OR LOWER(j.reference_number) = LOWER(inv.invoice_number) LIMIT 1)
                  WHEN j.journal_type = 'BILL' THEN (SELECT b.bill_number FROM docs_bills b WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(b.id) OR LOWER(j.reference_number) = LOWER(b.bill_number) LIMIT 1)
                  WHEN j.journal_type IN ('CUST_PAY', 'VEND_PAY') THEN (SELECT pay.payment_number FROM docs_payments pay WHERE LOWER(replace(LOWER(pay.id), 'pay-', '')) = LOWER(replace(replace(replace(replace(LOWER(j.id), 'je-cpay-', ''), 'je-vpay-', ''), 'je-', ''), 'pay-', '')) OR LOWER(j.reference_number) LIKE '%' || LOWER(pay.payment_number) || '%' LIMIT 1)
                  WHEN j.journal_type = 'CREDIT_NOTE' THEN (SELECT cn.credit_note_number FROM docs_credit_notes cn WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(cn.id) OR LOWER(j.reference_number) = LOWER(cn.credit_note_number) LIMIT 1)
                  ELSE NULL
                END,
                j.reference_number,
                ''
              ) AS reference,
              COALESCE(al.description, j.description, '') AS description,
              COALESCE(u.name, u.username, j.data->>'preparedBy', 'System') AS responsible_name,
              COALESCE(al.debit, 0)::NUMERIC AS debit,
              COALESCE(al.credit, 0)::NUMERIC AS credit
          FROM docs_journal_lines al
          JOIN docs_journals j ON al.journal_id = j.id
          LEFT JOIN docs_accounts a ON al.account_id = a.id
          LEFT JOIN docs_users u ON j.created_by_id = u.id
          WHERE (p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL OR j.company_id = ANY(p_company_ids))
            AND (p_account_ids IS NULL OR array_length(p_account_ids, 1) IS NULL OR al.account_id = ANY(p_account_ids))
            AND (
                p_partner_ids IS NULL 
                OR array_length(p_partner_ids, 1) IS NULL
                OR COALESCE(
                       al.contact_id, 
                       (
                           SELECT jl_inner.contact_id 
                           FROM docs_journal_lines jl_inner 
                           WHERE jl_inner.journal_id = j.id AND jl_inner.contact_id IS NOT NULL 
                           LIMIT 1
                       ),
                       CASE 
                           WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 'contact-cash-sale-global'
                           ELSE NULL 
                       END
                   ) = ANY(p_partner_ids)
            )
            AND j.status = 'POSTED'
            AND j.date >= p_start_date 
            AND j.date <= p_end_date
          ORDER BY j.date ASC, COALESCE(j.created_at, j.updated_at) ASC, j.id ASC, al.id ASC;
      END;
$$;
`;

  await client.query(sqlCreateJournalEntry);
  console.log("-> Registered create_journal_entry updates.");

  await client.query(sqlGetGeneralLedgerV2);
  console.log("-> Registered get_general_ledger_v2 updates with precise journal contact-lookup.");

  await client.query(sqlGetGeneralLedger5Args);
  console.log("-> Registered get_general_ledger (5-args) updates with precise journal contact-lookup.");

  await client.end();
  console.log("All updates completed successfully.");
}

run().catch(err => {
  console.error("Failed to apply DB updates:", err);
  process.exit(1);
});
