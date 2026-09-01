import { Client } from 'pg';
import fs from 'fs';
async function main() {
  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  const dbUrlRaw = lines.find(l => l.startsWith('SUPABASE_DB_URL=')).split('=')[1];
  const url = dbUrlRaw.replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new Client({ connectionString: url });
  await client.connect();
  let res = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('process_invoice', 'process_bill', 'process_payment', 'process_credit_note')");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main();
