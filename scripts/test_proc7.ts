import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const url = "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres";
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('post_invoice')");
  console.log(rows[0].prosrc);
  await client.end();
}
run();
