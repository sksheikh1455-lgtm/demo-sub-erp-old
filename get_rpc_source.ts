import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT p.proname, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_partner_summary'
    `);
    console.log(res.rows[0].prosrc);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
