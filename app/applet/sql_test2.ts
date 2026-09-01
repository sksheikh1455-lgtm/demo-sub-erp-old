import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  let contactId = 'contact-cash-sale-global';

  let q = `
    WITH active_cids AS (
        SELECT unnest(ARRAY['comp-1']) AS company_id
    ),
    derived_lines AS (
        SELECT 
            coalesce(al.contact_id, 
                CASE 
                    WHEN j.journal_type IN ('INV', 'BILL', 'CUST_PAY', 'VEND_PAY', 'CREDIT_NOTE') THEN 
                        coalesce(j.data->>'contactId', j.data->>'customerId', j.data->>'vendorId', j.data->>'partnerId')
                    ELSE NULL 
                END
            ) AS effective_contact_id,
            j.company_id,
            (al.debit - al.credit) as amount,
            al.debit, al.credit, j.id
        FROM docs_journal_lines al
        JOIN docs_journals j ON al.journal_id = j.id
        LEFT JOIN docs_accounts a ON al.account_id = a.id
        WHERE j.status = 'POSTED'
          AND (
              ('CUSTOMER' = 'CUSTOMER' AND (
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
          )
    )
    SELECT * FROM derived_lines WHERE effective_contact_id = '${contactId}'
  `;
  let r = await c.query(q);
  let d = 0, cr = 0;
  for (let row of r.rows) {
      d += Number(row.debit); cr += Number(row.credit);
      // Let's see some non-zero JEs
  }
  console.log('Query length:', r.rows.length);
  console.log('D:', d, 'Cr:', cr, 'Net:', d - cr);
  await c.end();
}
run();
