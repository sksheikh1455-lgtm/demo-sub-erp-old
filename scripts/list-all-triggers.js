
import pkg from 'pg';
const { Client } = pkg;

async function listTriggers() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL
  });
  await client.connect();

  const res = await client.query(`
    SELECT 
        event_object_table AS table_name, 
        trigger_name, 
        action_timing,
        event_manipulation,
        action_statement
    FROM information_schema.triggers 
    /* WHERE event_object_table NOT LIKE 'pg_%' AND event_object_table NOT LIKE 'sql_%' */
    ORDER BY event_object_table, trigger_name;
  `);

  console.table(res.rows);

  await client.end();
}

listTriggers().catch(console.error);
