import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('=== FINDING ALL ACTIVE TRIGGERS ===');
  const triggerRes = await client.query(`
    SELECT 
      event_object_table AS table_name, 
      trigger_name, 
      action_statement, 
      action_orientation, 
      action_timing
    FROM information_schema.triggers
    ORDER BY event_object_table, trigger_name;
  `);
  console.log(triggerRes.rows);

  console.log('\n=== EXAMINING TRIGGER FUNCTIONS RELATED TO BILLS OR IMMUTABILITY ===');
  const funcRes = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN ('enforce_accounting_immutability', 'post_invoice', 'post_bill', 'enforce_immutability');
  `);
  for (const row of funcRes.rows) {
    console.log(`\n--- FUNCTION: ${row.proname} ---`);
    console.log(row.prosrc);
  }

  await client.end();
}
run().catch(console.error);
