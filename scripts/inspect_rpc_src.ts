import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('--- Inspecting get_partner_balance ---');
  const pbRes = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_partner_balance'");
  console.log(pbRes.rows[0]?.prosrc);

  console.log('\n--- Inspecting get_general_ledger (6-arguments fallback) ---');
  const glRes = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_general_ledger' AND pronitypes = (SELECT proargtypes FROM pg_proc WHERE proname = 'get_general_ledger' ORDER BY array_length(proargtypes, 1) DESC LIMIT 1)");
  console.log(glRes.rows[0]?.prosrc);

  await c.end();
}
run();
