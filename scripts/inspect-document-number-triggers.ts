import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT 
      event_object_table AS table_name,
      trigger_name,
      action_timing,
      event_manipulation,
      action_statement
    FROM information_schema.triggers
    WHERE action_statement LIKE '%generate_document_number%' OR action_statement LIKE '%generate_invoice_number%'
    ORDER BY event_object_table, trigger_name
  `);
  
  console.log("Triggers calling generate_document_number or generate_invoice_number:");
  for (const row of res.rows) {
    console.log(`Table: ${row.table_name} | Trigger: ${row.trigger_name} | Action: ${row.action_statement}`);
  }

  await client.end();
}
run();
