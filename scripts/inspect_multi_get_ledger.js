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
    WHERE n.nspname = 'public' 
      AND p.proname = 'get_general_ledger'
      AND array_length(p.proargtypes, 1) > 4;
  `);
  
  if (res.rows.length > 0) {
    res.rows.forEach((row, i) => {
      console.log(`--- MATCH ${i+1} ---`);
      console.log(row.definition);
    });
  } else {
    console.log("Multi-param get_general_ledger not found!");
  }

  await client.end();
}

run().catch(console.error);
