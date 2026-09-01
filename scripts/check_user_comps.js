import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select name, company_id, company_ids from docs_users;
  `);
  console.table(res.rows);
  await client.end();
}
main();
