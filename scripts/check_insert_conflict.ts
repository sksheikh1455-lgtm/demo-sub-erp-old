import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'post_invoice';
    `);
    const fn = res.rows[0].def;
    console.log(fn.split('\n').filter(l => l.includes('INSERT INTO docs_journal_lines') || l.includes('ON CONFLICT')).join('\n'));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
