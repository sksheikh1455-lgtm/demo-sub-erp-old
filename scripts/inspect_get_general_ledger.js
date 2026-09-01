import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_general_ledger';
  `);
  
  if (res.rows.length > 0) {
    console.log(res.rows[0].definition);
  } else {
    console.log("Function get_general_ledger not found!");
  }

  await client.end();
}

run().catch(console.error);
