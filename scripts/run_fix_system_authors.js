import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const sql = fs.readFileSync('scripts/fix_system_authors.sql', 'utf8');
    await client.query(sql);
    console.log('Successfully ran docs_journals update script');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

main();
