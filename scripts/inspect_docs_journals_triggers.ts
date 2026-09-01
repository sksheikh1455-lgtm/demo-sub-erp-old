import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("=== TRIGGERS ON docs_journals ===");
    const res = await client.query(`
      SELECT trigger_name, action_statement, action_timing, event_manipulation 
      FROM information_schema.triggers 
      WHERE event_object_table = 'docs_journals'
      ORDER BY trigger_name
    `);
    console.table(res.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
