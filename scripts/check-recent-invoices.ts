import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function check() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Querying 10 most recent invoices with line counts...');
  const res = await client.query(`
    SELECT i.id, i.invoice_number, i.total, i.status, i.company_id, COUNT(l.id) AS lines_count, i.updated_at
    FROM docs_invoices i
    LEFT JOIN docs_invoice_lines l ON i.id = l.invoice_id
    GROUP BY i.id, i.invoice_number, i.total, i.status, i.company_id, i.updated_at
    ORDER BY i.updated_at DESC
    LIMIT 10
  `);
  console.log('Recent 10 invoices and line counts:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

check().catch(console.error);
