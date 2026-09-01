import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
async function run() {
  const url = process.env.SUPABASE_DB_URL.replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('process_invoice', 'process_bill', 'process_payment')");
  for (const r of rows) {
    fs.writeFileSync(`scripts/${r.proname}.sql`, r.prosrc);
  }
  await client.end();
}
run();
