import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'check_company_access';
  `);
  console.table(res.rows);
  await client.end();
}
main();
