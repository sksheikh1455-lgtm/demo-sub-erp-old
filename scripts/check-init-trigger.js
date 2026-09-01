import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_initialize_product_inventory'");
  console.log(res.rows);
  await client.end();
}
run();
