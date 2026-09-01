import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT id, cost_price FROM docs_products WHERE id = 'P-1777796581853'");
  console.log(res.rows);
  await client.end();
}
run();
