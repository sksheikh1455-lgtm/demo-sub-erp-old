import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sqlFiles = ['dashboard_reporting.sql', 'full_ledger.sql', 'balances.sql'];

  for (const file of sqlFiles) {
    const sqlPath = path.join(process.cwd(), 'scripts', file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`File ${file} not found, skipping...`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
      await client.query(sql);
      console.log(`${file} applied successfully`);
      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Failed to apply ${file}:`, err);
    }
  }
}
run();
