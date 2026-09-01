import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  await client.query(sql);
  console.log('SQL executed successfully');
  await client.end();
}
main().catch(console.error);
