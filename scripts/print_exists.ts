import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'post_credit_note';
    `);
    console.log(res.rows[0].def.split('\n').filter(l => l.includes('Already posted') || l.includes('EXISTS')).join('\n'));
  } catch (err) { } finally { await client.end(); }
}
main();
