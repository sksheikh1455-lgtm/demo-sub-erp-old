import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_inventory_transactions';
  `);
  console.log('=== docs_inventory_transactions schema ===');
  console.log(res.rows.map(r => `${r.column_name}: ${r.data_type}`));

  await client.end();
}
run().catch(console.error);
