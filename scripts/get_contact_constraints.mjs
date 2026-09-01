import pg from 'pg';
const { Client } = pg;
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    WHERE conrelid = 'docs_contacts'::regclass
  `);
  console.log(res.rows);
  await client.end();
}
run();
