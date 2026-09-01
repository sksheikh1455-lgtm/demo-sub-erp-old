import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = fs.readFileSync('scripts/update_sync_trigger.sql', 'utf8');
  await client.query(sql);
  console.log("Sync trigger updated successfully.");

  await client.end();
}

run().catch(console.error);
