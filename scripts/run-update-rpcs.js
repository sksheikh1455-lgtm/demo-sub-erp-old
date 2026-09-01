import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const sql = fs.readFileSync('scripts/update_post_rpcs.sql', 'utf8');
    await client.query(sql);
    console.log('Successfully updated RPCs from hardcoded string');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
