import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT tgname, pg_get_triggerdef(oid) as def 
      FROM pg_trigger 
      WHERE tgrelid = 'docs_contacts'::regclass;
    `);
    console.log("Triggers on docs_contacts:");
    console.table(res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
