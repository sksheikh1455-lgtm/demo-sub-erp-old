import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT tgname, tgenabled 
      FROM pg_trigger 
      JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid
      WHERE relname = 'docs_inventory_transactions';
    `);
    console.table(res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
