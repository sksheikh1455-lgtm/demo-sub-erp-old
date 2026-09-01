import { Client } from 'pg';
import fs from 'fs';

async function run() {
  const url = "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres";
  console.log("Connecting to:", url.substring(0, 30) + '...');
  const client = new Client({ connectionString: url });
  await client.connect();
  const sql = fs.readFileSync('scripts/business_logic_rpcs.sql', 'utf8');
  await client.query(sql);
  console.log("Deployed business logic RPCs successfully");
  await client.end();
}
run();
