import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select pol.polname, class.relname 
    from pg_policy pol 
    join pg_class class on class.oid=pol.polrelid 
    where class.relname = 'docs_users';
  `);
  console.table(res.rows);
  await client.end();
}
main();
