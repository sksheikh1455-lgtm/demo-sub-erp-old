const pkg = require('pg');
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'docs_products'`);
    console.log(res.rows.filter(r => r.column_name === 'cost_price' || r.column_name === 'quantity_on_hand'));
  } catch(e) {
    console.log(e);
  } finally {
    await client.end();
  }
}
main();
