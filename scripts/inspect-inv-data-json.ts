import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const { rows } = await client.query(`
    SELECT data FROM docs_invoices WHERE id = '342c3bed-a610-4ccd-955b-97cb5fb07b34';
  `);
  console.log('Invoice Data Payload (JSON):');
  console.log(JSON.stringify(rows[0]?.data, null, 2));

  await client.end();
}
run().catch(console.error);
