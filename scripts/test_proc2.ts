import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const url = process.env.SUPABASE_DB_URL.replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('process_invoice', 'process_bill', 'process_payment')");
  rows.forEach(r => {
    console.log(`--- ${r.proname} ---`);
    console.log(r.prosrc.substring(0, 500));
  });
  await client.end();
}
run();
