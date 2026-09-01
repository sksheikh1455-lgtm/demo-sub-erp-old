import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as withcheck from pg_policy where polname = 'Self access' and polrelid = 'docs_users'::regclass;
  `);
  console.log(res.rows);
  const res2 = await client.query(`
    select pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as withcheck from pg_policy where polname = 'tenant_isolation_policy' and polrelid = 'docs_users'::regclass;
  `);
  console.log(res2.rows);

  await client.end();
}
main();
