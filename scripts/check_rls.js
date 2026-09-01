import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    -- Simulate what the frontend gets:
    -- Wait, the frontend uses Supabase query.
    -- Let's see the Row Level Security for docs_users
    select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'Company Isolation' and polrelid = 'docs_users'::regclass;
  `);
  console.log(res.rows);
  await client.end();
}
main();
