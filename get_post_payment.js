import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

async function test() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const urlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
  const dbUrl = urlMatch[1].replace('5432', '6543').replace('postgres:', 'postgres.buspgzsamhfmjrmmwpmo:').replace('db.buspgzsamhfmjrmmwpmo.supabase.co', 'aws-0-ap-southeast-1.pooler.supabase.com');

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'post_payment'");
  console.log(res.rows[0]?.routine_definition);
  await client.end();
}
test();
