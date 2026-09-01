import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("---- docs_journals Columns ----");
  const colsRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_journals';
  `);
  colsRes.rows.forEach(row => {
    console.log(`${row.column_name}: ${row.data_type}`);
  });

  console.log("\n---- docs_journals Triggers ----");
  const trigRes = await client.query(`
    SELECT trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'docs_journals';
  `);
  trigRes.rows.forEach(row => {
    console.log(`Trigger: ${row.trigger_name}, Event: ${row.event_manipulation}, Timing: ${row.action_timing}`);
    console.log(`Statement: ${row.action_statement}`);
    console.log("----------------------------");
  });

  await client.end();
}

run().catch(console.error);
