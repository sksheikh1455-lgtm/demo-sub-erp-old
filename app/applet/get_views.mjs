import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const { rows } = await client.query(`
    SELECT view_definition FROM information_schema.views WHERE table_name = 'partner_ledger_view' OR table_name = 'partner_ledger' OR table_name ILIKE '%partner%' OR table_name ILIKE '%ledger%'
  `);
  console.log(rows);
  await client.end();
}
run();
