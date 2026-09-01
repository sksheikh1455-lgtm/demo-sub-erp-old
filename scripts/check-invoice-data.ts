import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Checking overloaded signatures or other functions accessing .data or ->'data' on invoices...");

  // 1. List all definitions of allocate_payment_to_invoice
  const res1 = await client.query(`
    SELECT oid, proname, oidvectortypes(proargtypes) AS arg_types, prosrc 
    FROM pg_proc 
    WHERE proname = 'allocate_payment_to_invoice'
  `);
  console.log(`\nFound ${res1.rows.length} versions of allocate_payment_to_invoice:`);
  for (const row of res1.rows) {
    console.log(`OID: ${row.oid} | Args: ${row.arg_types}`);
    if (row.prosrc.includes('.data')) {
      console.log("--> THIS ONE STILL USES .data!");
    }
  }

  // 2. List any other functions with 'invoice' in arguments or source that access 'data'
  const res2 = await client.query(`
    SELECT oid, proname, oidvectortypes(proargtypes) AS arg_types, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%invoice.data%' OR prosrc ILIKE '%invoice->%' OR prosrc ILIKE '%v_invoice.data%' OR prosrc ILIKE '%v_invoice->%'
  `);
  console.log(`\nFound ${res2.rows.length} functions referencing invoice.data or similar:`);
  for (const row of res2.rows) {
    console.log(`OID: ${row.oid} | Name: ${row.proname} | Args: ${row.arg_types}`);
  }

  await client.end();
}
run();
