import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const invId = '342c3bed-a610-4ccd-955b-97cb5fb07b34';
  console.log(`=== EXAMINING INVOICE AND LINES FOR ${invId} ===`);
  
  const { rows: rInvs } = await client.query(`SELECT * FROM docs_invoices WHERE id = $1;`, [invId]);
  console.log('Invoice Header:', rInvs[0]);

  const { rows: rLines } = await client.query(`SELECT * FROM docs_invoice_lines WHERE invoice_id = $1;`, [invId]);
  console.log('Invoice Lines:', rLines);

  await client.end();
}
run().catch(console.error);
