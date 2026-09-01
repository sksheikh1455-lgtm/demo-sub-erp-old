import pkg from "pg";
const { Client } = pkg;
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });

async function run() {
  await client.connect();
  const { rows: companies } = await client.query('SELECT id, data FROM docs_companies');
  let targetId = null;
  for (const c of companies) {
    if (c.data?.name === 'SUBORNO NEW') {
      targetId = c.id;
    }
  }
  const { rows: products } = await client.query('SELECT COUNT(*) FROM docs_products WHERE company_id = $1', [targetId]);
  console.log(`Products in SUBORNO NEW: ${products[0].count}`);
  await client.end();
}
run();
