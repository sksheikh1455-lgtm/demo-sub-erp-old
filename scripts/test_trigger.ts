import { Client } from 'pg';
async function run() {
  const client = new Client("postgresql://postgres:sk445@raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres");
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    WHERE p.proname = 'generate_inventory_movements';
  `);
  console.log(res.rows[0]?.pg_get_functiondef);
  await client.end();
}
run();
