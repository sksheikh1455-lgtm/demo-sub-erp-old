import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  if (!dbUrlMatch) throw new Error("No db url");
  const rawUrl = dbUrlMatch[1].trim().replace(/^"|"$/g, '');
  const url = rawUrl.replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let res = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('process_invoice', 'post_invoice', 'process_bill')");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main();
