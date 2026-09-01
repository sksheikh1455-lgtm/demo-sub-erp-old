import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('--- Inspecting docs_loans for loan-msg-c0cb513b ---');
  const res = await c.query("SELECT * FROM docs_loans WHERE id = 'loan-msg-c0cb513b'");
  console.dir(res.rows[0], { depth: null });

  await c.end();
}
run();
