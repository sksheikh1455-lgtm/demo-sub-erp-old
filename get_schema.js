import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'docs_inventory_transactions';
    `);
    console.log(res.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
