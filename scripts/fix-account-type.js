import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("UPDATE docs_accounts SET data = jsonb_set(data, '{type}', '\"COST_OF_REVENUE\"') WHERE code = '500101'");
  console.log('Updated rows:', res.rowCount);
  await client.end();
}
run();
