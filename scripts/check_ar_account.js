import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select code, name, type from docs_accounts where name LIKE '%Receivable%' OR name LIKE '%Payable%';
  `);
  console.table(res.rows);
  await client.end();
}
main();
