import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  try {
    await c.connect();
    const res = await c.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables in public schema:");
    console.log(res.rows.map(r => r.table_name).join(", "));
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await c.end();
  }
}

run();
