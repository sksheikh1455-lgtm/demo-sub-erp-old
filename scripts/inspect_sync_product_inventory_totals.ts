import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("=== sync_product_inventory_totals source ===");
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'sync_product_inventory_totals'
    `);
    if (res.rows.length > 0) {
      console.log(res.rows[0].prosrc);
    } else {
      console.log('sync_product_inventory_totals not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
