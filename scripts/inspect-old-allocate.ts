import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'allocate_payment_to_invoice' AND oidvectortypes(proargtypes) = 'text, text, numeric, text'
  `);
  if (res.rows.length > 0) {
    console.log("Definition of old allocate_payment_to_invoice:");
    console.log(res.rows[0].prosrc);
  } else {
    console.log("Old allocate_payment_to_invoice not found!");
  }

  await client.end();
}
run();
