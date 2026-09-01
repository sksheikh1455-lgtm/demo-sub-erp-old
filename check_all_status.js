import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT proname, prosrc
      FROM pg_proc
      WHERE prosrc ILIKE '%NEW.status%';
    `);
    console.log(res.rows.map(r => r.proname));
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
