import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT id, code, name, data->>'type' as type FROM docs_accounts WHERE code = '500101' OR data->>'type' = 'COST_OF_SALES'");
  console.log(res.rows);
  await client.end();
}
run();
