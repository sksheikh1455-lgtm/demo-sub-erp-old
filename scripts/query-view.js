import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function queryView() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query("SELECT pg_get_viewdef('report_stock_valuation')");
  console.log(res.rows[0].pg_get_viewdef);
  await client.end();
}

queryView();
