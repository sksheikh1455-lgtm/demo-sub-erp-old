import { Client } from 'pg';
const client = new Client({
  connectionString: "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres"
});
async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, name, sku, data FROM docs_products WHERE data::text ILIKE '%4CORE%' OR name ILIKE '%4CORE%' OR sku ILIKE '%4CORE%'`);
  console.log("Results:", res.rows.length, res.rows.map(r => r.id));
  await client.end();
}
run();
