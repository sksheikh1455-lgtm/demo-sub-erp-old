import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let res = await client.query("SELECT event_object_table, event_manipulation, action_statement, action_timing FROM information_schema.triggers WHERE trigger_name = 'trg_sync_cash_ledger_trigger'");
  console.log(res.rows);
  await client.end();
}
main();
