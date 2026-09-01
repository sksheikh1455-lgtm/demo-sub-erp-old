import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Starting DB upgrade for Partner Ledger and Outstanding Balance Filtering...");

  // 1. Drop existing overloaded functions to avoid collision before recreations
  const dropQueries = [
    "DROP FUNCTION IF EXISTS public.get_general_ledger(text[], text[], text[], date, date);",
    "DROP FUNCTION IF EXISTS public.get_general_ledger(text[], text[], text[], date, date, text);",
    "DROP FUNCTION IF EXISTS public.get_partner_summary(text, text);",
    "DROP FUNCTION IF EXISTS public.get_partner_summary(text[], text, date);"
  ];

  for (const q of dropQueries) {
    try {
      await client.query(q);
      console.log(`Executed: ${q}`);
    } catch (err) {
      console.warn(`Warning dropping function: ${err.message}`);
    }
  }

  // 2. Define get_general_ledger with 6 arguments
  const createGeneralLedger6Args = `
CREATE OR REPLACE FUNCTION public.get_general_ledger(
    p_company_ids text[], 
    p_account_ids text[], 
    p_partner_ids text[], 
    p_start_date date, 
    p_end_date date,
    p_partner_type text
)
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
                       CASE 
                           WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 'contact-cash-sale-global'
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
                    )
                )
            )
          ORDER BY j.date ASC, COALESCE(j.created_at, j.updated_at) ASC, j.id ASC, al.id ASC;
      END;
$$;
  `;

  // 3. Define get_general_ledger with 5 arguments (which calls the 6 argument version passing NULL as p_partner_type)
  const createGeneralLedger5Args = `
CREATE OR REPLACE FUNCTION public.get_general_ledger(
    p_company_ids text[], 
    p_account_ids text[], 
    p_partner_ids text[], 
    p_start_date date, 
    p_end_date date
)
 RETURNS TABLE(partner_id text, journal_id text, journal_date date, account_name text, reference text, description text, responsible_name text, debit numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.get_general_ledger(p_company_ids, p_account_ids, p_partner_ids, p_start_date, p_end_date, NULL::text);
END;
$$;
  `;

  // 4. Update get_partner_summary (p_company_id text, p_contact_type text) to include customer and vendor advanced accounts
  const createPartnerSummary2Args = `
CREATE OR REPLACE FUNCTION public.get_partner_summary(p_company_id text, p_contact_type text)
 RETURNS TABLE(contact_id text, contact_name text, company_id text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        j.company_id,
        SUM(al.debit - al.credit) as balance
    FROM docs_journal_lines al
    JOIN docs_journals j ON al.journal_id = j.id
    JOIN docs_contacts c ON COALESCE(al.contact_id, 
        CASE 
            WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                (j.data->>'contactId')
            ELSE NULL 
        END
    ) = c.id
    JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_id IS NULL OR j.company_id = p_company_id)
      AND j.status = 'POSTED'
      AND (
          (p_contact_type = 'CUSTOMER' AND (
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
          ))
          OR 
          (p_contact_type = 'VENDOR' AND (
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
          ))
      )
    GROUP BY c.id, c.name, j.company_id;
END;
$$;
  `;

  // 5. Update get_partner_summary (p_company_ids text[], p_contact_type text, p_as_of_date date)
  const createPartnerSummary3Args = `
CREATE OR REPLACE FUNCTION public.get_partner_summary(p_company_ids text[], p_contact_type text, p_as_of_date date DEFAULT NULL::date)
 RETURNS TABLE(contact_id text, contact_name text, company_id text, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as contact_id,
        c.name as contact_name,
        al.company_id as company_id,
        COALESCE(SUM(al.debit - al.credit), 0) as balance
    FROM docs_contacts c
    LEFT JOIN (
        SELECT al.debit, al.credit, al.contact_id, j.company_id, al.account_id, j.status, j.journal_type, j.data, j.date
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
    ) al ON (
        COALESCE(al.contact_id, 
            CASE 
                WHEN al.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                    (al.data->>'contactId')
                ELSE NULL 
            END
        ) = c.id
    )
    LEFT JOIN docs_accounts a ON al.account_id = a.id
    WHERE (p_company_ids IS NULL OR al.company_id = ANY(p_company_ids))
      AND al.status = 'POSTED'
      AND (p_as_of_date IS NULL OR al.date < p_as_of_date)
      AND (
          (p_contact_type = 'CUSTOMER' AND (
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
          ))
          OR 
          (p_contact_type = 'VENDOR' AND (
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
          ))
      )
    GROUP BY c.id, c.name, al.company_id;
END;
$$;
  `;

  console.log("Creating new public.get_general_ledger (6-arguments) overload...");
  await client.query(createGeneralLedger6Args);

  console.log("Creating public.get_general_ledger (5-arguments) wrapper overload...");
  await client.query(createGeneralLedger5Args);

  console.log("Creating public.get_partner_summary (2-arguments) updated...");
  await client.query(createPartnerSummary2Args);

  console.log("Creating public.get_partner_summary (3-arguments) updated...");
  await client.query(createPartnerSummary3Args);

  console.log("Database schema updates successfully deployed!");
  await client.end();
}

run().catch(console.error);
