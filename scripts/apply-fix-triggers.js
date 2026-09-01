
import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const sql = fs.readFileSync('scripts/fix_duplicate_triggers.sql', 'utf8');
    await client.query(sql);
    console.log("Triggers fixed successfully!");
  } catch (err) {
    console.error("Error fixing triggers:", err);
  } finally {
    await client.end();
  }
}

run();
