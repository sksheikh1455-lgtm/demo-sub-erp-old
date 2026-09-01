import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'docs_payments';
  `);
  console.log(res.rows);
  await client.end();
}
run();
