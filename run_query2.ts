import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conname = 'unq_journal_num_company';
  `);
  console.log(res.rows);
  await client.end();
}
run();
