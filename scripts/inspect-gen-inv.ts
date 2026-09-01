import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const funcRes = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'generate_inventory_movements';
  `);
  for (const row of funcRes.rows) {
    console.log(`\n--- FUNCTION: ${row.proname} ---`);
    console.log(row.prosrc);
  }

  await client.end();
}
run().catch(console.error);
