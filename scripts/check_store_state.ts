import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ 
    connectionString,
    connectionTimeoutMillis: 10000 
  });
  
  try {
    console.log("Connecting...");
    await c.connect();
    console.log("Connected successfully to Supabase DB!");

    const res = await c.query(`
      SELECT id, pg_column_size(data) as size, "updatedAt" FROM "StoreState" WHERE id = 'legacy_state'
    `);
    
    if (res.rows.length === 0) {
      console.log("No legacy_state row found in StoreState table!");
    } else {
      console.log("Found legacy_state row:");
      console.log(res.rows[0]);
    }
  } catch (err: any) {
    console.error("Database error:", err.message || err);
  } finally {
    await c.end().catch(() => {});
  }
}

run();
