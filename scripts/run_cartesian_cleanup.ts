import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'cleanup_cartesian_duplicates.sql'), 'utf-8');
    
    console.log('Executing Cartesian Duplicate Cleanup Script...');
    const result = await client.query(sql);
    
    console.log('Cleanup script executed successfully.');
  } catch (error) {
    console.error('Error executing cleanup script:', error);
  } finally {
    await client.end();
  }
}

main();
