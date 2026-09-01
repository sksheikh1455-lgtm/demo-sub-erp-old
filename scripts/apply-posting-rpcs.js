import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function applyRPCs() {
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log("Reading SQL file...");
  const sql = fs.readFileSync('scripts/posting_rpcs.sql', 'utf8');

  console.log("Applying RPCs to database...");
  await client.query(sql);

  console.log("RPCs applied successfully.");
  await client.end();
}

applyRPCs().catch(err => {
  console.error("Failed to apply RPCs:", err);
  process.exit(1);
});
