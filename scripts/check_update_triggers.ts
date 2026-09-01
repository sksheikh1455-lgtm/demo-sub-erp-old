import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_triggerdef(oid) as def FROM pg_trigger WHERE tgname = 'block_update_journals_integrity';
    `);
    console.log(res.rows[0]?.def);
    const res2 = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'strict_audit_block_update';
    `);
    console.log(res2.rows[0]?.prosrc);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
