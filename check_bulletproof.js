import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'bulletproof_invoice_inventory_sync';
    `);
    fs.writeFileSync('bulletproof.sql', res.rows[0].prosrc);
    console.log("Written to bulletproof.sql");
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
