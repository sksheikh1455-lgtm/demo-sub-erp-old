import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT quantity_on_hand, data->'stockLevels' as stock_levels 
      FROM docs_products 
      WHERE data->>'name' ILIKE '%AX1500-GIGABIT-Wi Fi6-ROUTER CUDY%';
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
