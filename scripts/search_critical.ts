import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%CRITICAL SECURITY ALERT%';
    `);
    for (const r of res.rows) {
      console.log('FOUND IN: ' + r.proname);
      console.log(r.prosrc);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
