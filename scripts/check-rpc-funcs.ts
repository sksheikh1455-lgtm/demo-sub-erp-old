import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Searching for definitions and signatures of process_payment_and_allocate in database...");

  const res = await client.query(`
    SELECT oid, proname, proargnames, oidvectortypes(proargtypes) AS arg_types, prosrc 
    FROM pg_proc 
    WHERE proname = 'process_payment_and_allocate'
  `);

  console.log(`Found ${res.rows.length} matches:`);
  for (const row of res.rows) {
    console.log(`-----------------------------------------------`);
    console.log(`OID: ${row.oid} | Name: ${row.proname}`);
    console.log(`Arg Names: ${JSON.stringify(row.proargnames)}`);
    console.log(`Arg Types: ${row.arg_types}`);
    console.log(`Source code snippet (first 15 lines):`);
    console.log(row.prosrc.split('\n').slice(0, 15).join('\n'));
  }

  await client.end();
}
run();
