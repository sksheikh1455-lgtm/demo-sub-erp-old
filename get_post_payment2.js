import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

async function test() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const urlMatch = envContent.match(/SUPABASE_DB_URL="?([^"\n]+)"?/);

  const client = new Client({ connectionString: urlMatch[1], ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'post_payment'");
  console.log(res.rows[0]?.routine_definition);
  await client.end();
}
test();
