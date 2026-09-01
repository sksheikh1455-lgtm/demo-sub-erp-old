import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Searching pg_proc for inventory update logic...");
  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%quantity_on_hand%' 
       OR proname ILIKE '%inventory%' 
       OR proname ILIKE '%stock%'
       OR proname ILIKE '%update_average_cost%'
  `);
  
  for (const row of res.rows) {
    console.log(`--- Function: ${row.proname} ---`);
    console.log(row.prosrc.slice(0, 1000)); // Show beginning
    if (row.prosrc.length > 1000) {
      console.log("...[truncated]");
    }
  }

  await client.end();
}
run();
