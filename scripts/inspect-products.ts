import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const columnsRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_products'
  `);
  console.log("Columns of docs_products:", columnsRes.rows.map(r => `${r.column_name} (${r.data_type})`));

  const sampleRes = await client.query(`
    SELECT id, name, sku, price, cost_price, quantity_on_hand, data
    FROM docs_products
    LIMIT 3
  `);
  console.log("Sample docs_products:", sampleRes.rows);

  await client.end();
}
run();
