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
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table IN ('docs_inventory_transactions', 'docs_products');
  `);
  console.log("Triggers on docs_inventory_transactions and docs_products:", res.rows);

  await client.end();
}
run();
