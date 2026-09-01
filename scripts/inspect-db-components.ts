import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("--- TRIGGERS ---");
  const triggersRes = await client.query(`
    SELECT 
      event_object_table AS table_name, 
      trigger_name, 
      action_statement, 
      action_timing, 
      event_manipulation
    FROM information_schema.triggers
    WHERE event_object_table LIKE 'docs_%'
  `);
  console.log(JSON.stringify(triggersRes.rows, null, 2));

  console.log("--- TRIGGER FUNCTIONS DEFINITIONS ---");
  const funcsRes = await client.query(`
    SELECT 
      proname AS function_name, 
      prosrc AS definition
    FROM pg_proc 
    JOIN pg_namespace n ON n.oid = pronamespace
    WHERE n.nspname = 'public' 
      AND (proname LIKE '%trigger%' OR proname LIKE '%protect%' OR proname LIKE '%audit%' OR proname LIKE '%sequence%' OR proname LIKE '%post_%')
  `);
  for (const row of funcsRes.rows) {
    console.log(`\n==================\nFUNCTION: ${row.function_name}\n==================`);
    console.log(row.definition);
  }

  await client.end();
}
run();
