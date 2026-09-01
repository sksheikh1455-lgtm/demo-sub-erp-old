import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
import fs from 'fs';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const sql = fs.readFileSync('update_dashboard_rpc.sql', 'utf8');
  await client.query(sql);
  console.log("Success");
  await client.end();
}
run().catch(console.error);
