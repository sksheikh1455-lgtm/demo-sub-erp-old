import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('Finding public.get_general_ledger and get_partner_balance details...');
  const res = await c.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as fdef
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND (p.proname = 'get_general_ledger' OR p.proname = 'get_partner_balance')
  `);
  
  res.rows.forEach(row => {
     console.log(`\n================= FUNCTION: ${row.proname} =================`);
     console.log(row.fdef);
  });

  await c.end();
}
run();
