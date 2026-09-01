import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Listing all active triggers on key tables and checking the referenced columns...");

  const res = await client.query(`
    SELECT 
      event_object_table AS table_name,
      trigger_name,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table IN (
      'docs_invoices', 'docs_bills', 'docs_payments', 
      'docs_credit_notes', 'docs_journals', 'docs_inventory_adjustments'
    )
    ORDER BY table_name, trigger_name
  `);

  for (const row of res.rows) {
    const triggerFn = row.action_statement.replace(/EXECUTE FUNCTION |EXECUTE PROCEDURE /i, '').trim();
    // Get the source of the function
    const fnRes = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = $1
    `, [triggerFn.replace('()', '')]);

    const code = fnRes.rows[0]?.prosrc || '';
    if (code.includes('.data') || code.includes('data->') || code.includes('data-') || code.includes('->\'data\'')) {
      console.log(`[ALERT] Table: ${row.table_name} | Trigger: ${row.trigger_name} | Func: ${triggerFn}`);
      console.log(`--> Function contains '.data' or JSON access to data!`);
    } else {
      console.log(`[OK] Table: ${row.table_name} | Trigger: ${row.trigger_name} | Func: ${triggerFn}`);
    }
  }

  await client.end();
}
run();
