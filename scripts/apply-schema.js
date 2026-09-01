import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

async function runSchema() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    const sql = fs.readFileSync('scripts/database-schema.sql', 'utf8');
    console.log("Executing schema...");
    
    await client.query(sql);
    console.log("Schema executed successfully!");
    
  } catch (err) {
    console.error("Error executing schema:", err);
  } finally {
    await client.end();
  }
}

runSchema();
