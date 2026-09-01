import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected! Setting statement timeout...');
  await client.query('SET statement_timeout = 3000');

  console.log('Querying recent invoices...');
  const invRes = await client.query(`
    SELECT id, company_id, invoice_number, total, discount, tax_amount, status, data 
    FROM docs_invoices 
    ORDER BY updated_at DESC LIMIT 5
  `);
  console.log('Recent invoices in db:', JSON.stringify(invRes.rows, null, 2));

  for (const inv of invRes.rows) {
    console.log(`\nLines for invoice ${inv.id}:`);
    const lineRes = await client.query(`
      SELECT id, product_id, quantity, unit_price, line_value, total, type, description 
      FROM docs_invoice_lines 
      WHERE invoice_id = $1
    `, [inv.id]);
    console.log(JSON.stringify(lineRes.rows, null, 2));
  }

  await client.end();
}

run().catch(console.error);
