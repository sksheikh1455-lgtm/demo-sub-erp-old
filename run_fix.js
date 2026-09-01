import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const sql = fs.readFileSync('fix_post_bill.sql', 'utf8');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Fixed post_bill successfully');
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
