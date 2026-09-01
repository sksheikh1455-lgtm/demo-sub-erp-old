import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs/promises';

const connectionString = process.env.SUPABASE_DB_URL;

async function updateRPCs() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = await fs.readFile('scripts/posting_rpcs.sql', 'utf8');
  
  await client.query(sql);
  console.log("RPCs updated successfully!");
  await client.end();
}

updateRPCs();
