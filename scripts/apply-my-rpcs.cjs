const { Client } = require('pg');
const fs = require('fs');

const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const sql = fs.readFileSync('scripts/posting_rpcs.sql', 'utf8');
    await client.query(sql);
    console.log("Successfully updated RPCs.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

main();
