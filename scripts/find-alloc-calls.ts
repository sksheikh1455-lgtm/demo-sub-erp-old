import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Searching for functions calling 'allocate_payment_to_invoice'...");

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%allocate_payment_to_invoice%'
  `);

  console.log(`Found ${res.rows.length} functions calling it:`);
  for (const row of res.rows) {
    console.log(`- ${row.proname}`);
    console.log(row.prosrc);
  }

  await client.end();
}
run();
