import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const connectionString = process.env.SUPABASE_DB_URL;

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    DROP TABLE IF EXISTS erp_state;
  `;
  
  await client.query(sql);
  console.log("erp_state dropped!");
  await client.end();
}
run();
