import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('=== SEARCHING FOR TRIGGER FUNCTIONS ASSUING NEW.status ===');
  const res = await client.query(`
    SELECT DISTINCT trigger_name, event_object_table, action_statement
    FROM information_schema.triggers;
  `);
  
  const funcNamesRes = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%new.status%' OR prosrc ILIKE '%old.status%';
  `);

  console.log('Functions mentioning NEW.status or OLD.status:');
  for (const f of funcNamesRes.rows) {
     console.log(`\n--- Function: ${f.proname} ---`);
     // Find tables where this function is used as a trigger
     const trRes = await client.query(`
        SELECT DISTINCT tgrelid::regclass AS table_name, tgname AS trigger_name
        FROM pg_trigger
        JOIN pg_proc ON tgfoid = pg_proc.oid
        WHERE proname = $1;
     `, [f.proname]);
     console.log('Attached to tables:', trRes.rows);
     console.log('First 300 chars of source:', f.prosrc.substring(0, 500));
  }

  await client.end();
}
run().catch(console.error);
