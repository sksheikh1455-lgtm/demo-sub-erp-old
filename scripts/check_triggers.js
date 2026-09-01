import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select tgname from pg_trigger where tgrelid = 'docs_journals'::regclass;
  `);
  console.table(res.rows);
  await client.end();
}
main();
