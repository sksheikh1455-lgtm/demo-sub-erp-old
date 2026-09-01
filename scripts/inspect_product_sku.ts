import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query("SELECT id, name, sku, quantity_on_hand, company_id, data FROM docs_products WHERE sku = 'C9P'");
    console.log("Product Row:", res.rows[0]);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
