import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Searching for functions containing '.data' or '->' or similar on 'invoice' or other variables...");

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%invoice%' AND prosrc ILIKE '%.data%'
  `);

  console.log(`Found ${res.rows.length} functions:`);
  for (const row of res.rows) {
    console.log(`- ${row.proname}`);
  }

  // Let's also print their code or search for trigger functions
  for (const row of res.rows) {
    console.log(`\n=======================================\nCode of ${row.proname}:\n=========================================`);
    console.log(row.prosrc);
  }

  await client.end();
}
run();
