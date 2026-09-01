import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('--- Inspecting get_general_ledger (5 or 6 params) definition ---');
  const res = await c.query("SELECT proname, prosrc, pronargs FROM pg_proc WHERE proname = 'get_general_ledger'");
  for (const row of res.rows) {
     console.log(`\n--- Proname: ${row.proname}, Args: ${row.pronargs} ---`);
     console.log(row.prosrc);
  }

  await c.end();
}
run();
