import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'docs_products' AND column_name IN ('cost_price', 'quantity_on_hand')`);
    console.log(res.rows);
  } catch(e) {
    console.log(e);
  } finally {
    await client.end();
  }
}
main();
