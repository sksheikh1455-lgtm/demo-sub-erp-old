import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'post_invoice';
  `);
  console.log(res.rows[0]?.pg_get_functiondef);
  await client.end();
}
test();
