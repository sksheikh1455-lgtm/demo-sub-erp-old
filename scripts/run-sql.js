import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

const sqlFile = process.argv[2] || 'scripts/inventory_rpcs.sql';
  console.log(`Reading SQL file: ${sqlFile}...`);
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log("Applying SQL to database...");
  await client.query(sql);
  console.log("RPCs applied successfully.");
  
  await client.end();
}

run().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
