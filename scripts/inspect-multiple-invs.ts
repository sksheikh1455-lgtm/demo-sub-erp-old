import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const { rows: invs } = await client.query(`
    SELECT id, invoice_number, status, total, subtotal, tax_total, discount_total 
    FROM docs_invoices 
    ORDER BY updated_at DESC LIMIT 5;
  `);

  for (const inv of invs) {
     console.log(`\n--- INVOICE ${inv.invoice_number} (status: ${inv.status}, total: ${inv.total}) ---`);
     const { rows: lines } = await client.query(`
       SELECT id, product_id, quantity, unit_price, discount, tax, total, line_value
       FROM docs_invoice_lines 
       WHERE invoice_id = $1;
     `, [inv.id]);
     console.log('Lines:', lines);
  }

  await client.end();
}
run().catch(console.error);
