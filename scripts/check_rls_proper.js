import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  let res = await client.query(`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as qual FROM pg_policy WHERE polrelid = 'docs_loans'::regclass
  `);
  console.log("Policies for docs_loans:", res.rows);
  await client.end();
}
run();
