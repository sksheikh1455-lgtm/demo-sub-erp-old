
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sqlFiles = ['dashboard_reporting.sql', 'full_ledger.sql', 'balances.sql', 'reporting_engine.sql'];

  for (const file of sqlFiles) {
    const sqlPath = path.join(__dirname, file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`File ${file} not found, skipping...`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
      await client.query(sql);
      console.log(`${file} applied successfully`);
    } catch (err) {
      console.error(`Failed to apply ${file}:`, err);
    }
  }
  await client.end();
}
run();
