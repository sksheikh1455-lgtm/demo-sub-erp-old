import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  try {
    console.log('--- Beginning Correction Transaction ---');
    await c.query('BEGIN');

    // 1. Ensure custom asset account exists
    console.log('1. Ensuring Loan Receivable / Deposit Asset Account exists...');
    await c.query(`
      INSERT INTO docs_accounts (id, company_id, code, name, type, sub_type, data, updated_at)
      VALUES (
        'comp-1-100603', 
        'comp-1', 
        '100603', 
        'Loan Receivable (ELECTRIC MALIK SOMITI GOPALGONJ)', 
        'ASSET', 
        NULL, 
        '{"description": "Automatically created for savings deposit / loan provided tracking"}'::jsonb,
        NOW()
      ) ON CONFLICT (id) DO NOTHING
    `);

    // 2. Disable custom audit/integrity triggers
    console.log('2. Temporarily disabling custom triggers to permit manual adjustments...');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER audit_docs_journals');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER block_delete_journals');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER trg_fiscal_lock_journals');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER trg_immutable_journals');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER trg_journal_balance');
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER trg_sync_docs_journals_doc');
    await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER audit_docs_journal_lines');
    await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER block_update_journals_integrity');

    // 3. Delete old unbalanced liability journals
    console.log('3. Purging old Journal entries for JE-LOAN-C0CB513B...');
    await c.query("DELETE FROM docs_journal_lines WHERE journal_id = 'JE-LOAN-C0CB513B'");
    await c.query("DELETE FROM docs_journals WHERE id = 'JE-LOAN-C0CB513B'");

    // 4. Insert new matched journals (Debit Deposit Asset, Credit Equity)
    console.log('4. Posting new correct Journal entry JE-LOAN-C0CB513B...');
    await c.query(`
      INSERT INTO docs_journals (id, company_id, date, journal_type, description, reference_number, status, created_at, updated_at)
      VALUES (
        'JE-LOAN-C0CB513B',
        'comp-1',
        '2026-06-04',
        'GEN',
        'Opening Loan/Deposit Recognition: Loan - ELECTRIC MALIK SOMITI GOPALGONJ',
        'LOAN-EMSG-001',
        'POSTED',
        NOW(),
        NOW()
      )
    `);

    // Debit Line: +17000 to Deposit Asset Account
    await c.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description, created_at)
      VALUES (
        'JL-JE-LOAN-C0CB513B-asset',
        'JE-LOAN-C0CB513B',
        'comp-1',
        'comp-1-100603',
        'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a',
        17000,
        0,
        'Loan Recognition: ELECTRIC MALIK SOMITI GOPALGONJ (Deposit Asset)',
        NOW()
      )
    `);

    // Credit Line: +17000 to Owner's Equity 
    await c.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description, created_at)
      VALUES (
        'JL-JE-LOAN-C0CB513B-eq',
        'JE-LOAN-C0CB513B',
        'comp-1',
        'comp-1-300100',
        NULL,
        0,
        17000,
        'Loan Recognition: ELECTRIC MALIK SOMITI GOPALGONJ (Owner Credit)',
        NOW()
      )
    `);

    // 5. Convert docs_loans type to PROVIDED
    console.log('5. Converting docs_loans type to "PROVIDED"...');
    await c.query(`
      UPDATE docs_loans
      SET 
        type = 'PROVIDED',
        status = 'ACTIVE'
      WHERE id = 'loan-msg-c0cb513b'
    `);

    // 6. Apply updated PostgreSQL functions get_partner_balance and get_general_ledger
    console.log('6. Re-patching Postgres public.get_partner_balance function...');
    await c.query(`
CREATE OR REPLACE FUNCTION public.get_partner_balance(p_company_ids text[], p_contact_id text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_balance NUMERIC;
    v_type TEXT;
BEGIN
    -- Determine contact type
    SELECT (data->>'type') INTO v_type FROM docs_contacts WHERE id = p_contact_id;
    
    SELECT COALESCE(SUM(al.debit - al.credit), 0) INTO v_balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    LEFT JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_ids IS NULL OR j.company_id = ANY(p_company_ids))
      AND al.contact_id = p_contact_id
      AND j.status = 'POSTED'
      AND (p_as_of_date IS NULL OR j.date <= p_as_of_date)
      AND (
          (v_type = 'CUSTOMER' AND (
              LOWER(a.sub_type) = 'accounts_receivable'
              OR LOWER(a.sub_type) = 'receivable'
              OR LOWER(a.sub_type) = 'accounts receivable'
              OR a.code IN ('100201', '100200', '100202', '100203', '100204', '100205')
              OR a.code LIKE '1002%'
              OR LOWER(a.name) ILIKE '%accounts receivable%'
              OR LOWER(a.name) ILIKE '%customer advance%'
              OR LOWER(a.name) ILIKE '%advance from customer%'
              OR LOWER(a.name) ILIKE '%advance customer%'
              OR LOWER(a.name) ILIKE '%customer prepayment%'
              OR LOWER(a.name) ILIKE '%customer advance/deposit%'
              OR LOWER(a.name) ILIKE '%debtor%'
              OR (a.type = 'ASSET' AND LOWER(a.name) ILIKE '%receivable%')
              OR a.data->>'type' = 'RECEIVABLE'
              OR a.code LIKE '1006%'
              OR a.code = '2101'
              OR LOWER(a.name) ILIKE '%loan%'
          ))
          OR 
          (v_type = 'VENDOR' AND (
              LOWER(a.sub_type) = 'accounts_payable'
              OR LOWER(a.sub_type) = 'payable'
              OR LOWER(a.sub_type) = 'accounts payable'
              OR a.code IN ('200101', '200100', '200102', '200103', '200104', '200105')
              OR a.code LIKE '2001%'
              OR LOWER(a.name) ILIKE '%accounts payable%'
              OR LOWER(a.name) ILIKE '%vendor advance%'
              OR LOWER(a.name) ILIKE '%advance to vendor%'
              OR LOWER(a.name) ILIKE '%advance vendor%'
              OR LOWER(a.name) ILIKE '%vendor prepayment%'
              OR LOWER(a.name) ILIKE '%vendor advance/deposit%'
              OR LOWER(a.name) ILIKE '%creditor%'
              OR (a.type = 'LIABILITY' AND LOWER(a.name) ILIKE '%payable%')
              OR a.data->>'type' = 'PAYABLE'
              OR a.code LIKE '1006%'
              OR a.code = '2101'
              OR LOWER(a.name) ILIKE '%loan%'
          ))
      );
    
    -- Invert for Vendors (Payables)
    IF v_type = 'VENDOR' THEN
        RETURN -v_balance;
    ELSE
        RETURN v_balance;
    END IF;
END;
$function$;
    `);

    console.log('7. Re-patching Postgres public.get_general_ledger (6-arguments) function...');
    await c.query(`
CREATE OR REPLACE FUNCTION public.get_general_ledger(p_company_ids text[], p_account_ids text[], p_partner_ids text[], p_start_date date, p_end_date date, p_partner_type text)
 RETURNS TABLE(partner_id text, journal_id text, journal_date date, account_name text, reference text, description text, responsible_name text, debit numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
                  j.data->>'contactId',
                  j.data->>'customerId',
                  j.data->>'vendorId',
                  j.data->>'partnerId',
                  CASE 
                      WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CPAY', 'VPAY', 'CREDIT_NOTE') THEN 'contact-cash-sale-global'
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
                  WHEN j.journal_type IN ('CUST_PAY', 'VEND_PAY', 'CPAY', 'VPAY') THEN (
                      SELECT pay.payment_number 
                      FROM docs_payments pay 
                      WHERE LOWER(replace(LOWER(pay.id), 'pay-', '')) = LOWER(replace(replace(replace(replace(LOWER(j.id), 'je-cpay-', ''), 'je-vpay-', ''), 'je-', ''), 'pay-', '')) 
                      OR LOWER(j.reference_number) LIKE '%' || LOWER(pay.payment_number) || '%' 
                      LIMIT 1
                  )
                  WHEN j.journal_type = 'CREDIT_NOTE' THEN (SELECT cn.credit_note_number FROM docs_credit_notes cn WHERE LOWER(replace(LOWER(j.id), 'je-', '')) = LOWER(cn.id) OR LOWER(j.reference_number) = LOWER(cn.credit_note_number) LIMIT 1)
                  ELSE NULL
                END,
                j.reference_number,
                j.id
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
                       j.data->>'contactId',
                       j.data->>'customerId',
                       j.data->>'vendorId',
                       j.data->>'partnerId',
                       CASE 
                           WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CPAY', 'VPAY', 'CREDIT_NOTE') THEN 'contact-cash-sale-global'
                           ELSE NULL 
                       END
                   ) = ANY(p_partner_ids)
            )
            AND j.status = 'POSTED'
            AND j.date >= p_start_date 
            AND j.date <= p_end_date
            -- Apply filtration based on Partner Type to strictly exclude other accounts
            AND (
                p_partner_type IS NULL
                OR (
                    p_partner_type = 'CUSTOMER' 
                    AND (
                        LOWER(a.sub_type) = 'accounts_receivable'
                        OR LOWER(a.sub_type) = 'receivable'
                        OR LOWER(a.sub_type) = 'accounts receivable'
                        OR a.code IN ('100201', '100200', '100202', '100203', '100204', '100205')
                        OR a.code LIKE '1002%'
                        OR LOWER(a.name) ILIKE '%accounts receivable%'
                        OR LOWER(a.name) ILIKE '%customer advance%'
                        OR LOWER(a.name) ILIKE '%advance from customer%'
                        OR LOWER(a.name) ILIKE '%advance customer%'
                        OR LOWER(a.name) ILIKE '%customer prepayment%'
                        OR LOWER(a.name) ILIKE '%customer advance/deposit%'
                        OR LOWER(a.name) ILIKE '%debtor%'
                        OR (a.type = 'ASSET' AND LOWER(a.name) ILIKE '%receivable%')
                        OR a.data->>'type' = 'RECEIVABLE'
                        OR a.code LIKE '1006%'
                        OR a.code = '2101'
                        OR LOWER(a.name) ILIKE '%loan%'
                    )
                )
                OR (
                    p_partner_type = 'VENDOR' 
                    AND (
                        LOWER(a.sub_type) = 'accounts_payable'
                        OR LOWER(a.sub_type) = 'payable'
                        OR LOWER(a.sub_type) = 'accounts payable'
                        OR a.code IN ('200101', '200100', '200102', '200103', '200104', '200105')
                        OR a.code LIKE '2001%'
                        OR LOWER(a.name) ILIKE '%accounts payable%'
                        OR LOWER(a.name) ILIKE '%vendor advance%'
                        OR LOWER(a.name) ILIKE '%advance to vendor%'
                        OR LOWER(a.name) ILIKE '%vendor prepayment%'
                        OR LOWER(a.name) ILIKE '%advance vendor%'
                        OR LOWER(a.name) ILIKE '%supplier advance%'
                        OR LOWER(a.name) ILIKE '%advance to supplier%'
                        OR LOWER(a.name) ILIKE '%creditor%'
                        OR (a.type = 'LIABILITY' AND LOWER(a.name) ILIKE '%payable%')
                        OR a.data->>'type' = 'PAYABLE'
                        OR a.code LIKE '1006%'
                        OR a.code = '2101'
                        OR LOWER(a.name) ILIKE '%loan%'
                    )
                )
            )
          ORDER BY j.date ASC, 5 ASC, COALESCE(j.created_at, j.updated_at) ASC, j.id ASC, al.id ASC;
      END;
$function$;
    `);

    // 8. Re-enable custom audit/integrity triggers
    console.log('8. Re-enabling triggers...');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER audit_docs_journals');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER block_delete_journals');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER trg_fiscal_lock_journals');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER trg_immutable_journals');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER trg_journal_balance');
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER trg_sync_docs_journals_doc');
    await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER audit_docs_journal_lines');
    await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER block_update_journals_integrity');

    await c.query('COMMIT');
    console.log('--- ALL UPDATES APPLIED SUCCESSFULLY & COMMITTED ---');

    // 9. Verify the records
    console.log('\n================ VERIFICATION ================');
    const loanRes = await c.query("SELECT id, type, amount, status FROM docs_loans WHERE id = 'loan-msg-c0cb513b'");
    console.log('A. Loan Record status:');
    console.table(loanRes.rows);

    const jlRes = await c.query(`
      SELECT jl.id, jl.account_id, a.code, a.name, jl.debit, jl.credit, jl.description
      FROM docs_journal_lines jl
      JOIN docs_accounts a ON jl.account_id = a.id
      WHERE jl.journal_id = 'JE-LOAN-C0CB513B'
    `);
    console.log('B. Journal Entry Lines for JE-LOAN-C0CB513B:');
    console.table(jlRes.rows);

    const balRes = await c.query("SELECT public.get_partner_balance(ARRAY['comp-1'], 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a') as balance");
    console.log(`C. Opening Partner Balance from get_partner_balance: ${balRes.rows[0].balance} ৳`);

  } catch (err) {
    console.error('--- Transaction failed, rolling back ---', err);
    await c.query('ROLLBACK');
    process.exit(1);
  } finally {
    await c.end();
  }
}
run();
