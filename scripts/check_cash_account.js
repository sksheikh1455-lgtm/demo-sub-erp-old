import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select id, code, name, type, company_id from docs_accounts limit 20;
  `);
  console.table(res.rows);
  await client.end();
}
main();
