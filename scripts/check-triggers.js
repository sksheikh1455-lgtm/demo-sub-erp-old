import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  let res = await client.query("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_update_average_cost'");
  console.log('Triggers:', res.rows);
  
  res = await client.query("SELECT * FROM docs_product_costs LIMIT 3");
  console.log('Costs:', res.rows);
  
  await client.end();
}
run();
