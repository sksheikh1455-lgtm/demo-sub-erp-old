import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
async function main() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const urlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
  const client = new Client({ connectionString: urlMatch[1] });
  await client.connect();
  const res = await client.query(`
      SELECT tgname, proname, tgenabled, tgtype
      FROM pg_trigger 
      JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid 
      JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid 
      WHERE relname IN ('docs_payments', 'docs_journals');
  `);
  console.log(res.rows);
  await client.end();
}
main();
