import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT 
        event_object_table AS table_name,
        trigger_name,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'docs_inventory_transactions'
      ORDER BY trigger_name;
    `);
    console.log('Active Triggers for docs_inventory_transactions:');
    for (const row of rows) {
      console.log(`Trigger: ${row.trigger_name} | Timing: ${row.action_timing} | Statement: ${row.action_statement}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
