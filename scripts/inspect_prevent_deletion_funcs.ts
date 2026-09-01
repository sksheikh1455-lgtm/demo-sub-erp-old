import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'prevent_deletion_audit' OR proname = 'prevent_any_deletion_on_journal_lines' OR proname LIKE '%prevent%';
    `);
    console.log("=== PREVENT FUNCTIONS ===");
    for (const r of res.rows) {
      console.log(r.prosrc);
      console.log("-".repeat(40));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
