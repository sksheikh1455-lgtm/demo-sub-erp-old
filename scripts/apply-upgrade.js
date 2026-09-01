
import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

async function runUpgrade() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    const sql = fs.readFileSync('scripts/reporting_engine.sql', 'utf8');
    console.log("Executing reporting engine SQL...");
    
    await client.query(sql);
    console.log("Upgrade executed successfully!");
    
  } catch (err) {
    console.error("Error executing upgrade:", err.message);
  } finally {
    await client.end();
  }
}

runUpgrade();
