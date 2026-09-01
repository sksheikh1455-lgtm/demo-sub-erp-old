import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Client } = pg;
const url = process.env.SUPABASE_DB_URL.replace('sk445@raihan', 'sk445%40raihan');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
async function run() {
  await c.connect();
  const res = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'post_payment'");
  console.log(res.rows[0].prosrc);
  await c.end();
}
run();
