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
    for (const r of res.rows) {
      if (r.def.includes('DELETE')) {
        console.log('FOUND DELETE IN:', r.def);
      } else {
        console.log('NO DELETE FOUND.');
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
