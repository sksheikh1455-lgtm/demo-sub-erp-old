import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
async function main() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const urlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
  const client = new Client({ connectionString: urlMatch[1] });
  await client.connect();
  const res = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'docs_payments';
  `);
  console.log(res.rows);
  await client.end();
}
main();
