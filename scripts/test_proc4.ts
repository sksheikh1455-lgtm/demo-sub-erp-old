import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const url = process.env.SUPABASE_DB_URL.replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query("SELECT proname FROM pg_proc WHERE proname LIKE 'process_%' OR proname LIKE 'post_%'");
  console.log(rows.map(r => r.proname).join(', '));
  await client.end();
}
run();
