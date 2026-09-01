import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_triggerdef(oid) as def FROM pg_trigger WHERE tgname = 'prevent_any_deletion_on_journal_lines';
    `);
    console.log(res.rows[0]?.def);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
