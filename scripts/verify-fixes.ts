import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('=== VERIFYING POST_INVOICE WITH OUR NEW DB CODE ===');
  
  // Try to find a draft or recently modified invoice (not already posted, or even posted to check idempotent response)
  const { rows: testInvs } = await client.query(`
    SELECT id, status, company_id, invoice_number 
    FROM docs_invoices 
    ORDER BY updated_at DESC 
    LIMIT 3;
  `);

  if (testInvs.length === 0) {
    console.log('No invoices available for testing.');
    await client.end();
    return;
  }

  console.log('Last invoices:', testInvs);
  
  // Try calling on a test invoice
  const inv = testInvs[0];
  console.log(`Calling post_invoice on: ID ${inv.id}, Current status: ${inv.status}`);
  try {
     const res = await client.query(`SELECT post_invoice($1, $2) as res;`, [inv.id, inv.company_id]);
     console.log('SUCCESS Result:', res.rows[0].res);
  } catch (err: any) {
     console.error('Failed to post:', err.message);
     if (err.where) console.error('Where context:', err.where);
  }

  await client.end();
}
run().catch(console.error);
