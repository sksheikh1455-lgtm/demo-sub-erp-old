const pg = require('pg');
async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();
  const sql = `
WITH cash_lines AS (
    SELECT jl.id as jl_id, jl.journal_id, jl.debit, jl.credit, j.date, j.journal_type, j.reference_number, j.reference, j.description, j.company_id, j.created_by_id,
           COALESCE(i.id, i2.id) AS inv_id,
           COALESCE(b.id, b2.id) AS bil_id,
           cn.id AS cn_id,
           p.id AS pay_id
    FROM docs_journal_lines jl
    JOIN docs_journals j ON j.id = jl.journal_id
    JOIN docs_accounts a ON a.id = jl.account_id
    -- match invoice directly or via auto-payment
    LEFT JOIN docs_invoices i ON j.id = COALESCE(i.journal_entry_id, i.data->>'journalEntryId', 'JE-' || UPPER(REPLACE(i.id, 'INV-', '')))
    LEFT JOIN docs_invoices i2 ON j.id = 'JE-CPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || i2.id, 'PAY-', ''), 'PAY-', ''))
    -- match bill directly or via auto-payment
    LEFT JOIN docs_bills b ON j.id = COALESCE(b.journal_entry_id, b.data->>'journalEntryId')
    LEFT JOIN docs_bills b2 ON j.id = 'JE-VPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || b2.id, 'PAY-', ''), 'PAY-', ''))
    -- match credit note
    LEFT JOIN docs_credit_notes cn ON j.id = COALESCE(cn.data->>'journalEntryId', 'JE-' || UPPER(REPLACE(cn.id, 'CN-', '')))
    -- match payment
    LEFT JOIN docs_payments p ON j.id = COALESCE(p.data->>'journalEntryId', 'JE-' || CASE WHEN p.type IN ('RECEIPT', 'REFUND', 'COLLECTION') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', ''))
    WHERE a.code = '100100' AND j.status = 'POSTED' AND j.company_id = 'comp-1'
)
SELECT COUNT(*) FROM cash_lines;
  `;
  const res = await c.query(sql);
  console.log(res.rows);
  await c.end();
}
run();
