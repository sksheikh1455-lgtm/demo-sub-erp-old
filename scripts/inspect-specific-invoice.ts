import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const { rows } = await client.query(`
    SELECT data, status, company_id FROM docs_invoices WHERE id = '342c3bed-a610-4ccd-955b-97cb5fb07b34';
  `);
  console.log('Invoice data:', JSON.stringify(rows[0], null, 2));

  await client.end();
}
run().catch(console.error);
